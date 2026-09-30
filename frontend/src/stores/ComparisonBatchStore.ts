import { defineStore } from "pinia";
import { comparisonBatchApi } from "../api/ComparisonBatch";
import { subscribeStorage } from "../api/storage";
import { seedIfNeeded } from "../services/seeder";
import type { ComparisonBatch } from "../types/ComparisonBatch";
import { BatchStatus } from "../constants/BatchStatus";

export const useComparisonBatchStore = defineStore("comparisonBatch", {
  state: () => ({
    rows: [] as ComparisonBatch[],
    version: 0,
    loading: false,
    unsubscribe: null as null | (() => void)
  }),
  getters: {
    pendingBatches: (state) =>
      state.rows.filter(
        (batch) =>
          batch.status === BatchStatus[0] ||
          batch.status === BatchStatus[1] ||
          batch.status === BatchStatus[4]
      ),
    invalidatedBatches: (state) =>
      state.rows.filter((batch) => batch.status === BatchStatus[5]),
    latestCommitted:
      (state) =>
      (oldDocumentId: number, newDocumentId: number): ComparisonBatch | null =>
        state.rows
          .filter(
            (batch) =>
              batch.status === BatchStatus[3] &&
              batch.old_document_id === oldDocumentId &&
              batch.new_document_id === newDocumentId
          )
          .sort((a, b) => (b.committed_at ?? "").localeCompare(a.committed_at ?? ""))[0] ?? null
  },
  actions: {
    load() {
      seedIfNeeded();
      const snap = comparisonBatchApi.snapshot();
      this.rows = snap.rows;
      this.version = snap.version;
    },
    init() {
      this.load();
      if (!this.unsubscribe) {
        this.unsubscribe = subscribeStorage((name) => {
          if (name === "*" || name === "comparisonBatch") this.load();
        });
      }
    }
  }
});
