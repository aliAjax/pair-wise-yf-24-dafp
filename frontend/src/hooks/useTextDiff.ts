import { computed, unref, type MaybeRef } from "vue";

export interface DiffLine {
  type: "ADDED" | "REMOVED" | "UNCHANGED";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

/** 按行 LCS 对齐两版文本，输出左右并排的差异行。 */
function lcsDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      out.push({ type: "UNCHANGED", oldNo: i + 1, newNo: j + 1, text: oldLines[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "REMOVED", oldNo: i + 1, newNo: null, text: oldLines[i] });
      i++;
    } else {
      out.push({ type: "ADDED", oldNo: null, newNo: j + 1, text: newLines[j] });
      j++;
    }
  }
  while (i < m) {
    out.push({ type: "REMOVED", oldNo: i + 1, newNo: null, text: oldLines[i] });
    i++;
  }
  while (j < n) {
    out.push({ type: "ADDED", oldNo: null, newNo: j + 1, text: newLines[j] });
    j++;
  }
  return out;
}

export function useTextDiff(oldText: MaybeRef<string> = "", newText: MaybeRef<string> = "") {
  const oldLines = computed(() => unref(oldText).replace(/\r\n/g, "\n").split("\n"));
  const newLines = computed(() => unref(newText).replace(/\r\n/g, "\n").split("\n"));
  const diffLines = computed<DiffLine[]>(() => lcsDiff(oldLines.value, newLines.value));
  const stats = computed(() => ({
    added: diffLines.value.filter((line) => line.type === "ADDED").length,
    removed: diffLines.value.filter((line) => line.type === "REMOVED").length,
    unchanged: diffLines.value.filter((line) => line.type === "UNCHANGED").length
  }));
  return { diffLines, stats };
}
