import { BatchStatusText, BatchRetryReasonText } from "../constants/BatchStatus";
import { ReviewNoteLinkStatusText } from "../constants/ReviewNoteLinkStatus";

export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString("zh-CN") : "—";
export const formatStatus = (value: string) => value.replace(/_/g, " ");
export const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
export const formatRisk = (value: string) =>
  ({ LOW: "低", MEDIUM: "中", HIGH: "高", CRITICAL: "严重", EXTREME: "极高" }[value] ?? value);
export const formatBatchStatus = (value: string) =>
  BatchStatusText[value as keyof typeof BatchStatusText] ?? value;
export const formatBatchRetryReason = (value: string | null) =>
  value ? BatchRetryReasonText[value as keyof typeof BatchRetryReasonText] ?? value : "—";
export const formatNoteLinkStatus = (value: string) =>
  ReviewNoteLinkStatusText[value as keyof typeof ReviewNoteLinkStatusText] ?? value;
