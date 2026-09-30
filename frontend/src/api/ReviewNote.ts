import { createCollectionApi } from "./collection";
import type { ReviewNote } from "../types/ReviewNote";
import { createReviewNoteResponse } from "../constructors/ReviewNoteConstructor";
import { writeLog } from "../utils/logger";

export const reviewNoteApi = createCollectionApi<ReviewNote>(
  "reviewNote",
  (row) => writeLog("ReviewNote", 0, `#${row.id} ${row.tag} ${row.status}`),
  (row) => writeLog("ReviewNote", 1, `#${row.id} ${row.tag} ${row.status}`)
);

export async function listReviewNote(): Promise<ReviewNote[]> {
  const rows = await reviewNoteApi.list();
  return rows.map(createReviewNoteResponse);
}

export async function saveReviewNote(payload: ReviewNote): Promise<ReviewNote> {
  const exists = reviewNoteApi.snapshot().rows.some((row) => row.id === payload.id);
  const saved = exists
    ? await reviewNoteApi.update(payload.id, payload)
    : await reviewNoteApi.create(payload);
  return createReviewNoteResponse(saved);
}
