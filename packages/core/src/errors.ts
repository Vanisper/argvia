/** 命令或字段声明无效，不属于命令行输入错误 */
export class CommandSpecError extends TypeError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "CommandSpecError";
    if (field !== undefined) this.field = field;
  }
}

export type ArgumentErrorCode = "MissingArgument" | "UnexpectedArgument" | "InvalidArgument";

/** 下标继续使用传入命令的 argv 坐标 */
export interface ArgumentErrorDetails {
  readonly argument?: string;
  readonly token?: string;
  readonly index?: number;
  readonly raw?: string;
  readonly expected?: string;
  readonly reason?: string;
}

/** 位置参数的数量或值域不满足声明 */
export class ArgumentError extends Error implements ArgumentErrorDetails {
  readonly code: ArgumentErrorCode;
  readonly details: Readonly<ArgumentErrorDetails>;
  readonly argument?: string;
  readonly token?: string;
  readonly index?: number;
  readonly raw?: string;
  readonly expected?: string;
  readonly reason?: string;

  constructor(code: ArgumentErrorCode, message: string, details: ArgumentErrorDetails = {}) {
    super(message);
    this.name = "ArgumentError";
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.assign(this, this.details);
  }
}
