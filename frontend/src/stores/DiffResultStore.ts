import { defineStore } from "pinia";
import { diffResultApi } from "../api/DiffResult";
import { subscribeStorage } from "../api/storage";
import { seedIfNeeded } from "../services/seeder";
import type { DiffResult } from "../types/DiffResult";

export const useDiffResultStore = defineStore("diffResult", {
  state: () => ({
    rows: [] as DiffResult[],
    version: 0,
    loading: false,
    unsubscribe: null as null | (() => void)
  }),
  actions: {
    load() {
      seedIfNeeded();
      const snap = diffResultApi.snapshot();
      this.rows = snap.rows;
      this.version = snap.version;
    },
    init() {
      this.load();
      if (!this.unsubscribe) {
        this.unsubscribe = subscribeStorage((name) => {
          if (name === "*" || name === "diffResult") this.load();
        });
      }
    }
  }
});
