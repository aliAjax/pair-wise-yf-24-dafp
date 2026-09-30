import type { ReviewStatus } from "../constants/ReviewStatus";
import type { ReviewNoteLinkStatus } from "../constants/ReviewNoteLinkStatus";

export interface ReviewNote {
  id: number;
  /** 指向差异结果行；ORPHANED 时仍指向原批次行以便追溯 */
  diff_result_id: number;
  /** 生效批次 id；ORPHANED 时为尝试挂载的新批次 id */
  batch_id: number;
  /** MATCHED：已重新挂到生效批次；ORPHANED：段落对不上，留在待处理区 */
  link_status: ReviewNoteLinkStatus;
  orphan_reason: string | null;
  tag: string;
  comment: string;
  reviewer: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}
