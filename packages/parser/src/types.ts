/** 值域拒绝通过失败结果表达，成功值允许为 undefined */
export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly expected: string; readonly reason?: string };

/** 归一化与解析应确定且无副作用；程序异常由调用方处理 */
export interface ValueParser<T> {
  readonly normalize?: (this: void, raw: string) => string;
  readonly parse: (this: void, normalized: string) => ParseResult<T>;
}

export type Repeat = "last" | "append" | "error";

/** 分离值的贪婪消费配置；显式绑定每次取得一个值 */
export interface ParseConfig {
  readonly greedy?: boolean;
}

/** 使用无前缀的长短名称；默认值属于解析后的值域 */
export interface OptionSpec<T = unknown> {
  readonly long: string;
  readonly short?: string;
  readonly parse: ValueParser<T>;
  readonly defaultWhenBare?: NoInfer<T>;
  readonly defaultWhenAbsent?: NoInfer<T>;
  readonly required?: boolean;
  readonly repeat?: Repeat;
}

export type InferValue<O> = O extends { readonly parse: ValueParser<infer T> } ? T : never;

type CheckDefault<O, Key extends "defaultWhenBare" | "defaultWhenAbsent"> = O extends {
  readonly [K in Key]: unknown;
}
  ? { readonly [K in Key]: O[K] extends InferValue<O> ? O[K] : never }
  : Key extends keyof O
    ? { readonly [K in Key]?: InferValue<O> }
    : unknown;

/** 即使消费者未开启 exactOptionalPropertyTypes，也检查显式默认值 */
export type CheckedOptions<S extends readonly OptionSpec[]> = {
  readonly [K in keyof S]: S[K] &
    CheckDefault<S[K], "defaultWhenBare"> &
    CheckDefault<S[K], "defaultWhenAbsent">;
};

type DefaultValue<O, Key extends string> = Key extends keyof O ? O[Key] : never;
type OccurrenceValue<O> = InferValue<O> | DefaultValue<O, "defaultWhenBare">;
type RetainedValue<O> = OccurrenceValue<O> | DefaultValue<O, "defaultWhenAbsent">;
type IsUnion<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;

type EffectiveRepeat<O> = "repeat" extends keyof O
  ? Exclude<O["repeat"], undefined> | (undefined extends O["repeat"] ? "last" : never)
  : "last";

type ReducedValue<O, R> = R extends "append" ? readonly OccurrenceValue<O>[] : RetainedValue<O>;

/** 归约后的选项值类型；缺席由结果属性的可选性表达 */
export type OptionValue<O extends OptionSpec> = O extends unknown
  ? ReducedValue<O, EffectiveRepeat<O>>
  : never;

type MissingValue<O, Complete extends boolean, R> = R extends "append"
  ? false
  : O extends { readonly defaultWhenAbsent: unknown }
    ? false
    : Complete extends true
      ? O extends { readonly required: true }
        ? false
        : true
      : true;

type MayBeMissing<O, Complete extends boolean> = O extends OptionSpec
  ? MissingValue<O, Complete, EffectiveRepeat<O>>
  : never;

type NamedOptions<S extends readonly OptionSpec[], Name extends string> = S[number] extends infer O
  ? O extends OptionSpec
    ? [Name & O["long"]] extends [never]
      ? never
      : O
    : never
  : never;

type TupleHasName<S extends readonly OptionSpec[], Name extends string> = S extends readonly [
  infer Head extends OptionSpec,
  ...infer Tail extends readonly OptionSpec[],
]
  ? [Head["long"]] extends [Name]
    ? string extends Head["long"]
      ? TupleHasName<Tail, Name>
      : true
    : TupleHasName<Tail, Name>
  : false;

type HasCertainName<
  S extends readonly OptionSpec[],
  Name extends string,
> = number extends S["length"]
  ? false
  : Record<never, never> extends Record<Name, unknown>
    ? false
    : true extends IsUnion<S>
      ? false
      : TupleHasName<S, Name>;

type CertainNames<S extends readonly OptionSpec[]> = {
  [Name in S[number]["long"]]: HasCertainName<S, Name> extends true ? Name : never;
}[S[number]["long"]];

