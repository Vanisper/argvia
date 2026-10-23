import { decodeValue, ParseError } from "@argvia/parser";
import type { Occurrence, PositionalToken, ValueParser, ValueRecord } from "@argvia/parser";

class CallbackThrown {
  readonly original: unknown;

  constructor(original: unknown) {
    this.original = original;
  }
}

/** 保存回调及结果协议读取时的异常，避免将其误当成 parser 生成的坐标错误 */
export function guardValueParser<T>(parser: ValueParser<T>): ValueParser<T> {
  const { normalize, parse } = parser;
  return Object.freeze({
    ...(normalize === undefined
      ? {}
      : {
          normalize(raw: string): string {
            try {
              return normalize(raw);
            } catch (error) {
              throw new CallbackThrown(error);
            }
          },
        }),
    parse(raw: string) {
      try {
        return decodeValue({ parse }, raw).result;
      } catch (error) {
        throw new CallbackThrown(error);
      }
    },
  });
}

interface ArgumentCoordinates {
  readonly records: Readonly<Record<string, readonly ValueRecord[] | undefined>>;
  readonly occurrences: readonly Occurrence[];
  readonly positionalTokens: readonly PositionalToken[];
  readonly terminatorIndex: number | null;
}

/** 将选中节点的局部来源映射回本次调用的 argv，保留贡献记录的共享关系 */
export function relocateArguments<T extends ArgumentCoordinates>(source: T, offset: number): T {
  if (offset === 0) return source;
  const mapped = new Map<ValueRecord, ValueRecord>();
  const record = (value: ValueRecord): ValueRecord => {
    let relocated = mapped.get(value);
    if (relocated === undefined) {
      relocated = Object.freeze({
        ...value,
        index: value.index === null ? null : value.index + offset,
      });
      mapped.set(value, relocated);
    }
    return relocated;
  };
  const records: Record<string, readonly ValueRecord[]> = Object.create(null);
  for (const name of Object.keys(source.records)) {
    records[name] = Object.freeze(source.records[name]!.map(record));
  }
  return Object.freeze({
    ...source,
    records: Object.freeze(records),
    occurrences: Object.freeze(
      source.occurrences.map((occurrence) =>
        Object.freeze({
          ...occurrence,
          index: occurrence.index + offset,
          values: Object.freeze(occurrence.values.map(record)),
        }),
      ),
    ),
    positionalTokens: Object.freeze(
      source.positionalTokens.map((token) =>
        Object.freeze({ raw: token.raw, index: token.index + offset }),
      ),
    ),
    terminatorIndex: source.terminatorIndex === null ? null : source.terminatorIndex + offset,
  }) as T;
}

/** 选项输入错误使用根 argv 坐标，簇内位置保持不变 */
export function withParseOffset<T>(offset: number, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof CallbackThrown) throw error.original;
    if (offset === 0 || !(error instanceof ParseError)) throw error;
    throw new ParseError(error.code, error.message, {
      ...error.details,
      ...(error.index === undefined ? {} : { index: error.index + offset }),
      ...(error.nextIndex === undefined ? {} : { nextIndex: error.nextIndex + offset }),
    });
  }
}
