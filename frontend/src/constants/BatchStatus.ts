/**
 * 比较批次状态机
 * COMPUTING -> READY（待生效区）-> COMMITTING -> COMMITTED（当前生效结果）
 * COMPUTING -> FAILED（可断点续算重试）
 * READY/COMPUTING/COMMITTING/FAILED -> INVALIDATED（版次变化作废，需重新发起）
 */
export const BatchStatus = [
  "COMPUTING",
  "READY",
  "COMMITTING",
  "COMMITTED",
  "FAILED",
  "INVALIDATED"
] as const;
export type BatchStatus = (typeof BatchStatus)[number];

export const BatchStatusText: Record<BatchStatus, string> = {
  COMPUTING: "计算中",
  READY: "待生效",
  COMMITTING: "生效中",
  COMMITTED: "已生效",
  FAILED: "计算失败",
  INVALIDATED: "已作废"
};

/** 作废/重试缘由代码 */
export const BatchRetryReason = [
  "SOURCE_VERSION_CHANGED",
  "BASELINE_COMMITTED",
  "BASELINE_REPLACED",
  "CALCULATION_FAILED"
] as const;
export type BatchRetryReason = (typeof BatchRetryReason)[number];

export const BatchRetryReasonText: Record<BatchRetryReason, string> = {
  SOURCE_VERSION_CHANGED: "政策来源版本已变化",
  BASELINE_COMMITTED: "比较期间已有其他批次生效",
  BASELINE_REPLACED: "生效基线已被替换",
  CALCULATION_FAILED: "差异计算失败"
};
