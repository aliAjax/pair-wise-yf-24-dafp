import { defineStore } from "pinia";
import * as docApi from "../api/PolicyDocument";
import type { PolicyDocument } from "../types/PolicyDocument";
import { wrapError } from "../utils/errors";

interface PolicyDocumentState {
  rows: PolicyDocument[];
  loading: boolean;
  error: string | null;
}

export const usePolicyDocumentStore = defineStore("policyDocument", {
  state: (): PolicyDocumentState => ({ rows: [], loading: false, error: null }),
  getters: {
    byId(state) {
      return (id: number) => state.rows.find((doc) => doc.id === id) ?? null;
    }
  },
  actions: {
    async load() {
      this.loading = true;
      try {
        this.rows = await docApi.listPolicyDocument();
        this.error = null;
      } catch (error) {
        this.error = wrapError(error).message;
      } finally {
        this.loading = false;
      }
    },
    async save(payload: PolicyDocument) {
      const saved = await docApi.savePolicyDocument(payload);
      const index = this.rows.findIndex((doc) => doc.id === saved.id);
      if (index >= 0) this.rows[index] = saved;
      else this.rows.push(saved);
      return saved;
    }
  }
});
