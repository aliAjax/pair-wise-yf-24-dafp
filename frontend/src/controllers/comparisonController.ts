import { ControllerError, DomainError } from "../utils/exceptions";
import {
  commitBatch,
  invalidateBatchesForDocument,
  runBatchComputation,
  startBatch,
  type CommitOutcome,
  type ComputeProgress
} from "../services/comparisonService";
import type { ComparisonBatch } from "../types/ComparisonBatch";

function wrap<T>(action: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof DomainError) throw new ControllerError(action, error.code, error.detail);
    throw error;
  }
}

async function wrapAsync<T>(action: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError) throw new ControllerError(action, error.code, error.detail);
    throw error;
  }
}

export const comparisonController = {
  start(oldDocumentId: number, newDocumentId: number): ComparisonBatch {
    return wrap("发起比较", () => startBatch(oldDocumentId, newDocumentId));
  },
  async compute(
    batchId: number,
    onProgress?: (progress: ComputeProgress) => void,
    options?: { perItemDelayMs?: number; useWorker?: boolean }
  ): Promise<ComparisonBatch> {
    return wrapAsync("计算差异", () => runBatchComputation(batchId, onProgress, options));
  },
  commit(batchId: number): CommitOutcome {
    return wrap("生效比较结果", () => commitBatch(batchId));
  },
  invalidateForDocument(documentId: number, detail: string): number {
    return wrap("作废待生效批次", () => invalidateBatchesForDocument(documentId, detail));
  }
};
