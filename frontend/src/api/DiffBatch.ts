import { mockData } from "../mocks/seedData";
import type { DiffBatch } from "../types/DiffBatch";
import { ERROR_CODES } from "../constants/errorCodes";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { AppError } from "../utils/errors";
import { createDefaultDiffBatch } from "../constructors/DiffBatchConstructor";

const STORAGE_KEY = "policy-diff:diff-batches";
const endpoint = "/api/diff-batches";

function seedBatches(): DiffBatch[] {
  const now = "2026-06-12T09:00:00Z";
  return [
    createDefaultDiffBatch({
      id: 1,
      old_document_id: 1,
      new_document_id: 2,
      status: "ACTIVE",
      source_fingerprint: "seed-legacy-active-batch",
      base_active_batch_id: null,
      results: mockData.diffResult.map((result) => ({ ...result })),
      notes: mockData.reviewNote.map((note) => ({ ...note })),
      unmatched_notes: [],
      progress: { total: mockData.diffResult.length, done: mockData.diffResult.length },
      retry_reason: null,
      created_at: now,
      updated_at: now,
      promoted_at: now
    })
  ];
}

function readStore(): DiffBatch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) return JSON.parse(raw) as DiffBatch[];
  } catch {
    // 本地存储损坏时回退到种子数据，保证页面可用
  }
  const seeded = seedBatches();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeStore(batches: DiffBatch[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(batches));
}

export async function listDiffBatches(): Promise<DiffBatch[]> {
  if (typeof fetch !== "undefined" && endpoint.startsWith("/api") && false) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) return await res.json();
    } catch {
      // Local mock fallback keeps the UI available during offline review.
    }
  }
  return readStore().map((batch) => ({ ...batch }));
}

export async function saveDiffBatches(batches: DiffBatch[]): Promise<DiffBatch[]> {
  writeStore(batches);
  console.info(LOG_TEMPLATES.DiffBatch[1], { count: batches.length });
  return batches.map((batch) => ({ ...batch }));
}

/**
 * 生效事务（compare-and-swap）：
 * 1. 批次必须仍在待生效区；
 * 2. 政策来源指纹必须与待生效时一致（来源没动过）；
 * 3. 当前生效批次必须仍是本批次计算时依据的那一版（防两标签页并发覆盖）。
 * 全部通过才一次性换为当前结果：旧生效批次作废，本批次置为 ACTIVE。
 */
export async function promoteDiffBatch(batchId: number, currentFingerprint: string): Promise<DiffBatch[]> {
  const batches = readStore();
  const target = batches.find((batch) => batch.id === batchId);
  if (!target) {
    throw new AppError(ERROR_CODES.BATCH_NOT_FOUND, `待生效批次 #${batchId} 不存在或已被清理`);
  }
  if (target.status !== "PENDING") {
    throw new AppError(ERROR_CODES.BATCH_NOT_PENDING, `批次 #${batchId} 状态为 ${target.status}，不能生效`);
  }
  if (currentFingerprint !== target.source_fingerprint) {
    target.status = "STALE";
    target.retry_reason = "政策来源已变更：待生效批次依据的文档正文或版次标签与当前来源不一致，请重试重新计算";
    target.updated_at = new Date().toISOString();
    writeStore(batches);
    console.warn(LOG_TEMPLATES.DiffBatch[3], { batchId, reason: "source-changed" });
    throw new AppError(ERROR_CODES.SOURCE_CHANGED);
  }
  const currentActive = batches.find((batch) => batch.status === "ACTIVE");
  if (target.base_active_batch_id !== (currentActive?.id ?? null)) {
    target.status = "STALE";
    target.retry_reason = "检测到其他标签页已先生效更新批次，早先算出的表不能覆盖新表，本批次作废，请重试";
    target.updated_at = new Date().toISOString();
    writeStore(batches);
    console.warn(LOG_TEMPLATES.DiffBatch[3], { batchId, reason: "promote-conflict" });
    throw new AppError(ERROR_CODES.PROMOTE_CONFLICT);
  }

  const now = new Date().toISOString();
  for (const batch of batches) {
    if (batch.status === "ACTIVE") {
      batch.status = "STALE";
      batch.retry_reason = `已被批次 #${target.id} 取代`;
      batch.updated_at = now;
    }
  }
  target.status = "ACTIVE";
  target.retry_reason = null;
  target.promoted_at = now;
  target.updated_at = now;
  writeStore(batches);
  console.info(LOG_TEMPLATES.DiffBatch[2], { batchId });
  return batches.map((batch) => ({ ...batch }));
}
