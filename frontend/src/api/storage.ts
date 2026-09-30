import { DomainError } from "../utils/exceptions";

/**
 * localStorage 持久化底座：
 * - 每个集合带单调 version，写入走 CAS（乐观锁），
 *   另一个标签页先写过 -> version 对不上 -> STORAGE_WRITE_STALE，拒绝用旧表覆盖新表。
 * - 跨标签页互斥锁（带 TTL），提交批次时多集合原子换表。
 * - storage 事件跨标签页广播，同标签页用 CustomEvent 广播。
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type CollectionName =
  | "policyDocument"
  | "policySection"
  | "diffResult"
  | "reviewNote"
  | "comparisonBatch";

const PREFIX = "policy-diff:";
const VERSIONS_KEY = `${PREFIX}versions`;
const META_KEY = `${PREFIX}meta`;
const LOCK_KEY = `${PREFIX}write-lock`;
const LOCK_TTL_MS = 15_000;

type Versions = Partial<Record<CollectionName, number>>;

interface LockRecord {
  holder: string;
  at: number;
  expireAt: number;
}

interface MetaRecord {
  idWatermark: number;
  seeded: boolean;
}

let backend: StorageLike | null = null;
let lockDepth = 0;
let lockHolder = "";

function memoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    }
  };
}

export function getBackend(): StorageLike {
  if (backend) return backend;
  if (typeof localStorage !== "undefined") {
    backend = localStorage;
  } else {
    backend = memoryStorage();
  }
  return backend;
}

/** 测试注入：用内存后端替换 localStorage（不触发真实存储） */
export function __useStorageBackend(injected: StorageLike | null): void {
  backend = injected;
  lockDepth = 0;
  lockHolder = "";
}

function readJson<T>(key: string, fallback: T): T {
  const raw = getBackend().getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  getBackend().setItem(key, JSON.stringify(value));
}

function readVersions(): Versions {
  return readJson<Versions>(VERSIONS_KEY, {});
}

function collectionKey(name: CollectionName): string {
  return `${PREFIX}col:${name}`;
}

export interface CollectionSnapshot<T> {
  rows: T[];
  version: number;
}

export function readCollection<T>(name: CollectionName): CollectionSnapshot<T> {
  const raw = readJson<{ rows: T[] } | null>(collectionKey(name), null);
  const version = readVersions()[name] ?? 0;
  return { rows: raw ? (raw.rows as T[]) : [], version };
}

export function isSeeded(): boolean {
  return readJson<MetaRecord>(META_KEY, { idWatermark: 0, seeded: false }).seeded;
}

export function getWatermark(): number {
  return readJson<MetaRecord>(META_KEY, { idWatermark: 0, seeded: false }).idWatermark;
}

export function setWatermark(next: number): void {
  const meta = readJson<MetaRecord>(META_KEY, { idWatermark: 0, seeded: false });
  meta.idWatermark = Math.max(meta.idWatermark, next);
  writeJson(META_KEY, meta);
}

export function markSeeded(watermark: number): void {
  const meta = readJson<MetaRecord>(META_KEY, { idWatermark: 0, seeded: false });
  meta.seeded = true;
  meta.idWatermark = Math.max(meta.idWatermark, watermark);
  writeJson(META_KEY, meta);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function emitChanged(names: CollectionName[]): void {
  if (typeof window === "undefined") return;
  for (const name of names) {
    window.dispatchEvent(new CustomEvent(`${PREFIX}changed`, { detail: { name } }));
  }
  window.dispatchEvent(new CustomEvent(`${PREFIX}changed`, { detail: { name: "*" } }));
}

/** 跨标签页 storage 事件 -> 归一化变更事件 */
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (!event.key || !event.key.startsWith(PREFIX)) return;
    const match = /^policy-diff:col:(.+)$/.exec(event.key);
    if (match) {
      emitChanged([match[1] as CollectionName]);
    } else if (event.key === VERSIONS_KEY || event.key === META_KEY) {
      emitChanged([
        "comparisonBatch",
        "diffResult",
        "reviewNote",
        "policyDocument",
        "policySection"
      ]);
    }
  });
}

