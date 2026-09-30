import { computed, unref, type MaybeRef } from "vue";
import { parseSections } from "../utils/diffEngine";
import type { PolicyDocument } from "../types/PolicyDocument";

/** 政策文本 -> 条款段落（按条款段落重新算对应关系的基础）。 */
export function usePolicyParser(doc: MaybeRef<PolicyDocument | null | undefined>) {
  const sections = computed(() => {
    const current = unref(doc);
    return current ? parseSections(current) : [];
  });
  return { sections };
}
