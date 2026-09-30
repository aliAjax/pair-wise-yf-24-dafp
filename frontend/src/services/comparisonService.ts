import {
  bumpWatermark,
  casWriteCollection,
  casWriteMany,
  readCollection,
  withGlobalLock,
  type CollectionSnapshot
} from "../api/storage";
import { policyDocumentApi } from "../api/PolicyDocument";
import { policySectionApi } from "../api/PolicySection";
import { diffResultApi } from "../api/DiffResult";
import { reviewNoteApi } from "../api/ReviewNote";
import { comparisonBatchApi } from "../api/ComparisonBatch";
import type { PolicyDocument } from "../types/PolicyDocument";
import type { DiffResult } from "../types/DiffResult";
import type { ReviewNote } from "../types/ReviewNote";
import type { ComparisonBatch } from "../types/ComparisonBatch";
import { BatchStatus, BatchRetryReason } from "../constants/BatchStatus";
import { ReviewNoteLinkStatus } from "../constants/ReviewNoteLinkStatus";
import { createComparisonBatchForm } from "../constructors/ComparisonBatchConstructor";
import { DomainError } from "../utils/exceptions";
import { writeLog } from "../utils/logger";
import { alignSections, computeDiffRow, type SectionAlignment } from "./sectionAlignment";
import { computeSourceHash } from "./sourceFingerprint";
import { relinkReviewNotes } from "./noteRelink";
import { shouldFailSection } from "./failureInjection";

export interface ComputeProgress {
  batchId: number;
  completed: number;
  total: number;
  status: BatchStatus;
}

export interface ComputeOptions {
  perItemDelayMs?: number;
  /** 使用 Web Worker 计算（主线程只负责增量落盘）；测试/Node 环境自动降级 */
  useWorker?: boolean;
}

const TERMINAL_STATUSES: ReadonlySet<BatchStatus> = new Set([
  BatchStatus[3], // COMMITTED
  BatchStatus[5] // INVALIDATED
]);

const INVALIDATABLE_STATUSES: ReadonlySet<BatchStatus> = new Set([
  BatchStatus[0], // COMPUTING
  BatchStatus[1], // READY
  BatchStatus[2], // COMMITTING
  BatchStatus[4] // FAILED
]);

function nowIso(): string {
  return new Date().toISOString();
}

function currentCommittedBatch(
  batches: ComparisonBatch[],
  oldDocumentId: number,
  newDocumentId: number
): ComparisonBatch | null {
  return (
    batches
      .filter(
        (batch) =>
          batch.status === BatchStatus[3] &&
          batch.old_document_id === oldDocumentId &&
          batch.new_document_id === newDocumentId
      )
      .sort((a, b) => (b.committed_at ?? "").localeCompare(a.committed_at ?? ""))[0] ?? null
  );
}

function getSectionsFor(documentId: number) {
  return policySectionApi
    .snapshot()
    .rows.filter((section) => section.document_id === documentId);
}

function markInvalidated(
  snap: CollectionSnapshot<ComparisonBatch>,
  batch: ComparisonBatch,
  reason: BatchRetryReason,
  detail: string
): void {
  const updated: ComparisonBatch = {
    ...batch,
    status: BatchStatus[5],
    retry_reason: reason,
    retry_detail: detail,
    updated_at: nowIso()
  };
  casWriteCollection({
    name: "comparisonBatch",
    expectedVersion: snap.version,
    rows: snap.rows.map((row) => (row.id === batch.id ? updated : row))
  });
  writeLog("ComparisonBatch", 4, `批次#${batch.id} 作废：${detail}`);
}

