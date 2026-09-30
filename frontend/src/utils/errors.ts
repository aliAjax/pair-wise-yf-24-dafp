import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";

export type AppErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/**
 * 服务/控制器统一包装过的应用异常：
 * 错误码集中在 constants/errorCodes，错误消息模板集中在 constants/errorMessages。
 */
export class AppError extends Error {
  code: AppErrorCode;

  constructor(code: AppErrorCode, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? code);
    this.name = "AppError";
    this.code = code;
  }
}

/** 控制器侧包装异常：任何非 AppError 的异常统一兜底，禁止在全局静默吞掉。 */
export function wrapError(error: unknown, fallback: AppErrorCode = ERROR_CODES.VALIDATION_FAILED): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new AppError(fallback, message);
}
