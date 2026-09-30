import { DiffTypeText } from "../constants/DiffType";
import { PrivacyRiskLevelText } from "../constants/PrivacyRiskLevel";
import { ReviewStatusText } from "../constants/ReviewStatus";
import { BatchStatusText } from "../constants/BatchStatus";

export const formatDate = (value: string) => new Date(value).toLocaleString("zh-CN");
export const formatStatus = (value: string) => value.replace(/_/g, " ");
export const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
export const formatRisk = (value: string) => ({ LOW: "低", MEDIUM: "中", HIGH: "高", CRITICAL: "严重", EXTREME: "极高" }[value] ?? value);
export const formatDiffType = (value: string) => DiffTypeText[value as keyof typeof DiffTypeText] ?? value;
export const formatReviewStatus = (value: string) => ReviewStatusText[value as keyof typeof ReviewStatusText] ?? value;
export const formatBatchStatus = (value: string) => BatchStatusText[value as keyof typeof BatchStatusText] ?? value;