/** 发起一次比较：进入待生效区（COMPUTING），锁存来源指纹与生效基线 */
export function startBatch(oldDocumentId: number, newDocumentId: number): ComparisonBatch {
  return withGlobalLock(() => {
    const docs = policyDocumentApi.snapshot().rows;
    const oldDoc = docs.find((doc) => doc.id === oldDocumentId);
    const newDoc = docs.find((doc) => doc.id === newDocumentId);
    if (!oldDoc || !newDoc) throw new DomainError("VALIDATION_FAILED", { oldDocumentId, newDocumentId });
    if (oldDocumentId === newDocumentId) throw new DomainError("VALIDATION_FAILED", { same: true });

    const snap = comparisonBatchApi.snapshot();
    // 注意：不限制同一文档对的活动批次数——两个标签页可能同时算，
    // 谁先生效由提交时的基线闸门裁决，后提交的旧批次作废而非覆盖新表。
    const baseline = currentCommittedBatch(snap.rows, oldDocumentId, newDocumentId);
    const id = bumpWatermark(0);
    const batch = createComparisonBatchForm({
      id,
      old_document_id: oldDocumentId,
      new_document_id: newDocumentId,
      status: BatchStatus[0],
      old_source_hash: computeSourceHash(oldDoc, getSectionsFor(oldDocumentId)),
      new_source_hash: computeSourceHash(newDoc, getSectionsFor(newDocumentId)),
      baseline_batch_id: baseline?.id ?? null,
      attempts: 1
    });

    casWriteCollection({
      name: "comparisonBatch",
      expectedVersion: snap.version,
      rows: [...snap.rows, batch]
    });
    writeLog("ComparisonBatch", 0, `批次#${batch.id} 文档 ${oldDocumentId}->${newDocumentId}`);
    return { ...batch };
  });
}

/** 计算前闸门：来源指纹复核 + 基线复核，返回对齐结果并预留差异行 id 区间 */
function prepareComputation(batchId: number): {
  batch: ComparisonBatch;
  alignments: SectionAlignment[];
  pending: SectionAlignment[];
} {
  const snap = comparisonBatchApi.snapshot();
  const found = snap.rows.find((row) => row.id === batchId);
  if (!found) throw new DomainError("VALIDATION_FAILED", { batchId });
  let batch = found;

  if (batch.status === BatchStatus[5]) {
    // 已按具体缘由作废：版本变化时保留 SOURCE_VERSION_CHANGED 语义，调用方据此提示重试
    throw batch.retry_reason === BatchRetryReason[0]
      ? new DomainError("SOURCE_VERSION_CHANGED", { batchId })
      : batch.retry_reason === BatchRetryReason[1] || batch.retry_reason === BatchRetryReason[2]
        ? new DomainError("BASELINE_CONFLICT", { batchId })
        : new DomainError("BATCH_INVALIDATED", {});
  }
  if (batch.status === BatchStatus[3]) throw new DomainError("BATCH_NOT_COMMITTABLE", {});

  const oldDoc = policyDocumentApi.snapshot().rows.find((doc) => doc.id === batch.old_document_id);
  const newDoc = policyDocumentApi.snapshot().rows.find((doc) => doc.id === batch.new_document_id);
  if (!oldDoc || !newDoc) throw new DomainError("VALIDATION_FAILED", {});

  // 版次一变 -> 作废待生效结果并留下重试缘由
  if (
    computeSourceHash(oldDoc, getSectionsFor(oldDoc.id)) !== batch.old_source_hash ||
    computeSourceHash(newDoc, getSectionsFor(newDoc.id)) !== batch.new_source_hash
  ) {
    markInvalidated(
      snap,
      batch,
      BatchRetryReason[0],
      "政策来源版本已变化（文档或段落被编辑），待生效结果作废"
    );
    throw new DomainError("SOURCE_VERSION_CHANGED", { batchId });
  }

  const committed = currentCommittedBatch(snap.rows, batch.old_document_id, batch.new_document_id);
  if ((committed?.id ?? null) !== batch.baseline_batch_id) {
    markInvalidated(
      snap,
      batch,
      committed ? BatchRetryReason[2] : BatchRetryReason[1],
      `生效基线已由 #${batch.baseline_batch_id ?? "无"} 变为 #${committed?.id ?? "无"}`
    );
    throw new DomainError("BASELINE_CONFLICT", { batchId });
  }

  const alignments = alignSections(getSectionsFor(batch.old_document_id), getSectionsFor(batch.new_document_id));

  // 首次运行预留连续行 id；重试复用，不重复发号
  if (batch.diff_row_ids.length === 0) {
    const reservedFrom = bumpWatermark(alignments.length - 1);
    batch = {
      ...batch,
      diff_row_ids: alignments.map((_, index) => reservedFrom + index),
      updated_at: nowIso()
    };
    casWriteCollection({
      name: "comparisonBatch",
      expectedVersion: snap.version,
      rows: snap.rows.map((row) => (row.id === batchId ? batch : row))
    });
    writeLog("ComparisonBatch", 5, `批次#${batchId} 预留 ${alignments.length} 个差异行`);
  }

  const completed = new Set(batch.completed_sections);
  const pending = alignments.filter((alignment) => !completed.has(alignment.key));
  return { batch, alignments, pending };
}

