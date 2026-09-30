import type { PolicyDocument } from "../types/PolicyDocument";
import type { PolicySection } from "../types/PolicySection";
import type { DiffResult } from "../types/DiffResult";
import type { ReviewNote } from "../types/ReviewNote";
import type { ComparisonBatch } from "../types/ComparisonBatch";
import { DiffType } from "../constants/DiffType";
import { PrivacyRiskLevel } from "../constants/PrivacyRiskLevel";
import { ReviewStatus } from "../constants/ReviewStatus";
import { ReviewNoteLinkStatus } from "../constants/ReviewNoteLinkStatus";
import { BatchStatus } from "../constants/BatchStatus";

const V1 = "2026-05-01T09:00:00Z";
const V2 = "2026-06-10T09:00:00Z";

export const seedDocuments: PolicyDocument[] = [
  {
    id: 1,
    title: "某产品隐私政策",
    version_label: "v1.0",
    raw_text: "第一条 信息收集……\n第二条 信息共享……\n第三条 保存期限……\n第四条 联系我们……",
    normalized_sections: "4",
    imported_at: V1,
    updated_at: V1,
    content_hash: ""
  },
  {
    id: 2,
    title: "某产品隐私政策",
    version_label: "v2.0",
    raw_text:
      "第一条 信息收集……\n第二条 信息共享……\n第三条 保存期限……\n第四条 第三方 SDK……\n第五条 联系我们……",
    normalized_sections: "5",
    imported_at: V2,
    updated_at: V2,
    content_hash: ""
  }
];

export const seedSections: PolicySection[] = [
  { id: 1, document_id: 1, section_no: "1", heading: "信息收集", content: "我们收集账号信息与设备信息。", category: "COLLECT", risk_level: PrivacyRiskLevel[1], updated_at: V1 },
  { id: 2, document_id: 1, section_no: "2", heading: "信息共享", content: "我们仅在获得同意后与关联公司共享信息。", category: "SHARE", risk_level: PrivacyRiskLevel[2], updated_at: V1 },
  { id: 3, document_id: 1, section_no: "3", heading: "保存期限", content: "信息保存至账号注销后 30 天。", category: "RETENTION", risk_level: PrivacyRiskLevel[1], updated_at: V1 },
  { id: 4, document_id: 1, section_no: "4", heading: "联系我们", content: "通过 privacy@example.com 联系我们。", category: "CONTACT", risk_level: PrivacyRiskLevel[0], updated_at: V1 },

  { id: 5, document_id: 2, section_no: "1", heading: "信息收集", content: "我们收集账号信息、设备信息与位置信息。", category: "COLLECT", risk_level: PrivacyRiskLevel[2], updated_at: V2 },
  { id: 6, document_id: 2, section_no: "2", heading: "信息共享", content: "我们可能与授权合作伙伴共享信息用于广告投放。", category: "SHARE", risk_level: PrivacyRiskLevel[3], updated_at: V2 },
  { id: 7, document_id: 2, section_no: "3", heading: "保存期限", content: "信息保存至账号注销后 180 天。", category: "RETENTION", risk_level: PrivacyRiskLevel[2], updated_at: V2 },
  { id: 8, document_id: 2, section_no: "4", heading: "第三方 SDK", content: "我们接入统计与推送 SDK，由第三方收集设备标识。", category: "SDK", risk_level: PrivacyRiskLevel[2], updated_at: V2 },
  { id: 9, document_id: 2, section_no: "5", heading: "联系我们", content: "通过 privacy@example.com 联系我们。", category: "CONTACT", risk_level: PrivacyRiskLevel[0], updated_at: V2 }
];

export const seedBatch: ComparisonBatch = {
  id: 1,
  old_document_id: 1,
  new_document_id: 2,
  status: BatchStatus[3], // COMMITTED
  old_source_hash: "",
  new_source_hash: "",
  baseline_batch_id: null,
  completed_sections: ["1", "2", "3", "4", "5"],
  diff_row_ids: [1, 2, 3, 4, 5],
  retry_reason: null,
  retry_detail: null,
  last_error: null,
  attempts: 1,
  created_at: V2,
  updated_at: V2,
  committed_at: V2
};

export const seedDiffResults: DiffResult[] = [
  { id: 1, batch_id: 1, old_document_id: 1, new_document_id: 2, section_id: 5, old_section_id: 1, new_section_id: 5, section_no: "1", old_section_no: "1", diff_type: DiffType[2] /* MODIFIED */, summary: "新增位置信息收集", created_at: V2 },
  { id: 2, batch_id: 1, old_document_id: 1, new_document_id: 2, section_id: 6, old_section_id: 2, new_section_id: 6, section_no: "2", old_section_no: "2", diff_type: DiffType[2], summary: "共享范围扩大到广告合作伙伴", created_at: V2 },
  { id: 3, batch_id: 1, old_document_id: 1, new_document_id: 2, section_id: 7, old_section_id: 3, new_section_id: 7, section_no: "3", old_section_no: "3", diff_type: DiffType[2], summary: "保存期限由 30 天延长到 180 天", created_at: V2 },
  { id: 4, batch_id: 1, old_document_id: 1, new_document_id: 2, section_id: 8, old_section_id: null, new_section_id: 8, section_no: "4", old_section_no: null, diff_type: DiffType[0] /* ADDED */, summary: "新增第三方 SDK 条款", created_at: V2 },
  { id: 5, batch_id: 1, old_document_id: 1, new_document_id: 2, section_id: 9, old_section_id: 4, new_section_id: 9, section_no: "5", old_section_no: "4", diff_type: DiffType[3] /* MOVED */, summary: "联系方式条款顺延", created_at: V2 }
];

export const seedReviewNotes: ReviewNote[] = [
  {
    id: 1,
    diff_result_id: 2,
    batch_id: 1,
    link_status: ReviewNoteLinkStatus[0],
    orphan_reason: null,
    tag: "超范围共享",
    comment: "广告共享需要单独同意弹窗，请法务确认。",
    reviewer: "审阅人 A",
    status: ReviewStatus[0] /* OPEN */,
    created_at: V2,
    updated_at: V2
  }
];

/** 兼容旧引用：以实体名为键的只读结构 */
export const mockData = {
  policyDocument: seedDocuments,
  policySection: seedSections,
  diffResult: seedDiffResults,
  reviewNote: seedReviewNotes,
  comparisonBatch: [seedBatch]
};
