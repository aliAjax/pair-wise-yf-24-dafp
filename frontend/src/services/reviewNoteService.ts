import { bumpWatermark, casWriteCollection } from "../api/storage";
import { reviewNoteApi } from "../api/ReviewNote";
import { diffResultApi } from "../api/DiffResult";
import { comparisonBatchApi } from "../api/ComparisonBatch";
import type { ReviewNote } from "../types/ReviewNote";
import type { DiffResult } from "../types/DiffResult";
import { ReviewStatus } from "../constants/ReviewStatus";
import { ReviewNoteLinkStatus } from "../constants/ReviewNoteLinkStatus";
import { BatchStatus } from "../constants/BatchStatus";
import { createReviewNoteForm } from "../constructors/ReviewNoteConstructor";
import { DomainError } from "../utils/exceptions";
import { writeLog } from "../utils/logger";

export interface NoteInput {
  diff_result_id: number;
  tag: string;
  comment: string;
  reviewer: string;
}

function isActiveRow(row: DiffResult): boolean {
  const batch = comparisonBatchApi
    .snapshot()
    .rows.find((item) => item.id === row.batch_id);
  return batch?.status === BatchStatus[3]; // COMMITTED
}

/** 新建备注：只允许挂在生效批次的差异行上；待生效批次的行不能标注 */
export function createReviewNote(input: NoteInput): ReviewNote {
  const row = diffResultApi.snapshot().rows.find((item) => item.id === input.diff_result_id);
  if (!row) throw new DomainError("VALIDATION_FAILED", { diff_result_id: input.diff_result_id });
  if (!isActiveRow(row)) {
    throw new DomainError("BATCH_NOT_COMMITTABLE", { reason: "差异结果尚未生效，不能添加审阅备注" });
  }

  const timestamp = new Date().toISOString();
  const note = createReviewNoteForm({
    ...input,
    id: bumpWatermark(0),
    batch_id: row.batch_id,
    link_status: ReviewNoteLinkStatus[0],
    status: ReviewStatus[0],
    created_at: timestamp,
    updated_at: timestamp
  });

  const snap = reviewNoteApi.snapshot();
  casWriteCollection({ name: "reviewNote", expectedVersion: snap.version, rows: [...snap.rows, note] });
  writeLog("ReviewNote", 0, `#${note.id} 差异行 ${note.diff_result_id}`);
  return { ...note };
}

export function updateReviewNote(
  noteId: number,
  patch: Partial<Pick<ReviewNote, "tag" | "comment" | "reviewer" | "status">>
): ReviewNote {
  const snap = reviewNoteApi.snapshot();
  const current = snap.rows.find((note) => note.id === noteId);
  if (!current) throw new DomainError("VALIDATION_FAILED", { noteId });
  const updated: ReviewNote = { ...current, ...patch, updated_at: new Date().toISOString() };
  casWriteCollection({
    name: "reviewNote",
    expectedVersion: snap.version,
    rows: snap.rows.map((note) => (note.id === noteId ? updated : note))
  });
  writeLog("ReviewNote", 1, `#${noteId} ${updated.status}`);
  return { ...updated };
}

export interface ChecklistEntry {
  note: ReviewNote;
  diff: DiffResult;
}

/** 审阅清单只认生效批次：COMMITTED 批次 + MATCHED 备注，ORPHANED 一律不进清单 */
export function getReviewChecklist(statusFilter?: ReviewStatus): ChecklistEntry[] {
  const rowsById = new Map(diffResultApi.snapshot().rows.map((row) => [row.id, row]));
  const activeBatches = new Set(
    comparisonBatchApi
      .snapshot()
      .rows.filter((batch) => batch.status === BatchStatus[3])
      .map((batch) => batch.id)
  );
  return reviewNoteApi
    .snapshot()
    .rows.filter(
      (note) =>
        note.link_status === ReviewNoteLinkStatus[0] &&
        activeBatches.has(note.batch_id) &&
        (!statusFilter || note.status === statusFilter)
    )
    .map((note) => ({ note, diff: rowsById.get(note.diff_result_id) }))
    .filter((entry): entry is ChecklistEntry => Boolean(entry.diff));
}

/** 待处理区：重新映射时对不上条款段落的备注（ORPHANED） */
export function getOrphanNotes(): ReviewNote[] {
  return reviewNoteApi
    .snapshot()
    .rows.filter((note) => note.link_status === ReviewNoteLinkStatus[1]);
}

/** 人工处理孤儿备注：重新指定差异行（仍需属于生效批次）或忽略 */
export function resolveOrphanNote(
  noteId: number,
  target: { diff_result_id?: number; status?: ReviewStatus; comment?: string }
): ReviewNote {
  const snap = reviewNoteApi.snapshot();
  const note = snap.rows.find((item) => item.id === noteId);
  if (!note || note.link_status !== ReviewNoteLinkStatus[1]) {
    throw new DomainError("VALIDATION_FAILED", { noteId });
  }

  let patch: Partial<ReviewNote> = { updated_at: new Date().toISOString() };
  if (target.diff_result_id !== undefined) {
    const row = diffResultApi.snapshot().rows.find((item) => item.id === target.diff_result_id);
    if (!row || !isActiveRow(row)) {
      throw new DomainError("BATCH_NOT_COMMITTABLE", { diff_result_id: target.diff_result_id });
    }
    patch = {
      ...patch,
      diff_result_id: row.id,
      batch_id: row.batch_id,
      link_status: ReviewNoteLinkStatus[0],
      orphan_reason: null
    };
  }
  if (target.status) patch = { ...patch, status: target.status };
  if (target.comment !== undefined) patch = { ...patch, comment: target.comment };

  const updated = { ...note, ...patch };
  casWriteCollection({
    name: "reviewNote",
    expectedVersion: snap.version,
    rows: snap.rows.map((item) => (item.id === noteId ? updated : item))
  });
  writeLog("ReviewNote", 2, `#${noteId} 待处理备注已处理 ${updated.link_status}`);
  return { ...updated };
}

/** 导出当前生效审阅清单的 Markdown 摘要 */
export function exportChecklistMarkdown(): string {
  const entries = getReviewChecklist();
  const lines = [
    "# 隐私政策差异审阅摘要",
    "",
    `导出时间：${new Date().toLocaleString("zh-CN")}`,
    `生效备注数：${entries.length}`,
    ""
  ];
  for (const { note, diff } of entries) {
    lines.push(`## 条款 ${diff.section_no}（${diff.diff_type}）`);
    lines.push(`- 差异：${diff.summary}`);
    lines.push(`- 标签：${note.tag}`);
    lines.push(`- 备注：${note.comment}`);
    lines.push(`- 审阅人：${note.reviewer}`);
    lines.push(`- 状态：${note.status}`);
    lines.push("");
  }
  return lines.join("\n");
}
