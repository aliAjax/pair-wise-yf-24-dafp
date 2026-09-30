import type { PolicySection } from "../types/PolicySection";
import { PrivacyRiskLevel } from "../constants/PrivacyRiskLevel";

export const createDefaultPolicySection = (
  overrides: Partial<PolicySection> = {}
): PolicySection => ({
  id: 0,
  document_id: 0,
  section_no: "",
  heading: "",
  content: "",
  category: "GENERAL",
  risk_level: PrivacyRiskLevel[0],
  updated_at: new Date().toISOString(),
  ...overrides
});

export const createPolicySectionForm = (
  documentId: number,
  overrides: Partial<PolicySection> = {}
): PolicySection =>
  createDefaultPolicySection({ document_id: documentId, ...overrides });

export const createPolicySectionResponse = (
  row: PolicySection
): PolicySection => ({ ...createDefaultPolicySection(), ...row });
