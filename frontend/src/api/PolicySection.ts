import { createCollectionApi } from "./collection";
import type { PolicySection } from "../types/PolicySection";
import { createPolicySectionResponse } from "../constructors/PolicySectionConstructor";
import { writeLog } from "../utils/logger";

export const policySectionApi = createCollectionApi<PolicySection>(
  "policySection",
  (row) => writeLog("PolicySection", 0, `#${row.id} ${row.section_no} ${row.heading}`),
  (row) => writeLog("PolicySection", 1, `#${row.id} ${row.section_no} ${row.heading}`)
);

export async function listPolicySection(): Promise<PolicySection[]> {
  const rows = await policySectionApi.list();
  return rows.map(createPolicySectionResponse);
}

export async function savePolicySection(payload: PolicySection): Promise<PolicySection> {
  const exists = policySectionApi.snapshot().rows.some((row) => row.id === payload.id);
  const saved = exists
    ? await policySectionApi.update(payload.id, payload)
    : await policySectionApi.create(payload);
  return createPolicySectionResponse(saved);
}

export async function savePolicySections(
  rows: PolicySection[],
  expectedVersion: number
): Promise<number> {
  return policySectionApi.saveAll(rows, expectedVersion);
}