/**
 * 执行（或断点续算）批次差异计算。
 * 每条段落完成后立即把“差异行 + 批次进度”增量落盘：
 * 失败时已完成结果原样保留，重试只补没做完的部分。
 */
export async function runBatchComputation(
  batchId: number,
  onProgress?: (progress: ComputeProgress) => void,
  options: ComputeOptions = {}
): Promise<ComparisonBatch> {
  const prepared = withGlobalLock(() => prepareComputation(batchId));
  const { alignments, pending } = prepared;
  let batch = prepared.batch;

  const rowIdByKey = new Map<string, number>();
  alignments.forEach((alignment, index) => {
    rowIdByKey.set(alignment.key, batch.diff_row_ids[index]);
  });

  /** 单条结果增量落盘（worker 与同步降级共用），返回更新后的批次 */
  const persistRow = (key: string, row: DiffResult, total: number): ComparisonBatch =>
    withGlobalLock(() => {
      const diffSnap = diffResultApi.snapshot();
      const nextRows = [...diffSnap.rows.filter((item) => item.id !== row.id), row];

      const batchSnap = comparisonBatchApi.snapshot();
      const current = batchSnap.rows.find((item) => item.id === batchId);
      if (!current) throw new DomainError("BATCH_INVALIDATED", {});
      const completedSections = Array.from(new Set([...current.completed_sections, key]));
      const allDone = completedSections.length === total;
      const updated: ComparisonBatch = {
        ...current,
        completed_sections: completedSections,
        status: allDone ? BatchStatus[1] : BatchStatus[0],
        last_error: null,
        retry_reason: null,
        retry_detail: null,
        updated_at: nowIso()
      };
      casWriteMany([
        { name: "diffResult", expectedVersion: diffSnap.version, rows: nextRows },
        {
          name: "comparisonBatch",
          expectedVersion: batchSnap.version,
          rows: batchSnap.rows.map((item) => (item.id === batchId ? updated : item))
        }
      ]);
      writeLog("ComparisonBatch", 1, `批次#${batchId} 段落 ${key} (${completedSections.length}/${total})`);
      return updated;
    });

  const failBatch = (key: string, message: string): ComparisonBatch => {
    let updated = batch;
    withGlobalLock(() => {
      const batchSnap = comparisonBatchApi.snapshot();
      const current = batchSnap.rows.find((item) => item.id === batchId);
      if (!current || TERMINAL_STATUSES.has(current.status)) return;
      updated = {
        ...current,
        status: BatchStatus[4],
        last_error: message,
        retry_reason: BatchRetryReason[3],
        retry_detail: `段落 ${key} 计算失败，已保留 ${current.completed_sections.length} 个已完成段落，重试只补剩余部分`,
        updated_at: nowIso()
      };
      casWriteCollection({
        name: "comparisonBatch",
        expectedVersion: batchSnap.version,
        rows: batchSnap.rows.map((item) => (item.id === batchId ? updated : item))
      });
      writeLog("ComparisonBatch", 2, `批次#${batchId} ${message}`);
    });
    return updated;
  };

  const emitProgress = (snapshot: ComparisonBatch) =>
    onProgress?.({
      batchId,
      completed: snapshot.completed_sections.length,
      total: alignments.length,
      status: snapshot.status
    });

  if (options.useWorker && typeof Worker !== "undefined") {
    const { runWorkerComputation } = await import("./diffWorkerClient");
    batch = await runWorkerComputation({
      batchId,
      alignments,
      pending,
      rowIds: alignments.map((alignment) => rowIdByKey.get(alignment.key) as number),
      oldDocumentId: batch.old_document_id,
      newDocumentId: batch.new_document_id,
      onRow: (key, row) => {
        batch = persistRow(key, row, alignments.length);
        emitProgress(batch);
      },
      onError: (key, message) => {
        batch = failBatch(key, message);
        emitProgress(batch);
      }
    });
    if (batch.status === BatchStatus[4]) {
      throw new DomainError("VALIDATION_FAILED", { batchId, message: batch.last_error });
    }
    return { ...batch };
  }

  for (const alignment of pending) {
    if (options.perItemDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.perItemDelayMs));
    }
    try {
      if (shouldFailSection(alignment.key)) {
        throw new Error(`故障注入：段落 ${alignment.key} 计算失败`);
      }
      const row = computeDiffRow(alignment, {
        batchId,
        oldDocumentId: batch.old_document_id,
        newDocumentId: batch.new_document_id,
        nextRowId: () => rowIdByKey.get(alignment.key) as number,
        now: nowIso
      });
      batch = persistRow(alignment.key, row, alignments.length);
      emitProgress(batch);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      batch = failBatch(alignment.key, message);
      emitProgress(batch);
      throw new DomainError("VALIDATION_FAILED", { batchId, key: alignment.key, message });
    }
  }

  return { ...batch };
}

