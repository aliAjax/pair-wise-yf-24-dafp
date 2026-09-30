export const ReviewNoteLinkStatus = ["MATCHED", "ORPHANED"] as const;
export type ReviewNoteLinkStatus = (typeof ReviewNoteLinkStatus)[number];
export const ReviewNoteLinkStatusText: Record<ReviewNoteLinkStatus, string> = {
  MATCHED: "已匹配",
  ORPHANED: "待处理"
};
