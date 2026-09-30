import type { DiffResult } from "../types/DiffResult";
import type { ReviewNote } from "../types/ReviewNote";
import { ReviewNoteLinkStatus } from "../constants/ReviewNoteLinkStatus";
import { DiffType } from "../constants/DiffType";
import { createRemappedReviewNote } from "../constructors/ReviewNoteConstructor";

export interface RelinkResult {
  notes: ReviewNote[];
  matched: number;
  orphaned: number;
}

/**
 * 批次生效时按条款段落把旧批次的审阅备注重新挂到新批次：
 * - 优先按 (old_section_id, new_section_id) 精确匹配
 * - 其次按新旧段落号匹配（MOVED 等段落号变化场景）
 * - 对不上的备注保留原内容，标 ORPHANED 留在待处理区，不进入审阅清单
 */
export function relinkReviewNotes(
  previousNotes: ReviewNote[],
  previousRows: DiffResult[],
  newRows: DiffResult[],
  newBatchId: number
): RelinkResult {
  let matched = 0;
  let orphaned = 0;

  const previousRowById = new Map(previousRows.map((row) => [row.id, row]));

  const findNewRow = (oldRow: DiffResult): DiffResult | undefined => {
    if (oldRow.old_section_id != null) {
      const exact = newRows.find(
        (row) => row.old_section_id === oldRow.old_section_id && row.diff_type !== DiffType[0]
      );
      if (exact) return exact;
    }
    if (oldRow.new_section_id != null) {
      const byNewNo = newRows.find(
        (row) => row.section_no === oldRow.section_no && row.diff_type !== DiffType[1]
      );
      if (byNewNo) return byNewNo;
    }
    // 备注原本挂在某段落，该段落若仍未变化，UNCHANGED 行也可承接
    const byOldNo = newRows.find(
      (row) => row.old_section_no === oldRow.old_section_no && row.old_section_no !== null
    );
    return byOldNo;
  };

  const notes = previousNotes.map((note) => {
    // 已经在待处理区的孤儿备注：继续尝试往新批次挂一次，仍对不上则保持待处理
    const oldRow = previousRowById.get(note.diff_result_id);
    if (!oldRow) {
      orphaned += 1;
      return createRemappedReviewNote(note, {
        batch_id: newBatchId,
        link_status: ReviewNoteLinkStatus[1],
        orphan_reason: "原差异结果已不存在，无法匹配条款段落"
      });
    }
    const target = findNewRow(oldRow);
    if (target) {
      // MODIFIED / MOVED / UNCHANGED 段落均承接原备注；ADDED/REMOVED 不会在此命中
      matched += 1;
      return createRemappedReviewNote(note, {
        diff_result_id: target.id,
        batch_id: newBatchId,
        link_status: ReviewNoteLinkStatus[0],
        orphan_reason: null
      });
    }
    orphaned += 1;
    return createRemappedReviewNote(note, {
      batch_id: newBatchId,
      link_status: ReviewNoteLinkStatus[1],
      orphan_reason: `条款段落 ${oldRow.section_no} 在新版本中无法定位`
    });
  });

  return { notes, matched, orphaned };
}
