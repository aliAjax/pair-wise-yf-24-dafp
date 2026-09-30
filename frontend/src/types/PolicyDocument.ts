export interface PolicyDocument {
  id: number;
  title: string;
  version_label: string;
  raw_text: string;
  normalized_sections: string;
  imported_at: string;
  updated_at: string;
  /** 内容指纹，由 document + 全量段落计算，供批次生效前复核来源 */
  content_hash: string;
}
