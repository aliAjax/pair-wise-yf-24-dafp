import { mockData } from "../mocks/seedData";
import type { PolicySection } from "../types/PolicySection";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { parseSections } from "../utils/diffEngine";

const STORAGE_KEY = "policy-diff:sections";
const endpoint = "/api/policy-section";

function seedSections(): PolicySection[] {
  // 条款段落由政策文本解析生成，保证 id 与分段结果一致
  return mockData.policyDocument.flatMap((doc) => parseSections({ ...doc }));
}

function readStore(): PolicySection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) return JSON.parse(raw) as PolicySection[];
  } catch {
    // 本地存储损坏时回退到种子数据
  }
  const seeded = seedSections();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeStore(sections: PolicySection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sections));
}

export async function listPolicySection(documentId?: number): Promise<PolicySection[]> {
  if (typeof fetch !== "undefined" && endpoint.startsWith("/api") && false) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) return await res.json();
    } catch {
      // Local mock fallback keeps the UI available during offline review.
    }
  }
  const sections = readStore();
  return (documentId == null ? sections : sections.filter((section) => section.document_id === documentId)).map((section) => ({
    ...section
  }));
}

export async function savePolicySection(payload: PolicySection): Promise<PolicySection> {
  const sections = readStore();
  const index = sections.findIndex((section) => section.id === payload.id);
  const isUpdate = index >= 0;
  if (isUpdate) {
    sections[index] = { ...payload };
  } else {
    sections.push({ ...payload });
  }
  writeStore(sections);
  console.info(LOG_TEMPLATES.PolicySection[isUpdate ? 1 : 0], { id: payload.id, section_no: payload.section_no });
  return { ...payload };
}
