import { mockData } from "../mocks/seedData";
import type { PolicyDocument } from "../types/PolicyDocument";
import { ERROR_CODES } from "../constants/errorCodes";
import { LOG_TEMPLATES } from "../constants/logTemplates";
import { AppError } from "../utils/errors";

const STORAGE_KEY = "policy-diff:documents";
const endpoint = "/api/policy-document";

function readStore(): PolicyDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw != null) return JSON.parse(raw) as PolicyDocument[];
  } catch {
    // 本地存储损坏时回退到种子数据
  }
  const seeded = mockData.policyDocument.map((doc) => ({ ...doc }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

function writeStore(docs: PolicyDocument[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
}

export async function listPolicyDocument(): Promise<PolicyDocument[]> {
  if (typeof fetch !== "undefined" && endpoint.startsWith("/api") && false) {
    try {
      const res = await fetch(endpoint);
      if (res.ok) return await res.json();
    } catch {
      // Local mock fallback keeps the UI available during offline review.
    }
  }
  return readStore().map((doc) => ({ ...doc }));
}

export async function getPolicyDocument(id: number): Promise<PolicyDocument> {
  const doc = (await listPolicyDocument()).find((item) => item.id === id);
  if (!doc) throw new AppError(ERROR_CODES.DOCUMENT_NOT_FOUND, `政策文档 #${id} 不存在`);
  return { ...doc };
}

export async function savePolicyDocument(payload: PolicyDocument): Promise<PolicyDocument> {
  const docs = readStore();
  const index = docs.findIndex((doc) => doc.id === payload.id);
  const isUpdate = index >= 0;
  if (isUpdate) {
    docs[index] = { ...payload };
  } else {
    const nextId = docs.reduce((max, doc) => Math.max(max, doc.id), 0) + 1;
    docs.push({ ...payload, id: payload.id || nextId });
  }
  writeStore(docs);
  console.info(LOG_TEMPLATES.PolicyDocument[isUpdate ? 1 : 0], { id: payload.id, version_label: payload.version_label });
  return { ...payload };
}
