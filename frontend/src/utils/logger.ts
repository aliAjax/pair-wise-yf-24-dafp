import { LOG_TEMPLATES } from "../constants/logTemplates";

export type LogEntity = keyof typeof LOG_TEMPLATES;

/**
 * 写操作日志：模板集中在 constants/logTemplates，
 * service/controller 多层调用，字段变更时同步模板与调用处。
 */
export function writeLog(entity: LogEntity, templateIndex: number, detail?: unknown): void {
  const templates = LOG_TEMPLATES[entity] ?? [];
  const template = templates[templateIndex] ?? `${entity} 操作`;
  const line = `[${new Date().toISOString()}] ${template}${
    detail !== undefined ? ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""
  }`;
  // eslint-disable-next-line no-console
  console.info(line);
}
