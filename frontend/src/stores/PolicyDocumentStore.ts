import { defineStore } from "pinia";
import { policyDocumentApi } from "../api/PolicyDocument";
import { subscribeStorage } from "../api/storage";
import { seedIfNeeded } from "../services/seeder";
import type { PolicyDocument } from "../types/PolicyDocument";

export const usePolicyDocumentStore = defineStore("policyDocument", {
  state: () => ({
    rows: [] as PolicyDocument[],
    version: 0,
    loading: false,
    unsubscribe: null as null | (() => void)
  }),
  actions: {
    load() {
      seedIfNeeded();
      this.loading = true;
      const snap = policyDocumentApi.snapshot();
      this.rows = snap.rows;
      this.version = snap.version;
      this.loading = false;
    },
    init() {
      this.load();
      if (!this.unsubscribe) {
        this.unsubscribe = subscribeStorage((name) => {
          if (name === "*" || name === "policyDocument") this.load();
        });
      }
    }
  }
});
