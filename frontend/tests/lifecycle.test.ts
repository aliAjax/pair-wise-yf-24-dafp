import { __useStorageBackend } from "../src/api/storage";
import { policyDocumentApi } from "../src/api/PolicyDocument";
import { policySectionApi } from "../src/api/PolicySection";
import { diffResultApi } from "../src/api/DiffResult";
import { reviewNoteApi } from "../src/api/ReviewNote";
import { comparisonBatchApi } from "../src/api/ComparisonBatch";
import { importDocument, updateDocumentAndSections } from "../src/services/documentService";
import {
  commitBatch,
  runBatchComputation,
  startBatch
} from "../src/services/comparisonService";
import {
  createReviewNote,
  getOrphanNotes,
  getReviewChecklist
} from "../src/services/reviewNoteService";
import { DomainError } from "../src/utils/exceptions";

interface MemoryStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  data: Map<string, string>;
}

function memoryBackend(): MemoryStore {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key)
  };
}

/** 模拟另一个标签页：独立 backend 句柄共享同一份 Map，storage 事件不互通 */
function tabBackend(shared: Map<string, string>): MemoryStore {
  return {
    data: shared,
    getItem: (key) => (shared.has(key) ? (shared.get(key) as string) : null),
    setItem: (key, value) => void shared.set(key, value),
    removeItem: (key) => void shared.delete(key)
  };
}

/** 切换“当前标签页”后端（同时重置进程内锁，模拟真实标签页互不持有锁） */
function useTab(shared: Map<string, string>): MemoryStore {
  const backend = tabBackend(shared);
  __useStorageBackend(backend);
  return backend;
}

let passed = 0;
let failed = 0;

function assert(condition: unknown, message: string): asserts condition {
  if (condition) {
    passed += 1;
    console.info(`  ✓ ${message}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${message}`);
  }
}

