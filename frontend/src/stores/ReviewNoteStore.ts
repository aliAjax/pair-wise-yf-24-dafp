import { defineStore } from "pinia";
import { reviewNoteApi } from "../api/ReviewNote";
import { subscribeStorage } from "../api/storage";
import { seedIfNeeded } from "../services/seeder";
import type { ReviewNote } from "../types/ReviewNote";

export const useReviewNoteStore = defineStore("reviewNote", {
  state: () => ({
    rows: [] as ReviewNote[],
    version: 0,
    loading: false,
    unsubscribe: null as null | (() => void)
  }),
  actions: {
    load() {
      seedIfNeeded();
      const snap = reviewNoteApi.snapshot();
      this.rows = snap.rows;
      this.version = snap.version;
    },
    init() {
      this.load();
      if (!this.unsubscribe) {
        this.unsubscribe = subscribeStorage((name) => {
          if (name === "*" || name === "reviewNote" || name === "comparisonBatch") this.load();
        });
      }
    }
  }
});
