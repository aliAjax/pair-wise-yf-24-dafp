import type { BatchStatus, BatchRetryReason } from "../constants/BatchStatus";

/**
 * ComparisonBatch：一次比较的待生效批次。
 * 比较结果先进待生效区（未 COMMITTED 前不覆盖当前结果），
 * 提交时复核来源指纹与基线批次，全部未变才允许原子换表。
 */
export interface ComparisonBatch {
  id: number;
  old_document_id: number;
  new_document_id: number;
  status: BatchStatus;
  /** 建批时两份来源文档的内容指纹 */
  old_source_hash: string;
  new_source_hash: string;
  /** 建批时的生效批次；提交时若基线被新批次替换则拒绝并作废 */
  baseline_batch_id: number | null;
  /** 已完成段落对齐键（section_no），用于失败后续算，只补没做完的部分 */
  completed_sections: string[];
  /** 本次批次生成的差异行 id 列表 */
  diff_row_ids: number[];
  retry_reason: BatchRetryReason | null;
  /** 人可读的作废/重试缘由说明 */
  retry_detail: string | null;
  /** 最近一次计算错误信息（FAILED 时） */
  last_error: string | null;
  attempts: number;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
}
