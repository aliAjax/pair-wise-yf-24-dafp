/// <reference lib="webworker" />
import { computeDiffRow, type SectionAlignment } from "../services/sectionAlignment";
import { shouldFailSection } from "../services/failureInjection";
import type { DiffResult } from "../types/DiffResult";

export interface DiffWorkerStart {
  type: "start";
  alignments: SectionAlignment[];
  batchId: number;
  oldDocumentId: number;
  newDocumentId: number;
  /** 行 id 按对齐下标分配（service 已通过水位号预留） */
  rowIds: number[];
  /** 已完成的段落键：重试时跳过，只补没做完的部分 */
  skipKeys: string[];
}

export type DiffWorkerOutbound =
  | { type: "row"; key: string; row: DiffResult }
  | { type: "error"; key: string; message: string }
  | { type: "done" };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<DiffWorkerStart>) => {
  const message = event.data;
  if (message.type !== "start") return;

  const skip = new Set(message.skipKeys);
  const post = (outbound: DiffWorkerOutbound) => scope.postMessage(outbound);

  const runAt = (index: number) => {
    if (index >= message.alignments.length) {
      post({ type: "done" });
      return;
    }
    const alignment = message.alignments[index];
    if (skip.has(alignment.key)) {
      runAt(index + 1);
      return;
    }
    try {
      if (shouldFailSection(alignment.key)) {
        throw new Error(`故障注入：段落 ${alignment.key} 计算失败`);
      }
      const row = computeDiffRow(alignment, {
        batchId: message.batchId,
        oldDocumentId: message.oldDocumentId,
        newDocumentId: message.newDocumentId,
        nextRowId: () => message.rowIds[index],
        now: () => new Date().toISOString()
      });
      post({ type: "row", key: alignment.key, row });
    } catch (error) {
      post({
        type: "error",
        key: alignment.key,
        message: error instanceof Error ? error.message : String(error)
      });
      return; // worker 模式下遇错即停，由主线程落盘 FAILED，重试续算
    }
    runAt(index + 1);
  };

  runAt(0);
};
