import type { PolicySection } from "../types/PolicySection";
import type { DiffResult } from "../types/DiffResult";
import { DiffType } from "../constants/DiffType";
import { createDiffResultRow } from "../constructors/DiffResultConstructor";

/** 段落对齐结果：按条款段落重新算好新旧对应关系 */
export interface SectionAlignment {
  key: string;
  type: (typeof DiffType)[number];
  oldSection: PolicySection | null;
  newSection: PolicySection | null;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, "").trim();
}

function isSameContent(a: PolicySection, b: PolicySection): boolean {
  return normalizeText(a.heading) === normalizeText(b.heading)
    && normalizeText(a.content) === normalizeText(b.content);
}

/**
 * 以 section_no 为主键对齐两版段落，再对未匹配项做标题/正文的 MOVED 兜底。
 * 产出每个条款段落唯一的对齐关系，供差异计算逐条消费（断点续算的最小单元）。
 */
export function alignSections(
  oldSections: PolicySection[],
  newSections: PolicySection[]
): SectionAlignment[] {
  const oldByNo = new Map(oldSections.map((section) => [section.section_no, section]));
  const newByNo = new Map(newSections.map((section) => [section.section_no, section]));
  const allNos = Array.from(
    new Set([...oldByNo.keys(), ...newByNo.keys()])
  ).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));

  const alignments: SectionAlignment[] = [];
  const matchedOldNos = new Set<string>();

  for (const no of allNos) {
    const oldSection = oldByNo.get(no) ?? null;
    const newSection = newByNo.get(no) ?? null;
    if (oldSection && newSection) {
      matchedOldNos.add(no);
      alignments.push({
        key: no,
        type: isSameContent(oldSection, newSection) ? DiffType[4] /* UNCHANGED */ : DiffType[2] /* MODIFIED */,
        oldSection,
        newSection
      });
    } else if (newSection) {
      // 新版独有段落号：尝试在未匹配旧段落里找同标题同正文 -> MOVED
      const movedFrom = oldSections.find(
        (candidate) =>
          !matchedOldNos.has(candidate.section_no) && isSameContent(candidate, newSection)
      );
      if (movedFrom) {
        matchedOldNos.add(movedFrom.section_no);
        alignments.push({ key: no, type: DiffType[3] /* MOVED */, oldSection: movedFrom, newSection });
      } else {
        alignments.push({ key: no, type: DiffType[0] /* ADDED */, oldSection: null, newSection });
      }
    }
  }

  for (const oldSection of oldSections) {
    if (matchedOldNos.has(oldSection.section_no)) continue;
    alignments.push({
      key: `del:${oldSection.section_no}`,
      type: DiffType[1] /* REMOVED */,
      oldSection,
      newSection: null
    });
  }

  return alignments;
}

function summarize(alignment: SectionAlignment): string {
  const { type, oldSection, newSection } = alignment;
  switch (type) {
    case DiffType[0]:
      return `新增条款 ${newSection?.section_no} ${newSection?.heading ?? ""}`.trim();
    case DiffType[1]:
      return `删除条款 ${oldSection?.section_no} ${oldSection?.heading ?? ""}`.trim();
    case DiffType[3]:
      return `条款由第 ${oldSection?.section_no} 条移动到第 ${newSection?.section_no} 条`;
    case DiffType[4]:
      return "条款内容未变化";
    default:
      return `条款 ${newSection?.section_no} ${newSection?.heading ?? ""} 内容发生修改`;
  }
}

export interface DiffTaskContext {
  batchId: number;
  oldDocumentId: number;
  newDocumentId: number;
  nextRowId: () => number;
  now: () => string;
}

/** 单段落差异计算（断点续算时只重放未完成 key） */
export function computeDiffRow(
  alignment: SectionAlignment,
  context: DiffTaskContext
): DiffResult {
  const { type, oldSection, newSection } = alignment;
  const sectionNo = newSection?.section_no ?? oldSection?.section_no ?? "";
  return createDiffResultRow({
    id: context.nextRowId(),
    batch_id: context.batchId,
    old_document_id: context.oldDocumentId,
    new_document_id: context.newDocumentId,
    section_id: newSection?.id ?? oldSection?.id ?? 0,
    old_section_id: oldSection?.id ?? null,
    new_section_id: newSection?.id ?? null,
    section_no: sectionNo,
    old_section_no: oldSection?.section_no ?? null,
    diff_type: type,
    summary: summarize(alignment),
    created_at: context.now()
  });
}

/** 测试/降级路径：一次算完全部段落 */
export function computeAllDiffRows(
  oldSections: PolicySection[],
  newSections: PolicySection[],
  context: DiffTaskContext
): DiffResult[] {
  return alignSections(oldSections, newSections).map((alignment) =>
    computeDiffRow(alignment, context)
  );
}
