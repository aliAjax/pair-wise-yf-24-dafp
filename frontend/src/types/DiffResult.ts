import type { DiffType } from "../constants/DiffType";

export interface DiffResult {
  id: number;
  /** 所属比较批次；只有 COMMITTED 批次的行才算生效结果 */
  batch_id: number;
  old_document_id: number;
  new_document_id: number;
  /** 新版本段落 id；REMOVED 时回退为旧段落 id */
  section_id: number;
  old_section_id: number | null;
  new_section_id: number | null;
  /** 对齐用的段落号（新侧），MOVED 时保留 old_section_no */
  section_no: string;
  old_section_no: string | null;
  diff_type: DiffType;
  summary: string;
  created_at: string;
}
