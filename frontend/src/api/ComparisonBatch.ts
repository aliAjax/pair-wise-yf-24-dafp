import { createCollectionApi } from "./collection";
import type { ComparisonBatch } from "../types/ComparisonBatch";
import { createComparisonBatchResponse } from "../constructors/ComparisonBatchConstructor";
import { writeLog } from "../utils/logger";

export const comparisonBatchApi = createCollectionApi<ComparisonBatch>(
  "comparisonBatch",
  (row) => writeLog("ComparisonBatch", 0, `批次#${row.id} ${row.status}`),
  (row) => writeLog("ComparisonBatch", 4, `批次#${row.id} ${row.status} ${row.retry_reason ?? ""}`)
);

export async function listComparisonBatch(): Promise<ComparisonBatch[]> {
  const rows = await comparisonBatchApi.list();
  return rows.map(createComparisonBatchResponse);
}
