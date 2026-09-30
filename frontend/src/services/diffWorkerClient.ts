import type { DiffResult } from "../types/DiffResult";
import type { SectionAlignment } from "./sectionAlignment";
import type { ComparisonBatch } from "../types/ComparisonBatch";
import { comparisonBatchApi } from "../api/ComparisonBatch";

export interface WorkerComputeParams {
  batchId: number;
  alignments: SectionAlignment[];
  pending: SectionAlignment[];
  rowIds: number[];
  oldDocumentId: number;
  newDocumentId: number;
  onRow: (key: string, row: DiffResult) => void;
  onError: (key: string, message: string) => void;
}

/**
 * 启动 Web Worker 执行逐条差异计算；
 * worker 只产出结果，落盘（CAS、增量进度）全部在主线程回调内完成，
 * 因此 worker/同步两条路径的持久化语义完全一致。
 */
export function runWorkerComputation(params: WorkerComputeParams): Promise<ComparisonBatch> {
  return new Promise((resolve, reject) => {
    // Vite / esbuild 均可识别 new URL + module worker 写法并正确打包
    const worker = new Worker(new URL("../workers/diffWorker.ts", import.meta.url), {
      type: "module"
    });
    const pendingKeys = new Set(params.pending.map((item) => item.key));

    worker.onmessage = (event: MessageEvent<import("../workers/diffWorker").DiffWorkerOutbound>) => {
      const message = event.data;
      if (message.type === "row") {
        params.onRow(message.key, message.row);
      } else if (message.type === "error") {
        params.onError(message.key, message.message);
        worker.terminate();
        resolve(readFinalBatch(params.batchId));
      } else if (message.type === "done") {
        worker.terminate();
        resolve(readFinalBatch(params.batchId));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || "差异计算 Worker 异常"));
    };

    worker.postMessage({
      type: "start",
      alignments: params.alignments,
      batchId: params.batchId,
      oldDocumentId: params.oldDocumentId,
      newDocumentId: params.newDocumentId,
      rowIds: params.rowIds,
      skipKeys: params.alignments.map((item) => item.key).filter((key) => !pendingKeys.has(key))
    } satisfies import("../workers/diffWorker").DiffWorkerStart);
  });
}

function readFinalBatch(batchId: number): ComparisonBatch {
  // 回调内已落盘最新批次状态，这里读取最终快照
  const batch = comparisonBatchApi.snapshot().rows.find((item) => item.id === batchId);
  if (!batch) throw new Error(`批次 #${batchId} 在计算期间消失`);
  return batch;
}
