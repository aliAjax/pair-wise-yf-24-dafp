export const BatchStatus = ["PENDING", "ACTIVE", "STALE", "FAILED"] as const;
export type BatchStatus = (typeof BatchStatus)[number];
export const BatchStatusText: Record<BatchStatus, string> = {
  PENDING: "待生效",
  ACTIVE: "已生效",
  STALE: "已作废",
  FAILED: "计算失败"
};
