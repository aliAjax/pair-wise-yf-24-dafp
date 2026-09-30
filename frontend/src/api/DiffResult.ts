import { createCollectionApi } from "./collection";
import type { DiffResult } from "../types/DiffResult";
import { createDiffResultResponse } from "../constructors/DiffResultConstructor";
import { writeLog } from "../utils/logger";

export const diffResultApi = createCollectionApi<DiffResult>(
  "diffResult",
  (row) => writeLog("DiffResult", 0, `#${row.id} 批次#${row.batch_id} ${row.diff_type}`),
  (row) => writeLog("DiffResult", 1, `#${row.id} 批次#${row.batch_id} ${row.diff_type}`)
);

export async function listDiffResult(): Promise<DiffResult[]> {
  const rows = await diffResultApi.list();
  return rows.map(createDiffResultResponse);
}

export async function saveDiffResult(payload: DiffResult): Promise<DiffResult> {
  const exists = diffResultApi.snapshot().rows.some((row) => row.id === payload.id);
  const saved = exists
    ? await diffResultApi.update(payload.id, payload)
    : await diffResultApi.create(payload);
  return createDiffResultResponse(saved);
}
