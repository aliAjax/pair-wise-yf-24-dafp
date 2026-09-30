import { bumpWatermark, casWriteMany } from "../api/storage";
import { policyDocumentApi } from "../api/PolicyDocument";
import { policySectionApi } from "../api/PolicySection";
import type { PolicyDocument } from "../types/PolicyDocument";
import type { PolicySection } from "../types/PolicySection";
import { createPolicyDocumentForm } from "../constructors/PolicyDocumentConstructor";
import { createDefaultPolicySection } from "../constructors/PolicySectionConstructor";
import { DomainError } from "../utils/exceptions";
import { writeLog } from "../utils/logger";
import { computeSourceHash } from "./sourceFingerprint";
import { invalidateBatchesForDocument } from "./comparisonService";

export interface ParsedSection {
  section_no: string;
  heading: string;
  content: string;
}

const CN_DIGITS: Record<string, string> = { 零: "0", 一: "1", 二: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9" };

function cnToNumber(value: string): string {
  if (/^[0-9]+$/.test(value)) return value;
  if (value === "十") return "10";
  let n = 0;
  if (value.includes("百")) {
    const [hundreds, rest] = value.split("百");
    n += (Number(CN_DIGITS[hundreds] ?? 1)) * 100;
    value = rest ?? "";
  }
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    n += (tens ? Number(CN_DIGITS[tens]) : 1) * 10;
    if (ones) n += Number(CN_DIGITS[ones] ?? 0);
  } else if (value) {
    n += Number([...value].map((ch) => CN_DIGITS[ch] ?? "0").join(""));
  }
  return String(n);
}

/** 把粘贴文本按“第X条 / 1. / 一、”切成条款段落 */
export function parsePolicyText(rawText: string): ParsedSection[] {
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sections: ParsedSection[] = [];
  const header = /^(?:第\s*([0-9零一二三四五六七八九十百]+)\s*[条章节]|([0-9]+)[.、）)]|([一二三四五六七八九十百]+)[、.])[\s　:：]*(.*)$/;

  let current: ParsedSection | null = null;
  for (const line of lines) {
    const match = header.exec(line);
    if (match) {
      if (current) sections.push(current);
      const rawNo = match[1] ?? match[2] ?? match[3] ?? String(sections.length + 1);
      const section_no = cnToNumber(rawNo);
      const rest = (match[4] ?? line).trim();
      const spaceAt = rest.search(/[\s 　:：]/);
      const heading = spaceAt > 0 ? rest.slice(0, spaceAt).trim() : rest.slice(0, 12);
      const content = spaceAt > 0 ? rest.slice(spaceAt + 1).trim() : rest;
      current = { section_no, heading: heading || `条款 ${section_no}`, content: content || line };
    } else if (current) {
      current.content += ` ${line}`;
    } else {
      current = { section_no: String(sections.length + 1), heading: `条款 ${sections.length + 1}`, content: line };
    }
  }
  if (current) sections.push(current);
  return sections;
}

function guessCategory(heading: string, content: string): string {
  const text = `${heading}${content}`;
  if (/收集|采集|获取/.test(text)) return "COLLECT";
  if (/共享|分享|转让|提供给|SDK|第三方/.test(text)) return "SHARE";
  if (/保存|存储|期限|留存|删除/.test(text)) return "RETENTION";
  if (/联系|邮箱|电话/.test(text)) return "CONTACT";
  return "GENERAL";
}

function guessRisk(section: ParsedSection): PolicySection["risk_level"] {
  const text = `${section.heading}${section.content}`;
  if (/广告|精确位置|生物|敏感|犯罪/.test(text)) return "CRITICAL";
  if (/共享|SDK|第三方|180|长期/.test(text)) return "HIGH";
  if (/收集|位置|保存期限/.test(text)) return "MEDIUM";
  return "LOW";
}

export interface ImportInput {
  title: string;
  version_label: string;
  raw_text: string;
}

