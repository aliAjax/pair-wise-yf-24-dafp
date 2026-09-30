export const ERROR_MESSAGES = {
  AUTH_REQUIRED: "请先登录后再继续操作",
  RBAC_DENIED: "当前角色没有执行该动作的权限",
  VALIDATION_FAILED: "表单字段缺失或格式错误",
  RATE_LIMITED: "请求过于频繁，请稍后再试",
  SOURCE_CHANGED: "政策来源已变更，待生效批次作废，请重新比较后再生效",
  DOCUMENT_NOT_FOUND: "政策文档不存在，可能已被删除或尚未导入",
  BATCH_NOT_FOUND: "待生效批次不存在或已被清理",
  BATCH_NOT_PENDING: "当前批次不是待生效状态，不能生效",
  PROMOTE_CONFLICT: "检测到其他标签页已先生效更新批次，早先算出的表不能覆盖新表，本批次作废，请重试",
  BATCH_COMPUTE_FAILED: "差异计算中断，可从原结果恢复并重试，重试只补没做完的部分"
};
