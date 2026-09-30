import { isSeeded, markSeeded, withGlobalLock } from "../api/storage";
import { policyDocumentApi } from "../api/PolicyDocument";
import { policySectionApi } from "../api/PolicySection";
import { diffResultApi } from "../api/DiffResult";
import { reviewNoteApi } from "../api/ReviewNote";
import { comparisonBatchApi } from "../api/ComparisonBatch";
import {
  seedBatch,
  seedDiffResults,
  seedDocuments,
  seedReviewNotes,
  seedSections
} from "../mocks/seedData";
import { computeSourceHash } from "./sourceFingerprint";

/** 首次启动把种子数据一次性写入 localStorage；已播种则跳过 */
export function seedIfNeeded(): void {
  withGlobalLock(() => {
    if (isSeeded()) return;

    const documents = seedDocuments.map((doc) => ({
      ...doc,
      content_hash: computeSourceHash(
        doc,
        seedSections.filter((section) => section.document_id === doc.id)
      )
    }));
    const batch = {
      ...seedBatch,
      old_source_hash: documents[0].content_hash,
      new_source_hash: documents[1].content_hash
    };

    policyDocumentApi.saveAll(documents, 0);
    policySectionApi.saveAll(seedSections, 0);
    diffResultApi.saveAll(seedDiffResults, 0);
    reviewNoteApi.saveAll(seedReviewNotes, 0);
    comparisonBatchApi.saveAll([batch], 0);
    // 水位号必须覆盖全部种子行最大 id，否则后续发号会和种子数据撞 id
    const maxId = Math.max(
      ...documents.map((row) => row.id),
      ...seedSections.map((row) => row.id),
      ...seedDiffResults.map((row) => row.id),
      ...seedReviewNotes.map((row) => row.id),
      batch.id
    );
    markSeeded(maxId);
  });
}
