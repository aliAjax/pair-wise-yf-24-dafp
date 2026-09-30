import type { ReviewNote } from "../types/ReviewNote";
import { ReviewStatus } from "../constants/ReviewStatus";
import { ReviewNoteLinkStatus } from "../constants/ReviewNoteLinkStatus";

const nowIso = () => new Date().toISOString();

export const createDefaultReviewNote = (
  overrides: Partial<ReviewNote> = {}
): ReviewNote => ({
  id: 0,
  diff_result_id: 0,
  batch_id: 0,
  link_status: ReviewNoteLinkStatus[0],
  orphan_reason: null,
  tag: "",
  comment: "",
  reviewer: "",
  status: ReviewStatus[0],
  created_at: nowIso(),
  updated_at: nowIso(),
  ...overrides
});

/** 标注表单对象 */
export const createReviewNoteForm = (
  overrides: Partial<ReviewNote> = {}
): ReviewNote =>
  createDefaultReviewNote({
    reviewer: "当前审阅人",
    ...overrides
  });

/** 重新映射后的响应对象：对不上的段落挂 ORPHANED 进待处理区 */
export const createRemappedReviewNote = (
  previous: ReviewNote,
  patch: Partial<ReviewNote>
): ReviewNote => ({
  ...previous,
  ...patch,
  updated_at: nowIso()
});

export const createReviewNoteResponse = (
  row: ReviewNote
): ReviewNote => ({ ...createDefaultReviewNote(), ...row });
