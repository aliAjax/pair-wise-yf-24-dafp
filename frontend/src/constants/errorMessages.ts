import { ERROR_CODES } from "./errorCodes";

export const ERROR_MESSAGES: Record<keyof typeof ERROR_CODES, string> = {
  AUTH_REQUIRED: "请先登录后再继续操作",
  RBAC_DENIED: "当前角色没有执行该动作的权限",
  VALIDATION_FAILED: "表单字段缺失或格式错误",
  RATE_LIMITED: "请求过于频繁，请稍后再试",
  SOURCE_VERSION_CHANGED: "政策来源在比较期间被修改，待生效结果已作废，请重新比较",
  BATCH_INVALIDATED: "该比较批次已作废，不能再生效",
  BATCH_NOT_COMMITTABLE: "批次尚未计算完成，无法生效",
  BASELINE_CONFLICT: "比较期间已有另一个批次生效，当前批次已作废，请重新比较",
  STORAGE_WRITE_STALE: "另一个标签页已保存更新数据，本次写入已被拒绝，请刷新后重试",
  COMPUTATION_IN_PROGRESS: "该批次正在计算中，请等待计算完成"
};
