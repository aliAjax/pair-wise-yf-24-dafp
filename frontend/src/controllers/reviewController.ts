import { ControllerError, DomainError } from "../utils/exceptions";
import {
  createReviewNote,
  exportChecklistMarkdown,
  getOrphanNotes,
  getReviewChecklist,
  resolveOrphanNote,
  updateReviewNote,
  type NoteInput
} from "../services/reviewNoteService";
import { tagSectionRisk } from "../services/riskService";
import type { PrivacyRiskLevel } from "../constants/PrivacyRiskLevel";

function wrap<T>(action: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof DomainError) throw new ControllerError(action, error.code, error.detail);
    throw error;
  }
}

export const reviewController = {
  addNote(input: NoteInput) {
    return wrap("添加审阅备注", () => createReviewNote(input));
  },
  updateNote(noteId: number, patch: Parameters<typeof updateReviewNote>[1]) {
    return wrap("更新审阅备注", () => updateReviewNote(noteId, patch));
  },
  checklist(status?: Parameters<typeof getReviewChecklist>[0]) {
    return wrap("读取审阅清单", () => getReviewChecklist(status));
  },
  orphans() {
    return wrap("读取待处理备注", () => getOrphanNotes());
  },
  resolveOrphan(noteId: number, target: Parameters<typeof resolveOrphanNote>[1]) {
    return wrap("处理待处理备注", () => resolveOrphanNote(noteId, target));
  },
  exportMarkdown() {
    return wrap("导出审阅摘要", () => exportChecklistMarkdown());
  },
  tagRisk(sectionId: number, patch: { category?: string; risk_level?: PrivacyRiskLevel }) {
    return wrap("风险标注", () => tagSectionRisk(sectionId, patch));
  }
};
