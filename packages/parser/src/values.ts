import { ValueParserContractError } from "./errors.ts";
import type { ParseResult, ValueParser } from "./types.ts";

/** 构造成功结果，允许值为 undefined */
export function success<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

/** 描述无法解析的目标值域及可选原因 */
export function failure(expected: string, reason?: string): ParseResult<never> {
  return reason === undefined ? { ok: false, expected } : { ok: false, expected, reason };
}

function callbacks<T>(parser: ValueParser<T>): ValueParser<T> {
  if ((typeof parser !== "object" || parser === null) && typeof parser !== "function") {
    throw new ValueParserContractError("值解析器必须提供 parse 函数");
  }

  const { normalize, parse } = parser;
  if (normalize !== undefined && typeof normalize !== "function") {
    throw new ValueParserContractError("值解析器的 normalize 必须是函数");
  }
  if (typeof parse !== "function") {
    throw new ValueParserContractError("值解析器的 parse 必须是函数");
  }

  return normalize === undefined ? { parse } : { normalize, parse };
}

/** 冻结当前回调引用；回调调用不绑定原解析器作为 this */
export function snapshotValueParser<T>(parser: ValueParser<T>): ValueParser<T> {
  return Object.freeze(callbacks(parser));
}

function normalizeValue(normalize: (this: void, raw: string) => string, raw: string): string {
  const normalized = normalize(raw);
  if (typeof normalized !== "string") {
    throw new ValueParserContractError("normalize 必须返回字符串");
  }
  return normalized;
}

function checkedResult<T>(result: ParseResult<T>): ParseResult<T> {
  if (typeof result !== "object" || result === null) {
    throw new ValueParserContractError("parse 必须返回带有 ok 判别字段的结果对象");
  }

  const { ok } = result;
  if (ok === true) {
    if (!Object.hasOwn(result, "value")) {
      throw new ValueParserContractError("成功结果必须包含自有 value 字段");
    }
    return success(result.value);
  }

  if (ok === false) {
    const { expected, reason } = result;
    if (typeof expected !== "string") {
      throw new ValueParserContractError("失败结果的 expected 必须是字符串");
    }
    if (reason !== undefined && typeof reason !== "string") {
      throw new ValueParserContractError("失败结果的 reason 必须是字符串");
    }
    return failure(expected, reason);
  }

  throw new ValueParserContractError("结果的 ok 必须是 true 或 false");
}

/** 按顺序归一化并解析一次；回调异常原样向外传播 */
export function decodeValue<T>(
  parser: ValueParser<T>,
  raw: string,
): { normalized: string; result: ParseResult<T> } {
  const { normalize, parse } = callbacks(parser);
  const normalized = normalize === undefined ? raw : normalizeValue(normalize, raw);
  return { normalized, result: checkedResult(parse(normalized)) };
}

/** 接受所有字符串，保留空白和空字符串 */
function string(): ValueParser<string> {
  return Object.freeze({ parse: (raw: string) => success(raw) });
}

/** 解析十进制安全整数；可用闭区间进一步限制值域 */
function integer(
  options: { readonly min?: number; readonly max?: number } = {},
): ValueParser<number> {
  const min = options.min === undefined ? Number.MIN_SAFE_INTEGER : options.min;
  const max = options.max === undefined ? Number.MAX_SAFE_INTEGER : options.max;
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new RangeError("整数边界必须是有序的安全整数");
  }

  const expected = `safe integer [${min}, ${max}]`;
  return Object.freeze({
    parse(raw: string): ParseResult<number> {
      if (!/^[+-]?\d+$/.test(raw)) return failure(expected);
      const value = Number(raw);
      return Number.isSafeInteger(value) && value >= min && value <= max
        ? success(value)
        : failure(expected);
    },
  });
}

/** 接受大小写敏感的显式布尔文本，不执行真假值转换 */
function boolean(): ValueParser<boolean> {
  const truthy = new Set(["true", "1", "yes", "on"]);
  const falsy = new Set(["false", "0", "no", "off"]);
  return Object.freeze({
    parse(raw: string): ParseResult<boolean> {
      if (truthy.has(raw)) return success(true);
      if (falsy.has(raw)) return success(false);
      return failure("true | 1 | yes | on | false | 0 | no | off");
    },
  });
}

/** 从非空字符串元组建立精确匹配的枚举，保留成员字面量类型 */
function enumeration<const T extends readonly [string, ...string[]]>(
  choices: T,
): ValueParser<T[number]> {
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new RangeError("枚举至少需要一个候选值");
  }
  const members = [...choices];
  if (members.some((choice) => typeof choice !== "string")) {
    throw new TypeError("枚举候选值必须是字符串");
  }

  const accepted = new Set<string>(members);
  const expected = members.map((choice) => JSON.stringify(choice)).join(" | ");
  return Object.freeze({
    parse: (raw: string): ParseResult<T[number]> =>
      accepted.has(raw) ? success(raw as T[number]) : failure(expected),
  });
}

type ParsedValue<T> = T extends ValueParser<infer Value> ? Value : never;

/** 按声明顺序尝试候选解析器；全部失败时列出各候选值域 */
function union<const T extends readonly [ValueParser<unknown>, ...ValueParser<unknown>[]]>(
  parsers: T,
): ValueParser<ParsedValue<T[number]>> {
  if (!Array.isArray(parsers) || parsers.length === 0) {
    throw new RangeError("联合值域至少需要一个解析器");
  }
  const candidates = [...parsers].map((parser) => snapshotValueParser(parser));

  return Object.freeze({
    parse(raw: string): ParseResult<ParsedValue<T[number]>> {
      const expected: string[] = [];
      for (const parser of candidates) {
        const { result } = decodeValue(parser, raw);
        if (result.ok) return success(result.value as ParsedValue<T[number]>);
        expected.push(result.expected);
      }
      return failure(expected.join(" | "));
    },
  });
}

/** 先应用外层归一化，再执行子解析器已有的归一化 */
function normalized<T>(
  child: ValueParser<T>,
  normalize: (this: void, raw: string) => string,
): ValueParser<T> {
  if (typeof normalize !== "function") {
    throw new ValueParserContractError("normalize 必须是函数");
  }
  const { normalize: childNormalize, parse } = snapshotValueParser(child);
  return Object.freeze({
    normalize(raw: string): string {
      const outer = normalizeValue(normalize, raw);
      return childNormalize === undefined ? outer : normalizeValue(childNormalize, outer);
    },
    parse,
  });
}

/** 内置值解析器工厂，可与自定义 ValueParser 组合 */
export const values = Object.freeze({ string, integer, boolean, enumeration, union, normalized });
