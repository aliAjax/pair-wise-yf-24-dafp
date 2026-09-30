import type { PolicyDocument } from "../types/PolicyDocument";
import type { PolicySection } from "../types/PolicySection";
import type { DiffResult } from "../types/DiffResult";
import type { ReviewNote } from "../types/ReviewNote";
import type { DiffBatch } from "../types/DiffBatch";
import type { DiffType } from "../types/DiffType";
import { createDefaultPolicySection } from "../constructors/PolicySectionConstructor";
import { createDefaultDiffResult } from "../constructors/DiffResultConstructor";

/** 条款标题：第 X 条/章/节，或 1. / 1.1 / 1、 开头的编号段落 */
const SECTION_HEADING_RE = /^\s*(第[一二三四五六七八九十百千零\d]+[条章节]|\d+(?:\.\d+)*[、.])\s*(.*)$/;

function normalizeHeading(value: string): string {
  return value.replace(/[\s，。、；：:．·\-—_（）()【】[\]]/g, "").toLowerCase();
}

/** 按条款段落切分政策文本：编号标题成段，正文行归入当前段。 */
export function parseSections(doc: PolicyDocument): PolicySection[] {
  const text = (doc.raw_text ?? "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  const sections: PolicySection[] = [];
  let current: { no: string; heading: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    sections.push(
      createDefaultPolicySection({
        id: doc.id * 1000 + sections.length + 1,
        document_id: doc.id,
        section_no: current.no,
        heading: current.heading,
        content: current.body.join("\n").trim(),
        category: "",
        risk_level: "LOW"
      })
    );
  };

  for (const line of lines) {
    const match = line.match(SECTION_HEADING_RE);
    if (match) {
      flush();
      current = { no: match[1].trim(), heading: (match[2] ?? "").trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else if (line.trim()) {
      current = { no: "0", heading: "前言", body: [line] };
    }
  }
  flush();

  if (sections.length === 0) {
    sections.push(
      createDefaultPolicySection({
        id: doc.id * 1000 + 1,
        document_id: doc.id,
        section_no: "1",
        heading: "全文",
        content: text.trim(),
        category: "",
        risk_level: "LOW"
      })
    );
  }
  return sections;
}

/**
 * 按条款段落重新算对应关系：
 * 先按 section_no 精确匹配，再按归一化标题匹配（处理移条/换号）。
 * 返回 oldSectionId -> newSectionId 的映射。
 */
export function correspondSections(oldSections: PolicySection[], newSections: PolicySection[]): Map<number, number> {
  const correspondence = new Map<number, number>();
  const usedNew = new Set<number>();

  for (const oldSection of oldSections) {
    const target = newSections.find((section) => !usedNew.has(section.id) && section.section_no === oldSection.section_no);
    if (target) {
      correspondence.set(oldSection.id, target.id);
      usedNew.add(target.id);
    }
  }
  for (const oldSection of oldSections) {
    if (correspondence.has(oldSection.id)) continue;
    const oldHeading = normalizeHeading(oldSection.heading);
    if (!oldHeading) continue;
    const target = newSections.find((section) => !usedNew.has(section.id) && normalizeHeading(section.heading) === oldHeading);
    if (target) {
      correspondence.set(oldSection.id, target.id);
      usedNew.add(target.id);
    }
  }
  return correspondence;
}

export interface DiffOutcome {
  results: DiffResult[];
  correspondence: Map<number, number>;
}

/** 逐段比较两版政策，生成差异结果。 */
export function diffDocuments(
  oldDoc: PolicyDocument,
  newDoc: PolicyDocument,
  oldSections: PolicySection[],
  newSections: PolicySection[]
): DiffOutcome {
  const correspondence = correspondSections(oldSections, newSections);
  const newBySection = new Map(newSections.map((section) => [section.id, section]));
  const results: DiffResult[] = [];
  const usedNew = new Set<number>(correspondence.values());
  const now = new Date().toISOString();
  let seq = 1;

  for (const oldSection of oldSections) {
    const newSectionId = correspondence.get(oldSection.id);
    if (newSectionId != null) {
      const newSection = newBySection.get(newSectionId)!;
      const unchanged = newSection.content.replace(/\s/g, "") === oldSection.content.replace(/\s/g, "");
      let diffType: DiffType;
      if (unchanged) diffType = "UNCHANGED";
      else if (newSection.section_no !== oldSection.section_no) diffType = "MOVED";
      else diffType = "MODIFIED";
      results.push(
        createDefaultDiffResult({
          id: seq++,
          old_document_id: oldDoc.id,
          new_document_id: newDoc.id,
          section_id: newSection.id,
          diff_type: diffType,
          summary: unchanged
            ? `第 ${newSection.section_no} 条内容未变化`
            : diffType === "MOVED"
              ? `条款从第 ${oldSection.section_no} 条移至第 ${newSection.section_no} 条`
              : `第 ${newSection.section_no} 条内容已修改`,
          created_at: now
        })
      );
    } else {
      results.push(
        createDefaultDiffResult({
          id: seq++,
          old_document_id: oldDoc.id,
          new_document_id: newDoc.id,
          section_id: oldSection.id,
          diff_type: "REMOVED",
          summary: `第 ${oldSection.section_no} 条已删除`,
          created_at: now
        })
      );
    }
  }

  for (const newSection of newSections) {
    if (!usedNew.has(newSection.id)) {
      results.push(
        createDefaultDiffResult({
          id: seq++,
          old_document_id: oldDoc.id,
          new_document_id: newDoc.id,
          section_id: newSection.id,
          diff_type: "ADDED",
          summary: `新增第 ${newSection.section_no} 条`,
          created_at: now
        })
      );
    }
  }

  return { results, correspondence };
}

export interface RemapOutcome {
  notes: ReviewNote[];
  unmatched: ReviewNote[];
}

/**
 * 审阅备注随差异结果重新挂接：
 * 旧备注 -> 旧差异结果 -> 旧条款 ->（条款对应关系）-> 新条款 -> 新差异结果。
 * 对不上的备注留在待处理区（unmatched），不进审阅清单。
 */
export function remapNotes(
  candidates: ReviewNote[],
  oldBatch: DiffBatch | null,
  newResults: DiffResult[],
  oldBatchSections: PolicySection[],
  newSections: PolicySection[]
): RemapOutcome {
  const oldResultById = new Map((oldBatch?.results ?? []).map((result) => [result.id, result]));
  const oldSectionById = new Map(oldBatchSections.map((section) => [section.id, section]));
  const newSectionByNo = new Map(newSections.map((section) => [section.section_no, section]));
  const newSectionByHeading = new Map(newSections.map((section) => [normalizeHeading(section.heading), section]));
  const newResultBySection = new Map(newResults.map((result) => [result.section_id, result]));

  const notes: ReviewNote[] = [];
  const unmatched: ReviewNote[] = [];
  const seen = new Set<number>();

  for (const note of candidates) {
    if (seen.has(note.id)) continue;
    seen.add(note.id);
    const oldResult = oldResultById.get(note.diff_result_id);
    const oldSection = oldResult ? oldSectionById.get(oldResult.section_id) : undefined;
    let targetSection: PolicySection | undefined;
    if (oldSection) {
      targetSection =
        newSectionByNo.get(oldSection.section_no) ??
        (normalizeHeading(oldSection.heading) ? newSectionByHeading.get(normalizeHeading(oldSection.heading)) : undefined);
    }
    const targetResult = targetSection ? newResultBySection.get(targetSection.id) : undefined;
    if (targetResult) {
      notes.push({ ...note, diff_result_id: targetResult.id });
    } else {
      unmatched.push({ ...note });
    }
  }

  return { notes, unmatched };
}
