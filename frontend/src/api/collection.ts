import {
  bumpWatermark,
  casWriteCollection,
  readCollection,
  type CollectionName,
  type CollectionSnapshot
} from "./storage";

/** 单模型集合的本地持久化 CRUD 基类，按模型在各自 api 文件中实例化 */
export interface CollectionApi<T extends { id: number }> {
  name: CollectionName;
  list(): Promise<T[]>;
  snapshot(): CollectionSnapshot<T>;
  create(row: Omit<T, "id"> & { id?: number }): Promise<T>;
  update(id: number, patch: Partial<T>): Promise<T>;
  saveAll(rows: T[], expectedVersion: number): Promise<number>;
}

export function createCollectionApi<T extends { id: number }>(
  name: CollectionName,
  logCreate: (row: T) => void,
  logUpdate: (row: T) => void
): CollectionApi<T> {
  function snapshot(): CollectionSnapshot<T> {
    return readCollection<T>(name);
  }

  async function list(): Promise<T[]> {
    return snapshot().rows.map((row) => ({ ...row }));
  }

  async function create(row: Omit<T, "id"> & { id?: number }): Promise<T> {
    const snap = snapshot();
    const id = row.id && row.id > 0 ? row.id : bumpWatermark(0);
    const created = { ...(row as object), id } as T;
    casWriteCollection({ name, expectedVersion: snap.version, rows: [...snap.rows, created] });
    logCreate(created);
    return { ...created };
  }

  async function update(id: number, patch: Partial<T>): Promise<T> {
    const snap = snapshot();
    const index = snap.rows.findIndex((row) => row.id === id);
    if (index < 0) throw new Error(`${name}#${id} 不存在`);
    const updated = { ...snap.rows[index], ...patch, id } as T;
    const rows = snap.rows.slice();
    rows[index] = updated;
    casWriteCollection({ name, expectedVersion: snap.version, rows });
    logUpdate(updated);
    return { ...updated };
  }

  /** 以调用方持有的版本号整表写入（批次换表走 service 的多集合原子写） */
  async function saveAll(rows: T[], expectedVersion: number): Promise<number> {
    return casWriteCollection({ name, expectedVersion, rows });
  }

  return { name, list, snapshot, create, update, saveAll };
}
