import { defineStore } from "pinia";
import * as sectionApi from "../api/PolicySection";
import type { PolicySection } from "../types/PolicySection";
import { wrapError } from "../utils/errors";

interface PolicySectionState {
  rows: PolicySection[];
  loading: boolean;
  error: string | null;
}

export const usePolicySectionStore = defineStore("policySection", {
  state: (): PolicySectionState => ({ rows: [], loading: false, error: null }),
  getters: {
    byDocument(state) {
      return (documentId: number) => state.rows.filter((section) => section.document_id === documentId);
    }
  },
  actions: {
    async load(documentId?: number) {
      this.loading = true;
      try {
        this.rows = await sectionApi.listPolicySection(documentId);
        this.error = null;
      } catch (error) {
        this.error = wrapError(error).message;
      } finally {
        this.loading = false;
      }
    },
    async save(payload: PolicySection) {
      const saved = await sectionApi.savePolicySection(payload);
      const index = this.rows.findIndex((section) => section.id === saved.id);
      if (index >= 0) this.rows[index] = saved;
      else this.rows.push(saved);
      return saved;
    }
  }
});
