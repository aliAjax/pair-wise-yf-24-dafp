import { defineStore } from "pinia";
import { policySectionApi } from "../api/PolicySection";
import { subscribeStorage } from "../api/storage";
import { seedIfNeeded } from "../services/seeder";
import type { PolicySection } from "../types/PolicySection";

export const usePolicySectionStore = defineStore("policySection", {
  state: () => ({
    rows: [] as PolicySection[],
    version: 0,
    loading: false,
    unsubscribe: null as null | (() => void)
  }),
  getters: {
    byDocument: (state) => (documentId: number) =>
      state.rows
        .filter((section) => section.document_id === documentId)
        .sort((a, b) => a.section_no.localeCompare(b.section_no, "zh-CN", { numeric: true }))
  },
  actions: {
    load() {
      seedIfNeeded();
      const snap = policySectionApi.snapshot();
      this.rows = snap.rows;
      this.version = snap.version;
    },
    init() {
      this.load();
      if (!this.unsubscribe) {
        this.unsubscribe = subscribeStorage((name) => {
          if (name === "*" || name === "policySection") this.load();
        });
      }
    }
  }
});