/** 导入文档：文档与全部段落、指纹在一个跨标签页事务里落盘 */
export function importDocument(input: ImportInput): PolicyDocument {
  const parsed = parsePolicyText(input.raw_text);
  if (parsed.length === 0) throw new DomainError("VALIDATION_FAILED", { reason: "无法解析出条款段落" });

  const documentId = bumpWatermark(0);
  const baseId = bumpWatermark(parsed.length - 1);
  const timestamp = new Date().toISOString();

  const sections: PolicySection[] = parsed.map((item, index) =>
    createDefaultPolicySection({
      id: baseId + index,
      document_id: documentId,
      section_no: item.section_no,
      heading: item.heading,
      content: item.content,
      category: guessCategory(item.heading, item.content),
      risk_level: guessRisk(item),
      updated_at: timestamp
    })
  );

  const documentRow = createPolicyDocumentForm({
    ...input,
    id: documentId,
    normalized_sections: String(sections.length),
    imported_at: timestamp,
    updated_at: timestamp,
    content_hash: ""
  });
  documentRow.content_hash = computeSourceHash(documentRow, sections);

  const docSnap = policyDocumentApi.snapshot();
  const sectionSnap = policySectionApi.snapshot();
  casWriteMany([
    { name: "policyDocument", expectedVersion: docSnap.version, rows: [...docSnap.rows, documentRow] },
    { name: "policySection", expectedVersion: sectionSnap.version, rows: [...sectionSnap.rows, ...sections] }
  ]);
  writeLog("PolicyDocument", 0, `#${documentId} ${documentRow.version_label}，段落 ${sections.length}`);
  return { ...documentRow };
}

/**
 * 编辑文档/段落：重算内容指纹，并把引用该来源的待生效批次全部作废。
 * 版次一变 -> 待生效结果立即作废并留下重试缘由。
 */
export function updateDocumentAndSections(
  documentId: number,
  patch: { title?: string; version_label?: string; raw_text?: string; sections?: PolicySection[] }
): { document: PolicyDocument; invalidatedBatches: number } {
  const docSnap = policyDocumentApi.snapshot();
  const sectionSnap = policySectionApi.snapshot();
  const current = docSnap.rows.find((doc) => doc.id === documentId);
  if (!current) throw new DomainError("VALIDATION_FAILED", { documentId });

  const timestamp = new Date().toISOString();
  let nextSections = sectionSnap.rows;
  let nextDoc: PolicyDocument = { ...current, ...patch, raw_text: patch.raw_text ?? current.raw_text, updated_at: timestamp };

  if (patch.raw_text !== undefined && patch.raw_text !== current.raw_text) {
    const parsed = parsePolicyText(patch.raw_text);
    const baseId = bumpWatermark(Math.max(parsed.length - 1, 0));
    nextSections = sectionSnap.rows.filter((section) => section.document_id !== documentId);
    const rebuilt = parsed.map((item, index) =>
      createDefaultPolicySection({
        id: baseId + index,
        document_id: documentId,
        section_no: item.section_no,
        heading: item.heading,
        content: item.content,
        category: guessCategory(item.heading, item.content),
        risk_level: guessRisk(item),
        updated_at: timestamp
      })
    );
    nextSections = [...nextSections, ...rebuilt];
    nextDoc.normalized_sections = String(rebuilt.length);
  } else if (patch.sections) {
    const byId = new Map(patch.sections.map((section) => [section.id, section]));
    nextSections = sectionSnap.rows.map((section) =>
      section.document_id === documentId && byId.has(section.id)
        ? { ...byId.get(section.id)!, document_id: documentId, updated_at: timestamp }
        : section
    );
  }

  nextDoc.content_hash = computeSourceHash(
    nextDoc,
    nextSections.filter((section) => section.document_id === documentId)
  );

  casWriteMany([
    { name: "policyDocument", expectedVersion: docSnap.version, rows: docSnap.rows.map((doc) => (doc.id === documentId ? nextDoc : doc)) },
    { name: "policySection", expectedVersion: sectionSnap.version, rows: nextSections }
  ]);
  writeLog("PolicyDocument", 1, `#${documentId} ${nextDoc.version_label}`);

  const invalidated = invalidateBatchesForDocument(
    documentId,
    `来源文档 #${documentId}（${nextDoc.version_label}）内容或版次被编辑`
  );
  return { document: { ...nextDoc }, invalidatedBatches: invalidated };
}
