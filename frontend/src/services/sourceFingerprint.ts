import { stableHash } from "../utils/hash";
import type { PolicyDocument } from "../types/PolicyDocument";
import type { PolicySection } from "../types/PolicySection";

/**
 * 来源指纹：文档 + 其全部段落（按段落号排序）共同决定。
 * 批次提交前重新计算并与建批指纹比对，确认政策来源没动才允许生效。
 * 版次 label / title 修改也会改变指纹，即“版次一变”待生效结果立即作废。
 */
export function computeSourceHash(
  document: PolicyDocument,
  sections: PolicySection[]
): string {
  const ordered = sections
    .filter((section) => section.document_id === document.id)
    .slice()
    .sort((a, b) => a.section_no.localeCompare(b.section_no, "zh-CN", { numeric: true }));
  const body = ordered
    .map((section) => `${section.section_no}${section.heading}${section.content}`)
    .join("");
  const header = [
    document.id,
    document.title,
    document.version_label,
    document.raw_text,
    document.normalized_sections
  ].join("");
  return stableHash(`${header}${body}`);
}
