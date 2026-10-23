/** 命令或字段声明违反定义约束 */
export class CommandSpecError extends TypeError {
  readonly field?: string;

  constructor(message: string, field?: string) {
    super(message);
    this.name = "CommandSpecError";
    if (field !== undefined) this.field = field;
  }
}

export type ArgumentErrorCode = "MissingArgument" | "UnexpectedArgument" | "InvalidArgument";

/** 下标相对于本次公开调用传入的 argv */
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

export type RouteErrorCode = "UnknownCommand" | "MissingCommand";

export interface RouteErrorDetails {
  readonly path: readonly string[];
  readonly token?: string;
  readonly index?: number;
  readonly commands: readonly string[];
}

/** 显式命令路径无法匹配，或执行仍停留在分组 */
export class RouteError extends Error implements RouteErrorDetails {
  readonly code: RouteErrorCode;
  readonly details: Readonly<RouteErrorDetails>;
  readonly path: readonly string[];
  readonly token?: string;
  readonly index?: number;
  readonly commands: readonly string[];

  constructor(code: RouteErrorCode, message: string, details: RouteErrorDetails) {
    super(message);
    this.name = "RouteError";
    this.code = code;
    this.path = Object.freeze([...details.path]);
    this.commands = Object.freeze([...details.commands]);
    if (details.token !== undefined) this.token = details.token;
    if (details.index !== undefined) this.index = details.index;
    this.details = Object.freeze({ ...details, path: this.path, commands: this.commands });
  }
}
