import type { DiffBatch } from "../types/DiffBatch";

export const createDefaultDiffBatch = (overrides: Partial<DiffBatch> = {}): DiffBatch => ({
  id: 1,
  old_document_id: 1,
  new_document_id: 2,
  status: "PENDING",
  source_fingerprint: "",
  base_active_batch_id: null,
  results: [],
  notes: [],
  unmatched_notes: [],
  progress: { total: 0, done: 0 },
  retry_reason: null,
  created_at: "2026-06-11T09:00:00Z",
  updated_at: "2026-06-11T09:00:00Z",
  promoted_at: null,
  ...overrides
});

export const createDiffBatchForm = createDefaultDiffBatch;
export const createDiffBatchResponse = createDefaultDiffBatch;
