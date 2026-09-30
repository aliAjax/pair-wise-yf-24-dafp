import { ControllerError, DomainError } from "../utils/exceptions";
import {
  importDocument,
  updateDocumentAndSections,
  type ImportInput
} from "../services/documentService";
import type { PolicyDocument } from "../types/PolicyDocument";

export const documentController = {
  importDocument(input: ImportInput): PolicyDocument {
    try {
      return importDocument(input);
    } catch (error) {
      if (error instanceof DomainError) throw new ControllerError("导入政策文档", error.code, error.detail);
      throw error;
    }
  },
  updateDocument(
    documentId: number,
    patch: { title?: string; version_label?: string; raw_text?: string }
  ): { document: PolicyDocument; invalidatedBatches: number } {
    try {
      return updateDocumentAndSections(documentId, patch);
    } catch (error) {
      if (error instanceof DomainError) throw new ControllerError("编辑政策文档", error.code, error.detail);
      throw error;
    }
  }
};
