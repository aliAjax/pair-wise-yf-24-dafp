import { computed, ref } from "vue";
import { parsePolicyText, type ParsedSection } from "../services/documentService";

/**
 * 政策文本解析 composable：粘贴文本 -> 自动分段预览，
 * 分段结果供导入面板确认后落库。
 */
export function usePolicyParser() {
  const rawText = ref("");
  const sections = computed<ParsedSection[]>(() =>
    rawText.value.trim() ? parsePolicyText(rawText.value) : []
  );

  const reset = () => {
    rawText.value = "";
  };

  return { rawText, sections, reset };
}