export interface CommitOutcome {
  batch: ComparisonBatch;
  replacedBatchId: number | null;
  notesMatched: number;
  notesOrphaned: number;
  activeRows: DiffResult[];
}

/**
 * 提交待生效批次：复核来源指纹 + 基线未变后，
 * 把差异结果、批次状态、审阅备注一次性原子换为当前结果。
 */
export function commitBatch(batchId: number): CommitOutcome {
  return withGlobalLock(() => {
    const batchSnap = comparisonBatchApi.snapshot();
    const batch = batchSnap.rows.find((row) => row.id === batchId);
    if (!batch) throw new DomainError("VALIDATION_FAILED", { batchId });
    if (batch.status === BatchStatus[5]) {
      throw batch.retry_reason === BatchRetryReason[0]
        ? new DomainError("SOURCE_VERSION_CHANGED", { batchId })
        : batch.retry_reason === BatchRetryReason[1] || batch.retry_reason === BatchRetryReason[2]
          ? new DomainError("BASELINE_CONFLICT", { batchId })
          : new DomainError("BATCH_INVALIDATED", {});
    }
    if (batch.status !== BatchStatus[1]) throw new DomainError("BATCH_NOT_COMMITTABLE", { status: batch.status });

    // 闸门 1：政策来源确认没动
    const docs = policyDocumentApi.snapshot().rows;
    const oldDoc = docs.find((doc) => doc.id === batch.old_document_id);
    const newDoc = docs.find((doc) => doc.id === batch.new_document_id);
    if (!oldDoc || !newDoc) throw new DomainError("VALIDATION_FAILED", {});
    if (
      computeSourceHash(oldDoc, getSectionsFor(oldDoc.id)) !== batch.old_source_hash ||
      computeSourceHash(newDoc, getSectionsFor(newDoc.id)) !== batch.new_source_hash
    ) {
      markInvalidated(batchSnap, batch, BatchRetryReason[0], "提交复核时发现来源版本已变化");
      throw new DomainError("SOURCE_VERSION_CHANGED", { batchId });
    }

    // 闸门 2：基线批次没被其他标签页换掉
    const committed = currentCommittedBatch(batchSnap.rows, batch.old_document_id, batch.new_document_id);
    const committedId = committed?.id ?? null;
    if (committedId !== batch.baseline_batch_id) {
      markInvalidated(
        batchSnap,
        batch,
        committedId ? BatchRetryReason[2] : BatchRetryReason[1],
        `另一个标签页已先生效批次 #${committedId ?? "?"}`
      );
      throw new DomainError("BASELINE_CONFLICT", { batchId });
    }

    // 换表：只替换同一文档对的生效行，其他文档对的结果不受影响
    const diffSnap = diffResultApi.snapshot();
    const newRows = diffSnap.rows.filter((row) => row.batch_id === batchId);
    const otherRows = diffSnap.rows.filter(
      (row) =>
        !(
          row.old_document_id === batch.old_document_id &&
          row.new_document_id === batch.new_document_id
        )
    );

    // 备注：沿版次链携带——所有以 new_document_id 为新版终点的生效批次
    // （doc2 在上一轮是新版、在下一轮是旧版，链上的备注都要继续跟随）
    // 再加全局仍待处理的 ORPHANED 备注。
    const noteSnap = reviewNoteApi.snapshot();
    const ancestorIds = new Set<number>();
    {
      const queue = [batch.new_document_id, batch.old_document_id];
      const seen = new Set<number>();
      while (queue.length) {
        const docId = queue.shift() as number;
        if (seen.has(docId)) continue;
        seen.add(docId);
        for (const ancestor of batchSnap.rows.filter(
          (item) => item.status === BatchStatus[3] && item.new_document_id === docId
        )) {
          ancestorIds.add(ancestor.id);
          queue.push(ancestor.old_document_id);
        }
      }
    }
    const baselineRows = diffSnap.rows.filter((row) => ancestorIds.has(row.batch_id));
    const carriedNotes = noteSnap.rows.filter(
      (note) =>
        note.link_status === ReviewNoteLinkStatus[1] || ancestorIds.has(note.batch_id)
    );
    const carriedIds = new Set(carriedNotes.map((note) => note.id));
    const untouchedNotes = noteSnap.rows.filter((note) => !carriedIds.has(note.id));
    const relink = relinkReviewNotes(carriedNotes, baselineRows, newRows, batchId);

    const committedAt = nowIso();
    const nextBatch: ComparisonBatch = {
      ...batch,
      status: BatchStatus[3],
      committed_at: committedAt,
      updated_at: committedAt
    };

    casWriteMany([
      { name: "diffResult", expectedVersion: diffSnap.version, rows: [...otherRows, ...newRows] },
      {
        name: "comparisonBatch",
        expectedVersion: batchSnap.version,
        rows: batchSnap.rows.map((row) => (row.id === batchId ? nextBatch : row))
      },
      { name: "reviewNote", expectedVersion: noteSnap.version, rows: [...untouchedNotes, ...relink.notes] }
    ]);

    writeLog("ComparisonBatch", 3, `批次#${batchId} 生效，替换基线 ${committedId ?? "无"}`);
    writeLog("ComparisonBatch", 6, `批次#${batchId} 备注匹配 ${relink.matched}，待处理 ${relink.orphaned}`);

    return {
      batch: { ...nextBatch },
      replacedBatchId: committedId,
      notesMatched: relink.matched,
      notesOrphaned: relink.orphaned,
      activeRows: newRows.map((row) => ({ ...row }))
    };
  });
}

