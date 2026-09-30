import type { DiffResult } from "./DiffResult";
import type { ReviewNote } from "./ReviewNote";

export type BatchStatus = "PENDING" | "ACTIVE" | "STALE" | "FAILED";

/**
 * 差异批次：每次比较先进入待生效区（PENDING），
 * 等政策来源复核无误后一次性换为当前结果（ACTIVE）。
 */
export interface DiffBatch {
  id: number;
  old_document_id: number;
  new_document_id: number;
  status: BatchStatus;
  /** 待生效区依据的政策来源指纹（old/new 文档正文 + 版次标签） */
  source_fingerprint: string;
  /** 计算时所依据的生效批次，用于标签页并发比较（乐观锁） */
  base_active_batch_id: number | null;
  /** 按条款段落重新算好的差异结果 */
  results: DiffResult[];
  /** 本批次结果上承载的审阅备注（审阅清单只认生效批次的备注） */
  notes: ReviewNote[];
  /** 对不上的审阅备注：留在待处理区，不进审阅清单 */
  unmatched_notes: ReviewNote[];
  /** 分段计算进度，重试只补没做完的部分 */
  progress: { total: number; done: number };
  /** 作废 / 失败缘由，重试时展示 */
  retry_reason: string | null;
  created_at: string;
  updated_at: string;
  promoted_at: string | null;
}
