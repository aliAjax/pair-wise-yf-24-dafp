import { ref } from "vue";
import { comparisonController } from "../controllers/comparisonController";
import type { ComputeProgress } from "../services/comparisonService";
import type { ComparisonBatch } from "../types/ComparisonBatch";
import { ControllerError } from "../utils/exceptions";

/**
 * 比较批次编排 composable：发起 -> 增量计算 -> 提交。
 * 页面只与 controller 交互；作废/冲突等错误转换为用户可读信息。
 */
export function useComparisonRun() {
  const running = ref(false);
  const progress = ref<ComputeProgress | null>(null);
  const errorMessage = ref("");

  function explain(error: unknown): string {
    if (error instanceof ControllerError) return error.message;
    if (error instanceof Error) return error.message;
    return "未知错误";
  }

  async function startAndRun(oldDocumentId: number, newDocumentId: number): Promise<ComparisonBatch | null> {
    errorMessage.value = "";
    running.value = true;
    try {
      const batch = comparisonController.start(oldDocumentId, newDocumentId);
      const computed = await comparisonController.compute(batch.id, (next) => {
        progress.value = next;
      }, { useWorker: true });
      return computed;
    } catch (error) {
      errorMessage.value = explain(error);
      return null;
    } finally {
      running.value = false;
    }
  }

  async function retry(batchId: number): Promise<ComparisonBatch | null> {
    errorMessage.value = "";
    running.value = true;
    try {
      return await comparisonController.compute(batchId, (next) => {
        progress.value = next;
      });
    } catch (error) {
      errorMessage.value = explain(error);
      return null;
    } finally {
      running.value = false;
    }
  }

  function commit(batchId: number): boolean {
    errorMessage.value = "";
    try {
      comparisonController.commit(batchId);
      return true;
    } catch (error) {
      errorMessage.value = explain(error);
      return false;
    }
  }

  return { running, progress, errorMessage, startAndRun, retry, commit };
}
