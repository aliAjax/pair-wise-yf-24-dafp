import type { PolicyDocument } from "../types/PolicyDocument";

const nowIso = () => new Date().toISOString();

export const createDefaultPolicyDocument = (
  overrides: Partial<PolicyDocument> = {}
): PolicyDocument => ({
  id: 0,
  title: "",
  version_label: "",
  raw_text: "",
  normalized_sections: "",
  imported_at: nowIso(),
  updated_at: nowIso(),
  content_hash: "",
  ...overrides
});

/** 导入表单对象：页面粘贴文本时使用 */
export const createPolicyDocumentForm = (
  overrides: Partial<PolicyDocument> = {}
): PolicyDocument =>
  createDefaultPolicyDocument({
    title: "未命名隐私政策",
    version_label: "v0.0",
    ...overrides
  });

/** API 响应对象：补全展示层需要的时间字段 */
export const createPolicyDocumentResponse = (row: PolicyDocument): PolicyDocument => ({
  ...createDefaultPolicyDocument(),
  ...row,
  updated_at: row.updated_at || row.imported_at
});
