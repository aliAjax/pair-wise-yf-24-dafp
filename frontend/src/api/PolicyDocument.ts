import { createCollectionApi } from "./collection";
import type { PolicyDocument } from "../types/PolicyDocument";
import { createPolicyDocumentResponse } from "../constructors/PolicyDocumentConstructor";
import { writeLog } from "../utils/logger";

export const policyDocumentApi = createCollectionApi<PolicyDocument>(
  "policyDocument",
  (row) => writeLog("PolicyDocument", 0, `#${row.id} ${row.version_label}`),
  (row) => writeLog("PolicyDocument", 1, `#${row.id} ${row.version_label}`)
);

export async function listPolicyDocument(): Promise<PolicyDocument[]> {
  const rows = await policyDocumentApi.list();
  return rows.map(createPolicyDocumentResponse);
}

export async function savePolicyDocument(payload: PolicyDocument): Promise<PolicyDocument> {
  const exists = policyDocumentApi.snapshot().rows.some((row) => row.id === payload.id);
  const saved = exists
    ? await policyDocumentApi.update(payload.id, payload)
    : await policyDocumentApi.create(payload);
  return createPolicyDocumentResponse(saved);
}
