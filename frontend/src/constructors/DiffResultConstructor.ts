import type { DiffResult } from "../types/DiffResult";
import { DiffType } from "../constants/DiffType";

export const createDefaultDiffResult = (
  overrides: Partial<DiffResult> = {}
): DiffResult => ({
  id: 0,
  batch_id: 0,
  old_document_id: 0,
  new_document_id: 0,
  section_id: 0,
  old_section_id: null,
  new_section_id: null,
  section_no: "",
  old_section_no: null,
  diff_type: DiffType[1],
  summary: "",
  created_at: new Date().toISOString(),
  ...overrides
});

/** 段落对齐计算产物 */
export const createDiffResultRow = (
  overrides: Partial<DiffResult> = {}
): DiffResult => createDefaultDiffResult(overrides);

export const createDiffResultResponse = (
  row: DiffResult
): DiffResult => ({ ...createDefaultDiffResult(), ...row });