/** 文档/段落写操作后调用：受影响的待生效批次一律作废并记录缘由 */
export function invalidateBatchesForDocument(documentId: number, detail: string): number {
  return withGlobalLock(() => {
    const snap = comparisonBatchApi.snapshot();
    let count = 0;
    const rows = snap.rows.map((batch) => {
      if (
        !INVALIDATABLE_STATUSES.has(batch.status) ||
        (batch.old_document_id !== documentId && batch.new_document_id !== documentId)
      ) {
        return batch;
      }
      count += 1;
      writeLog("ComparisonBatch", 4, `批次#${batch.id} 作废：${detail}`);
      return {
        ...batch,
        status: BatchStatus[5] as BatchStatus,
        retry_reason: BatchRetryReason[0] as BatchRetryReason,
        retry_detail: detail,
        updated_at: nowIso()
      };
    });
    if (count > 0) {
      casWriteCollection({ name: "comparisonBatch", expectedVersion: snap.version, rows });
    }
    return count;
  });
}

export function readBatch(batchId: number): ComparisonBatch | null {
  return comparisonBatchApi.snapshot().rows.find((row) => row.id === batchId) ?? null;
}

export function listBatchSnapshots() {
  return {
    batches: comparisonBatchApi.snapshot().rows,
    diffs: readCollection<DiffResult>("diffResult").rows,
    notes: reviewNoteApi.snapshot().rows,
    documents: policyDocumentApi.snapshot().rows
  };
}
