import { ERROR_CODES } from "../constants/errorCodes";
import { ERROR_MESSAGES } from "../constants/errorMessages";

export type ErrorCode = keyof typeof ERROR_CODES;

/** service 层包装的领域异常 */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly detail?: unknown;

  constructor(code: ErrorCode, detail?: unknown) {
    super(ERROR_MESSAGES[code]);
    this.name = "DomainError";
    this.code = code;
    this.detail = detail;
  }
}

/** controller 层二次包装：保留原错误码，附加上下文动作 */
export class ControllerError extends Error {
  readonly code: ErrorCode;
  readonly action: string;
  readonly cause?: unknown;

  constructor(action: string, code: ErrorCode, cause?: unknown) {
    super(`${action}失败：${ERROR_MESSAGES[code]}`);
    this.name = "ControllerError";
    this.action = action;
    this.code = code;
    this.cause = cause;
  }
}
