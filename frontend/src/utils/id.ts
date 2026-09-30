/** 顺序 id 生成器：基于存储中现有最大值 + 计数，跨标签页以持久化水位为准 */
export function nextId(existing: Array<{ id: number }>): number {
  return existing.reduce((max, row) => Math.max(max, row.id), 0) + 1;
}

export function nextIdFromWatermark(watermark: number): number {
  return watermark + 1;
}
