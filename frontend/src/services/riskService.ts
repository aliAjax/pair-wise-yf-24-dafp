import { casWriteCollection } from "../api/storage";
import { policySectionApi } from "../api/PolicySection";
import type { PolicySection } from "../types/PolicySection";
import type { PrivacyRiskLevel } from "../constants/PrivacyRiskLevel";
import { DomainError } from "../utils/exceptions";
import { writeLog } from "../utils/logger";

/**
 * 风险标注只改 category / risk_level，不进入来源指纹（指纹只含段落号/标题/正文），
 * 因此标注不会作废待生效批次；段落正文修改走 documentService 才触发作废。
 */
export function tagSectionRisk(
  sectionId: number,
  patch: { category?: string; risk_level?: PrivacyRiskLevel }
): PolicySection {
  const snap = policySectionApi.snapshot();
  const current = snap.rows.find((section) => section.id === sectionId);
  if (!current) throw new DomainError("VALIDATION_FAILED", { sectionId });
  const updated: PolicySection = { ...current, ...patch, updated_at: new Date().toISOString() };
  casWriteCollection({
    name: "policySection",
    expectedVersion: snap.version,
    rows: snap.rows.map((section) => (section.id === sectionId ? updated : section))
  });
  writeLog("PolicySection", 1, `#${sectionId} 风险标注 ${updated.category} ${updated.risk_level}`);
  return { ...updated };
}