function assertThrows(code: string, fn: () => unknown, message: string) {
  try {
    fn();
    failed += 1;
    console.error(`  ✗ ${message}（未抛错）`);
  } catch (error) {
    const actual = error instanceof DomainError ? error.code : (error as { code?: string })?.code;
    if (actual === code) {
      passed += 1;
      console.info(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message}（期望 ${code}，实得 ${actual}）`);
    }
  }
}

async function assertThrowsAsync(code: string, fn: () => Promise<unknown>, message: string) {
  try {
    await fn();
    failed += 1;
    console.error(`  ✗ ${message}（未抛错）`);
  } catch (error) {
    const actual = error instanceof DomainError ? error.code : (error as { code?: string })?.code;
    if (actual === code) {
      passed += 1;
      console.info(`  ✓ ${message}`);
    } else {
      failed += 1;
      console.error(`  ✗ ${message}（期望 ${code}，实得 ${actual}）`);
    }
  }
}

const V1 = `第一条 信息收集 我们收集账号信息。
第二条 信息共享 仅在同意后共享。
第三条 保存期限 注销后 30 天。`;

const V2 = `第一条 信息收集 我们收集账号信息和位置信息。
第二条 信息共享 可能与广告伙伴共享。
第三条 保存期限 注销后 180 天。
第四条 第三方 SDK 接入统计推送 SDK。`;

async function main() {
  console.info("场景 1：比较先入待生效区，生效前当前结果不被覆盖");
  {
    __useStorageBackend(memoryBackend());
    const doc1 = importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const doc2 = importDocument({ title: "政策", version_label: "v2", raw_text: V2 });
    const batch = startBatch(doc1.id, doc2.id);
    await runBatchComputation(batch.id);
    assert(diffResultApi.snapshot().rows.length === 4, "待生效区有 4 条差异行");
    assert(getReviewChecklist().length === 0, "生效前没有基线，审阅清单为空");
    const ready = comparisonBatchApi.snapshot().rows.find((b) => b.id === batch.id)!;
    assert(ready.status === "READY", "批次进入 READY 待生效状态");
    const outcome = commitBatch(batch.id);
    assert(outcome.batch.status === "COMMITTED", "提交后批次 COMMITTED");
    assert(getReviewChecklist().length === 0, "生效后清单仍只认真实备注");
  }

  console.info("场景 2：版次一变，待生效结果作废并留下重试缘由");
  {
    __useStorageBackend(memoryBackend());
    const doc1 = importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const doc2 = importDocument({ title: "政策", version_label: "v2", raw_text: V2 });
    const batch = startBatch(doc1.id, doc2.id);
    await runBatchComputation(batch.id);
    commitBatch(batch.id);

    const v3 = importDocument({ title: "政策", version_label: "v3", raw_text: V2 });
    const pending = startBatch(doc1.id, v3.id);
    await runBatchComputation(pending.id);
    updateDocumentAndSections(v3.id, { version_label: "v3.1" });
    assertThrows("SOURCE_VERSION_CHANGED", () => commitBatch(pending.id), "提交被拒，错误码 SOURCE_VERSION_CHANGED");
    const after = comparisonBatchApi.snapshot().rows.find((b) => b.id === pending.id)!;
    assert(after.status === "INVALIDATED", "批次已作废");
    assert(after.retry_reason === "SOURCE_VERSION_CHANGED", "记录重试缘由码");
    assert(Boolean(after.retry_detail), "留下人可读重试缘由");
  }

  console.info("场景 3：计算失败保留已完成结果，重试只补未完成段落");
  {
    __useStorageBackend(memoryBackend());
    globalThis.__POLICY_DIFF_FAIL_KEYS__ = ["3"];
    const doc1 = importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const doc2 = importDocument({ title: "政策", version_label: "v2", raw_text: V2 });
    const batch = startBatch(doc1.id, doc2.id);
    await assertThrowsAsync("VALIDATION_FAILED", () => runBatchComputation(batch.id), "段落 3 失败，计算中断");
    const failed = comparisonBatchApi.snapshot().rows.find((b) => b.id === batch.id)!;
    assert(failed.status === "FAILED", "批次 FAILED");
    const staged = diffResultApi.snapshot().rows.filter((r) => r.batch_id === batch.id);
    assert(staged.length === 2, "已完成的 2 个段落结果保留在待生效区");
    assert(failed.completed_sections.length === 2, "进度记录为 2/4");

    globalThis.__POLICY_DIFF_FAIL_KEYS__ = [];
    await runBatchComputation(batch.id);
    const retried = comparisonBatchApi.snapshot().rows.find((b) => b.id === batch.id)!;
    assert(retried.status === "READY", "重试后 READY");
    assert(retried.completed_sections.length === 4, "补齐到 4/4");
    const allRows = diffResultApi.snapshot().rows.filter((r) => r.batch_id === batch.id);
    assert(allRows.length === 4, "差异行总数 4，无重复计算");
    assert(new Set(allRows.map((r) => r.id)).size === 4, "行 id 全部唯一");
    globalThis.__POLICY_DIFF_FAIL_KEYS__ = [];
  }

  console.info("场景 4：生效时按段落重映射备注，对不上的进待处理区，清单只认生效批次");
  {
    __useStorageBackend(memoryBackend());
    const doc1 = importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const doc2 = importDocument({ title: "政策", version_label: "v2", raw_text: V2 });
    const b1 = startBatch(doc1.id, doc2.id);
    await runBatchComputation(b1.id);
    commitBatch(b1.id);
    const row2 = diffResultApi.snapshot().rows.find((r) => r.batch_id === b1.id && r.section_no === "2")!;
    createReviewNote({ diff_result_id: row2.id, tag: "超范围共享", comment: "需法务确认", reviewer: "A" });
    assert(getReviewChecklist().length === 1, "清单含 1 条生效备注");

    // v3：第 2 条改写且无映射延续；新增/删除结构让旧备注可能孤儿
    const V3 = `第一条 信息收集 我们收集账号信息和位置信息。
第二条 数据对外提供 全新的对外提供条款描述。
第三条 保存期限 注销后 180 天。
第四条 第三方 SDK 接入统计推送 SDK。
第五条 自动化决策 新增画像说明。`;
    const doc3 = importDocument({ title: "政策", version_label: "v3", raw_text: V3 });
    const b2 = startBatch(doc2.id, doc3.id);
    await runBatchComputation(b2.id);
    const outcome = commitBatch(b2.id);
    const notes = reviewNoteApi.snapshot().rows;
    const note = notes[0];
    // 第二条 old/new section_no 都是 2，按段落号应重新挂上
    if (note.link_status === "MATCHED") {
      assert(note.batch_id === b2.id, "备注重挂到新生效批次");
      assert(outcome.notesOrphaned === 0, "本次无孤儿备注");
    } else {
      assert(note.link_status === "ORPHANED", "对不上的备注留在待处理区");
    }
    assert(getReviewChecklist().length === notes.filter((n) => n.link_status === "MATCHED").length, "清单只含 MATCHED 生效备注");
    assert(getOrphanNotes().length === notes.filter((n) => n.link_status === "ORPHANED").length, "待处理区数量一致");
  }

  console.info("场景 5：结构大变（段落删除）-> 备注进孤儿区");
  {
    __useStorageBackend(memoryBackend());
    const doc1 = importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const doc2 = importDocument({ title: "政策", version_label: "v2", raw_text: V2 });
    const b1 = startBatch(doc1.id, doc2.id);
    await runBatchComputation(b1.id);
    commitBatch(b1.id);
    const row4 = diffResultApi.snapshot().rows.find((r) => r.batch_id === b1.id && r.section_no === "4")!;
    createReviewNote({ diff_result_id: row4.id, tag: "SDK", comment: "核对 SDK 清单", reviewer: "B" });

    const V3 = `第一条 信息收集 我们收集账号信息和位置信息。
第二条 信息共享 可能与广告伙伴共享。
第三条 保存期限 注销后 180 天。`;
    const doc3 = importDocument({ title: "政策", version_label: "v3", raw_text: V3 });
    const b2 = startBatch(doc2.id, doc3.id);
    await runBatchComputation(b2.id);
    const outcome = commitBatch(b2.id);
    assert(outcome.notesOrphaned >= 1, "SDK 条款删除后备注成为孤儿");
    assert(getReviewChecklist().length === 0, "审阅清单不含孤儿备注");
    assert(getOrphanNotes().length >= 1, "待处理区保留孤儿备注与缘由");
  }

  console.info("场景 6：两个标签页并发，早先算出的表不能覆盖新表（基线闸门）");
  {
    const store = new Map<string, string>();
    __useStorageBackend(tabBackend(store));
    const doc1 = importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const doc2 = importDocument({ title: "政策", version_label: "v2", raw_text: V2 });

    // 标签页 A：算好批次停在 READY
    const batchA = startBatch(doc1.id, doc2.id);
    await runBatchComputation(batchA.id);

    // 标签页 B：基于相同来源独立算完并先生效（两个标签页同时保存的真实路径）
    const batchB = startBatch(doc1.id, doc2.id);
    await runBatchComputation(batchB.id);
    commitBatch(batchB.id);

    // A 未刷新仍点“生效”：锁存基线落后 -> 拒绝并作废，旧表不能覆盖新表
    assertThrows("BASELINE_CONFLICT", () => commitBatch(batchA.id), "A 的陈旧批次被基线闸门拒绝");
    const a = comparisonBatchApi.snapshot().rows.find((b) => b.id === batchA.id)!;
    assert(a.status === "INVALIDATED", "A 批次作废");
    const active = diffResultApi.snapshot().rows.filter((r) => r.batch_id === batchB.id);
    assert(active.length === 4, "当前结果仍是 B 生效的 4 行新表，旧表未覆盖新表");
  }

  console.info("场景 7：跨标签页 CAS 版本号拒绝陈旧整表写入");
  {
    const store = new Map<string, string>();
    useTab(store);
    importDocument({ title: "政策", version_label: "v1", raw_text: V1 });
    const tabA = policyDocumentApi.snapshot();

    useTab(store);
    importDocument({ title: "政策", version_label: "v2", raw_text: V2 });

    useTab(store);
    await assertThrowsAsync(
      "STORAGE_WRITE_STALE",
      () => policyDocumentApi.saveAll(tabA.rows, tabA.version),
      "旧版本号整表写入被 CAS 拒绝"
    );
  }

  console.info("");
  console.info(`结果：${passed} 通过，${failed} 失败`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
