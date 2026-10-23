export type ParseErrorCode =
  | "UnknownOption"
  | "MissingValue"
  | "InvalidValue"
  | "DuplicateOption"
  | "MissingRequired";

/** 输入位置相对传入 parser 的 argv；缺失字段表示不适用 */
export interface ParseErrorDetails {
  readonly option?: string;
  readonly token?: string;
  readonly index?: number;
  readonly clusterPosition?: number;
  readonly raw?: string;
  readonly expected?: string;
  readonly reason?: string;
  readonly hint?: string;
  readonly nextToken?: string;
  readonly nextIndex?: number;
}

/** 输入不满足选项语法、值域或必填约束 */
export class ParseError extends Error implements ParseErrorDetails {
  readonly code: ParseErrorCode;
  readonly details: Readonly<ParseErrorDetails>;
  readonly option?: string;
  readonly token?: string;
  readonly index?: number;
  readonly clusterPosition?: number;
  readonly raw?: string;
  readonly expected?: string;
  readonly reason?: string;
  readonly hint?: string;
  readonly nextToken?: string;
  readonly nextIndex?: number;

  constructor(code: ParseErrorCode, message: string, details: ParseErrorDetails = {}) {
    super(message);
    this.name = "ParseError";
    this.code = code;
    this.details = Object.freeze({ ...details });
    Object.assign(this, this.details);
  }
}

/** 选项声明违反定义约束 */
export class OptionSpecError extends TypeError {
  readonly option?: string;

  constructor(message: string, option?: string) {
    super(message);
    this.name = "OptionSpecError";
    if (option !== undefined) this.option = option;
  }
}

/** 值回调的返回值违反协议 */
export class ValueParserContractError extends TypeError {
  constructor(message: string) {
    super(message);
    this.name = "ValueParserContractError";
  }
}
