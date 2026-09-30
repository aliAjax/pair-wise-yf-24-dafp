import { defineStore } from "pinia";
import * as batchApi from "../api/DiffBatch";
import * as docApi from "../api/PolicyDocument";
import { listPolicySection } from "../api/PolicySection";
import type { DiffBatch } from "../types/DiffBatch";
import type { PolicyDocument } from "../types/PolicyDocument";
import type { ReviewNote } from "../types/ReviewNote";
import { computeSourceFingerprint } from "../utils/fingerprint";
import { diffDocuments, parseSections, remapNotes } from "../utils/diffEngine";
import { createDefaultDiffBatch } from "../constructors/DiffBatchConstructor";
import { createDefaultReviewNote } from "../constructors/ReviewNoteConstructor";
import { ERROR_CODES } from "../constants/errorCodes";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { wrapError } from "../utils/errors";

const FAILURE_FLAG_KEY = "policy-diff:inject-failure";

function now(): string {
  return new Date().toISOString();
}

interface DiffBatchState {
  batches: DiffBatch[];
  loading: boolean;
  error: string | null;
  injectFailure: boolean;
  storageListenerAttached: boolean;
}

export const useDiffBatchStore = defineStore("diffBatch", {
  state: (): DiffBatchState => ({
    batches: [],
    loading: false,
    error: null,
    injectFailure: typeof localStorage !== "undefined" && localStorage.getItem(FAILURE_FLAG_KEY) === "1",
    storageListenerAttached: false
  }),
  getters: {
    activeBatch(state): DiffBatch | null {
      return state.batches.find((batch) => batch.status === "ACTIVE") ?? null;
    },
    pendingBatch(state): DiffBatch | null {
      return state.batches.find((batch) => batch.status === "PENDING") ?? null;
    },
    /** 待处理区：所有批次中对不上的审阅备注（去重），不进审阅清单 */
    pendingAreaNotes(state): ReviewNote[] {
      const seen = new Set<number>();
      const result: ReviewNote[] = [];
      for (const batch of state.batches) {
        for (const note of batch.unmatched_notes) {
          if (!seen.has(note.id)) {
            seen.add(note.id);
            result.push(note);
          }
        }
      }
      return result;
    }
  },
  actions: {
    async load() {
      this.loading = true;
      try {
        this.batches = await batchApi.listDiffBatches();
        this.error = null;
        await this.reconcilePending();
      } catch (error) {
        this.error = wrapError(error).message;
      } finally {
        this.loading = false;
      }
      if (typeof window !== "undefined" && !this.storageListenerAttached) {
        window.addEventListener("storage", (event) => {
          if (event.key === "policy-diff:diff-batches") {
            void this.load();
          }
        });
        this.storageListenerAttached = true;
      }
    },

    setInjectFailure(value: boolean) {
      this.injectFailure = value;
      localStorage.setItem(FAILURE_FLAG_KEY, value ? "1" : "0");
    },

    async persist() {
      const saved = await batchApi.saveDiffBatches(this.batches);
      // 同步回响应式对象但不替换数组，保持批次引用不脱落（分段计算中持续修改同一批次）
      for (const savedBatch of saved) {
        const existing = this.batches.find((batch) => batch.id === savedBatch.id);
        if (existing) {
          Object.assign(existing, savedBatch);
        } else {
          this.batches.push(savedBatch);
        }
      }
    },

    /**
     * 每次比较先放进待生效区：
     * 按条款段落重新算对应关系，差异结果与审阅备注都挂到新条款上；
     * 对不上的审阅备注留在待处理区，不进审阅清单。
     */
    async stageComparison(oldDocumentId: number, newDocumentId: number): Promise<DiffBatch> {
      try {
        const docs = await docApi.listPolicyDocument();
        const oldDoc = docs.find((doc) => doc.id === oldDocumentId);
        const newDoc = docs.find((doc) => doc.id === newDocumentId);
        if (!oldDoc || !newDoc) {
          throw wrapError(new Error("政策来源文档不存在"), ERROR_CODES.DOCUMENT_NOT_FOUND);
        }
        const fingerprint = await computeSourceFingerprint(oldDoc, newDoc);
        const active = this.activeBatch;

        for (const batch of this.batches) {
          if (batch.status === "PENDING") {
            batch.status = "STALE";
            batch.retry_reason = "已被新的待生效比较批次取代";
            batch.updated_at = now();
          }
        }

        const batch = createDefaultDiffBatch({
          id: this.batches.reduce((max, item) => Math.max(max, item.id), 0) + 1,
          old_document_id: oldDocumentId,
          new_document_id: newDocumentId,
          status: "PENDING",
          source_fingerprint: fingerprint,
          base_active_batch_id: active?.id ?? null,
          progress: { total: 0, done: 0 },
          created_at: now(),
          updated_at: now()
        });
        this.batches.push(batch);
        console.info(LOG_TEMPLATES.DiffBatch[0], { batchId: batch.id, oldDocumentId, newDocumentId });

        await this.runCompute(batch, oldDoc, newDoc, false);
        await this.persist();
        this.error = null;
        return batch;
      } catch (error) {
        this.error = wrapError(error).message;
        throw error;
      }
    },

    /**
     * 分段计算：进度逐段持久化。
     * 失败时批次停在 FAILED 并保留已算结果，重试只补没做完的部分。
     */
    async runCompute(batch: DiffBatch, oldDoc: PolicyDocument, newDoc: PolicyDocument, resume: boolean): Promise<void> {
      try {
        const oldSections = parseSections(oldDoc);
        const newSections = parseSections(newDoc);
        const { results } = diffDocuments(oldDoc, newDoc, oldSections, newSections);
        const start = resume ? batch.progress.done : 0;
        if (!resume) {
          batch.results = [];
          batch.notes = [];
          batch.unmatched_notes = [];
          batch.progress = { total: results.length, done: 0 };
        }

        for (let i = start; i < results.length; i++) {
          if (this.injectFailure && i >= Math.ceil(results.length * 0.4)) {
            throw wrapError(new Error(`第 ${i + 1}/${results.length} 段计算时模拟中断`), ERROR_CODES.BATCH_COMPUTE_FAILED);
          }
          batch.results.push(results[i]);
          batch.progress.done = i + 1;
          batch.updated_at = now();
          await this.persist();
          await new Promise((resolve) => setTimeout(resolve, 24));
        }

        const active = this.activeBatch;
        const activeOldDoc = active ? await docApi.getPolicyDocument(active.old_document_id).catch(() => undefined) : undefined;
        const activeNewDoc = active ? await docApi.getPolicyDocument(active.new_document_id).catch(() => undefined) : undefined;
        // 旧批次的结果可能挂在旧条款（REMOVED）或新条款（ADDED/MODIFIED）上，两边都要能对应
        const activeSections = [
          ...(activeOldDoc ? parseSections(activeOldDoc) : []),
          ...(activeNewDoc ? parseSections(activeNewDoc) : [])
        ];
        const candidates: ReviewNote[] = [];
        const noteIds = new Set<number>();
        for (const note of active?.notes ?? []) {
          if (!noteIds.has(note.id)) {
            noteIds.add(note.id);
            candidates.push(note);
          }
        }
        for (const other of this.batches) {
          if (other.id === batch.id) continue;
          for (const note of other.unmatched_notes) {
            if (!noteIds.has(note.id)) {
              noteIds.add(note.id);
              candidates.push(note);
            }
          }
        }

        const { notes, unmatched } = remapNotes(candidates, active, batch.results, activeSections, newSections);
        batch.notes = notes;
        batch.unmatched_notes = unmatched;
        batch.status = "PENDING";
        batch.retry_reason = null;
        batch.updated_at = now();
        console.info(LOG_TEMPLATES.DiffBatch[1], { batchId: batch.id, done: batch.progress.done, unmatched: unmatched.length });
      } catch (error) {
        batch.status = "FAILED";
        batch.retry_reason = wrapError(error, ERROR_CODES.BATCH_COMPUTE_FAILED).message;
        batch.updated_at = now();
        await this.persist();
        this.error = batch.retry_reason;
        throw error;
      }
    },

    /**
     * 等政策来源确认没动，再一次性换为当前结果。
     * 指纹不符或标签页并发冲突时，API 会把批次作废并留下重试缘由。
     */
    async promoteBatch(batchId: number): Promise<void> {
      const batch = this.batches.find((item) => item.id === batchId);
      if (!batch) throw wrapError(new Error(`批次 #${batchId} 不存在`), ERROR_CODES.BATCH_NOT_FOUND);
      const oldDoc = await docApi.getPolicyDocument(batch.old_document_id);
      const newDoc = await docApi.getPolicyDocument(batch.new_document_id);
      const fingerprint = await computeSourceFingerprint(oldDoc, newDoc);
      try {
        this.batches = await batchApi.promoteDiffBatch(batchId, fingerprint);
        this.error = null;
      } catch (error) {
        this.batches = await batchApi.listDiffBatches();
        this.error = wrapError(error).message;
        throw error;
      }
    },

    /**
     * 重试：计算失败后续算未完成段落；来源变更/作废则按当前来源全部重算。
     */
    async retryBatch(batchId: number): Promise<void> {
      const batch = this.batches.find((item) => item.id === batchId);
      if (!batch) throw wrapError(new Error(`批次 #${batchId} 不存在`), ERROR_CODES.BATCH_NOT_FOUND);
      const oldDoc = await docApi.getPolicyDocument(batch.old_document_id);
      const newDoc = await docApi.getPolicyDocument(batch.new_document_id);
      const fingerprint = await computeSourceFingerprint(oldDoc, newDoc);
      const resume = batch.status === "FAILED" && batch.progress.done > 0 && fingerprint === batch.source_fingerprint;
      if (!resume) {
        batch.source_fingerprint = fingerprint;
        batch.base_active_batch_id = this.activeBatch?.id ?? null;
        batch.progress = { total: 0, done: 0 };
        batch.results = [];
        batch.notes = [];
        batch.unmatched_notes = [];
      }
      batch.status = "PENDING";
      batch.retry_reason = null;
      console.info(LOG_TEMPLATES.DiffBatch[4], { batchId, resume });
      await this.runCompute(batch, oldDoc, newDoc, resume);
      await this.persist();
    },

    /** 版次一变就作废待生效结果并留下重试缘由（导入新版本文档时调用）。 */
    async invalidatePending(reason: string): Promise<void> {
      let changed = false;
      for (const batch of this.batches) {
        if (batch.status === "PENDING" || batch.status === "FAILED") {
          batch.status = "STALE";
          batch.retry_reason = reason;
          batch.updated_at = now();
          changed = true;
        }
      }
      if (changed) {
        await this.persist();
        console.warn(LOG_TEMPLATES.DiffBatch[3], { reason });
      }
    },

    /** 跨标签页同步后复核：来源指纹对不上的待生效批次直接作废。 */
    async reconcilePending(): Promise<void> {
      const docs = await docApi.listPolicyDocument();
      let changed = false;
      for (const batch of this.batches) {
        if (batch.status !== "PENDING") continue;
        const oldDoc = docs.find((doc) => doc.id === batch.old_document_id);
        const newDoc = docs.find((doc) => doc.id === batch.new_document_id);
        const fingerprint = oldDoc && newDoc ? await computeSourceFingerprint(oldDoc, newDoc) : null;
        if (!fingerprint || fingerprint !== batch.source_fingerprint) {
          batch.status = "STALE";
          batch.retry_reason = "政策来源已在其他标签页变更，待生效结果作废，请重新比较";
          batch.updated_at = now();
          changed = true;
        }
      }
      if (changed) await this.persist();
    },

    /** 待处理区的备注重新挂接：从原批次 unmatched_notes 移出，挂到生效批次的差异结果上。 */
    async relinkNote(noteId: number, targetResultId: number): Promise<void> {
      const active = this.activeBatch;
      if (!active) return;
      for (const batch of this.batches) {
        const index = batch.unmatched_notes.findIndex((note) => note.id === noteId);
        if (index >= 0) {
          const [note] = batch.unmatched_notes.splice(index, 1);
          active.notes.push({ ...note, diff_result_id: targetResultId });
          batch.updated_at = now();
          active.updated_at = now();
          await this.persist();
          return;
        }
      }
    },

    /** 待处理区的备注确认无处可挂，丢弃。 */
    async discardNote(noteId: number): Promise<void> {
      for (const batch of this.batches) {
        const index = batch.unmatched_notes.findIndex((note) => note.id === noteId);
        if (index >= 0) {
          batch.unmatched_notes.splice(index, 1);
          batch.updated_at = now();
          await this.persist();
          return;
        }
      }
    },

    /** 风险标注页：给生效批次中某条款的差异结果添加审阅备注。 */
    async addNoteForSection(sectionId: number, tag: string, comment: string, reviewer: string): Promise<void> {
      const active = this.activeBatch;
      if (!active) throw wrapError(new Error("当前没有已生效的比较结果"), ERROR_CODES.BATCH_NOT_FOUND);
      const result = active.results.find((item) => item.section_id === sectionId);
      if (!result) throw wrapError(new Error("该条款不在生效批次中，无法挂接审阅备注"), ERROR_CODES.VALIDATION_FAILED);
      const note = createDefaultReviewNote({
        id: active.notes.reduce((max, item) => Math.max(max, item.id), 0) + 1,
        diff_result_id: result.id,
        tag,
        comment,
        reviewer,
        status: "OPEN"
      });
      active.notes.push(note);
      active.updated_at = now();
      await this.persist();
    },

    async updateNoteStatus(noteId: number, status: ReviewNote["status"]): Promise<void> {
      const active = this.activeBatch;
      if (!active) return;
      const note = active.notes.find((item) => item.id === noteId);
      if (note) {
        note.status = status;
        active.updated_at = now();
        await this.persist();
      }
    },

    /** 供页面读取某文档的条款段落（风险标注页用）。 */
    async sectionsForDocument(documentId: number) {
      return listPolicySection(documentId);
    }
  }
});
