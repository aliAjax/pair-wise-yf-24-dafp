import type { ComparisonBatch } from "../types/ComparisonBatch";
import { BatchStatus } from "../constants/BatchStatus";

const nowIso = () => new Date().toISOString();

export const createDefaultComparisonBatch = (
  overrides: Partial<ComparisonBatch> = {}
): ComparisonBatch => ({
  id: 0,
  old_document_id: 0,
  new_document_id: 0,
  status: BatchStatus[0],
  old_source_hash: "",
  new_source_hash: "",
  baseline_batch_id: null,
  completed_sections: [],
  diff_row_ids: [],
  retry_reason: null,
  retry_detail: null,
  last_error: null,
  attempts: 0,
  created_at: nowIso(),
  updated_at: nowIso(),
  committed_at: null,
  ...overrides
});

/** 发起一次比较：进入待生效区（COMPUTING），记录来源指纹与基线批次 */
export const createComparisonBatchForm = (
  overrides: Partial<ComparisonBatch> = {}
): ComparisonBatch => createDefaultComparisonBatch(overrides);

export const createComparisonBatchResponse = (
  row: ComparisonBatch
): ComparisonBatch => ({ ...createDefaultComparisonBatch(), ...row });
