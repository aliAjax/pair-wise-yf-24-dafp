import { computed, ref } from "vue";
import type { DiffResult } from "../types/DiffResult";
import type { PolicySection } from "../types/PolicySection";
import { alignSections } from "../services/sectionAlignment";
import { DiffType } from "../constants/DiffType";

export type DiffTypeFilter = (typeof DiffType)[number] | "ALL";

/**
 * 文本对比 composable：以条款段落为对齐单元计算左右对应关系，
 * 提供差异类型过滤（不直接落库；落库由比较批次服务负责）。
 */
export function useTextDiff(
  oldSections: () => PolicySection[],
  newSections: () => PolicySection[]
) {
  const filter = ref<DiffTypeFilter>("ALL");
  const keyword = ref("");

  const alignments = computed(() => alignSections(oldSections(), newSections()));

  const filtered = computed(() =>
    alignments.value
      .filter((item) => filter.value === "ALL" || item.type === filter.value)
      .filter(
        (item) =>
          !keyword.value ||
          `${item.oldSection?.heading ?? ""}${item.newSection?.heading ?? ""}${
            item.oldSection?.content ?? ""
          }${item.newSection?.content ?? ""}`.includes(keyword.value)
      )
  );

  const stats = computed(() => {
    const count: Record<string, number> = {};
    for (const item of alignments.value) {
      count[item.type] = (count[item.type] ?? 0) + 1;
    }
    return count;
  });

  return { filter, keyword, alignments, filtered, stats };
}

/** 分页工具：清单/表格共用 */
export function usePagedRows<T>(rows: () => T[], pageSize = 8) {
  const page = ref(1);
  const pageRows = computed(() =>
    rows().slice((page.value - 1) * pageSize, page.value * pageSize)
  );
  return { page, pageSize, pageRows, total: computed(() => rows().length) };
}

export function rowsForBatch(rows: DiffResult[], batchId: number): DiffResult[] {
  return rows.filter((row) => row.batch_id === batchId);
}