type RequiredValueNames<S extends readonly OptionSpec[], Complete extends boolean> = {
  [Name in S[number]["long"]]: HasCertainName<S, Name> extends true
    ? true extends MayBeMissing<NamedOptions<S, Name>, Complete>
      ? never
      : Name
    : never;
}[S[number]["long"]];

type Values<S extends readonly OptionSpec[], Complete extends boolean> = {
  readonly [Name in RequiredValueNames<S, Complete>]: OptionValue<NamedOptions<S, Name>>;
} & {
  readonly [Name in Exclude<S[number]["long"], RequiredValueNames<S, Complete>>]?: OptionValue<
    NamedOptions<S, Name>
  >;
};

/** 已完成必填检查的值；可选选项仍可没有自有属性 */
export type ParsedValues<S extends readonly OptionSpec[]> = Values<S, true>;

/** 已绑定并归约的值，尚未证明必填选项存在 */
export type PreparedValues<S extends readonly OptionSpec[]> = Values<S, false>;

/** 每个选项是否在输入中显式出现 */
export type ProvidedOptions<S extends readonly OptionSpec[]> = {
  readonly [Name in CertainNames<S>]: boolean;
} & {
  readonly [Name in Exclude<S[number]["long"], CertainNames<S>>]?: boolean;
};

export type ValueSource = "equals" | "attached" | "separated" | "bare-default" | "absent-default";

/** 默认值没有对应原文或 token 下标，对应字段为 null */
export interface ValueRecord<T = unknown> {
  readonly value: T;
  readonly raw: string | null;
  readonly normalized: string | null;
  readonly source: ValueSource;
  readonly index: number | null;
}

/** 按输入顺序保留全部显式出现及其值贡献 */
export interface Occurrence<Name extends string = string, T = unknown> {
  readonly option: Name;
  readonly spelling: string;
  readonly optionToken: string;
  readonly index: number;
  /** 短选项簇内按 Unicode 码点计数，长选项为 null */
  readonly clusterPosition: number | null;
  readonly values: readonly ValueRecord<T>[];
}

type OptionOccurrence<O> = O extends OptionSpec ? Occurrence<O["long"], OccurrenceValue<O>> : never;

export type ParsedOccurrence<S extends readonly OptionSpec[]> = OptionOccurrence<S[number]>;

/** 每个已知选项都有归约记录；缺席且没有默认值时为空数组 */
export type ParsedRecords<S extends readonly OptionSpec[]> = {
  readonly [Name in CertainNames<S>]: readonly ValueRecord<RetainedValue<NamedOptions<S, Name>>>[];
} & {
  readonly [Name in Exclude<S[number]["long"], CertainNames<S>>]?: readonly ValueRecord<
    RetainedValue<NamedOptions<S, Name>>
  >[];
};

/** 下标相对传入 parser 的 argv 数组 */
export interface PositionalToken {
  readonly raw: string;
  readonly index: number;
}

interface ArgumentData<S extends readonly OptionSpec[], Complete extends boolean> {
  readonly values: Values<S, Complete>;
  readonly provided: ProvidedOptions<S>;
  readonly records: ParsedRecords<S>;
  readonly occurrences: readonly ParsedOccurrence<S>[];
  readonly positionals: readonly string[];
  readonly positionalTokens: readonly PositionalToken[];
  readonly terminatorIndex: number | null;
}

declare const argumentStage: unique symbol;

/** 已应用默认值和重复归约，仅延期检查 required */
export interface PreparedArguments<S extends readonly OptionSpec[]> extends ArgumentData<S, false> {
  readonly [argumentStage]: "prepared";
}

/** 已通过必填检查的解析结果 */
export interface ParsedArguments<S extends readonly OptionSpec[]> extends ArgumentData<S, true> {
  readonly [argumentStage]: "parsed";
}

/** 完整解析与分阶段解析共用相同绑定规则 */
export interface Parser<S extends readonly OptionSpec[]> {
  prepare(argv: readonly string[]): PreparedArguments<S>;
  /** 只接受当前 parser 创建的准备结果 */
  complete(prepared: PreparedArguments<S>): ParsedArguments<S>;
  parse(argv: readonly string[]): ParsedArguments<S>;
}
