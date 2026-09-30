import type { PolicyDocument } from "../types/PolicyDocument";

/**
 * 政策来源指纹：把 old/new 两版文档的版次标签与正文绑在一起哈希。
 * 待生效批次在生效前用它确认“政策来源没动过”。
 */
function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export async function computeSourceFingerprint(oldDoc: PolicyDocument, newDoc: PolicyDocument): Promise<string> {
  const raw = [
    `old:${oldDoc.id}:${oldDoc.version_label}:${oldDoc.raw_text}`,
    `new:${newDoc.id}:${newDoc.version_label}:${newDoc.raw_text}`
  ].join("|");
  return `fp:${fnv1a(raw)}:${raw.length}`;
}