export function subscribeStorage(
  listener: (name: CollectionName | "*") => void
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ name: CollectionName | "*" }>).detail;
    listener(detail.name);
  };
  window.addEventListener(`${PREFIX}changed`, handler);
  return () => window.removeEventListener(`${PREFIX}changed`, handler);
}

function randomHolder(): string {
  return `t${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function tryAcquireLock(): string {
  if (lockDepth > 0) {
    lockDepth += 1;
    return lockHolder;
  }
  const now = Date.now();
  const existing = readJson<LockRecord | null>(LOCK_KEY, null);
  const holder = randomHolder();
  if (existing && existing.holder !== holder && existing.expireAt > now) {
    throw new DomainError("STORAGE_WRITE_STALE", {
      reason: "另一个标签页正在写入",
      holder: existing.holder
    });
  }
  const record: LockRecord = {
    holder,
    at: now,
    expireAt: now + LOCK_TTL_MS
  };
  writeJson(LOCK_KEY, record);
  lockHolder = holder;
  lockDepth = 1;
  return holder;
}

function releaseLock(holder: string): void {
  lockDepth -= 1;
  if (lockDepth > 0) return;
  const current = readJson<LockRecord | null>(LOCK_KEY, null);
  if (current && current.holder === holder) {
    getBackend().removeItem(LOCK_KEY);
  }
  lockHolder = "";
}

/** 在跨标签页互斥锁内执行；异常时自动释放 */
export function withGlobalLock<T>(fn: () => T): T {
  const holder = tryAcquireLock();
  try {
    return fn();
  } finally {
    releaseLock(holder);
  }
}

export interface CollectionWrite<T> {
  name: CollectionName;
  expectedVersion: number;
  rows: T[];
}

function assertVersions(expected: Array<{ name: CollectionName; expectedVersion: number }>): void {
  const versions = readVersions();
  for (const item of expected) {
    const current = versions[item.name] ?? 0;
    if (current !== item.expectedVersion) {
      throw new DomainError("STORAGE_WRITE_STALE", {
        collection: item.name,
        expected: item.expectedVersion,
        current
      });
    }
  }
}

/** CAS 单集合写入 */
export function casWriteCollection<T>(write: CollectionWrite<T>): number {
  return withGlobalLock(() => {
    assertVersions([{ name: write.name, expectedVersion: write.expectedVersion }]);
    const versions = readVersions();
    const nextVersion = write.expectedVersion + 1;
    versions[write.name] = nextVersion;
    writeJson(collectionKey(write.name), { rows: clone(write.rows) });
    writeJson(VERSIONS_KEY, versions);
    emitChanged([write.name]);
    return nextVersion;
  });
}

/**
 * 多集合原子换表：锁内先复核全部 version，再顺序落盘。
 * 用于批次生效：差异结果、批次、备注一次性替换，绝不出现半换状态。
 */
export function casWriteMany(writes: CollectionWrite<unknown>[]): number[] {
  return withGlobalLock(() => {
    assertVersions(writes.map((w) => ({ name: w.name, expectedVersion: w.expectedVersion })));
    const versions = readVersions();
    const nextVersions: number[] = [];
    for (const write of writes) {
      const nextVersion = write.expectedVersion + 1;
      versions[write.name] = nextVersion;
      nextVersions.push(nextVersion);
      writeJson(collectionKey(write.name), { rows: clone(write.rows) });
    }
    writeJson(VERSIONS_KEY, versions);
    emitChanged(writes.map((w) => w.name));
    return nextVersions;
  });
}

export function bumpWatermark(min: number): number {
  return withGlobalLock(() => {
    const next = Math.max(getWatermark(), min) + 1;
    setWatermark(next);
    return next;
  });
}
