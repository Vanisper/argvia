import type {
  InferValue,
  OptionSpec,
  ParseConfig,
  ParsedArguments,
  ParsedValues,
  Repeat,
  ValueParser,
} from "@argvia/parser";

/** 选项解析规则与帮助元数据共用一份声明 */
export interface CommandOption<T = unknown> extends OptionSpec<T> {
  readonly description?: string;
  readonly valueName?: string;
}

/** 位置参数默认可选；变长参数只能位于末尾 */
export interface ArgumentSpec<T = unknown> {
  readonly name: string;
  readonly parse: ValueParser<T>;
  readonly description?: string;
  readonly required?: boolean;
  readonly variadic?: boolean;
}

type IsUnion<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;

type EffectiveVariadic<A> = "variadic" extends keyof A
  ? Exclude<A["variadic"], undefined> | (undefined extends A["variadic"] ? false : never)
  : false;

type ReducedArgument<A, Variadic> = Variadic extends true
  ? readonly InferValue<A>[]
  : InferValue<A>;

/** 宽化的 variadic 同时保留单值与数组的可能 */
export type ArgumentValue<A extends ArgumentSpec> = A extends unknown
  ? ReducedArgument<A, EffectiveVariadic<A>>
  : never;

type MissingArgument<A, Variadic> = Variadic extends true
  ? false
  : A extends { readonly required: true }
    ? false
    : true;

type MayBeMissing<A> = A extends ArgumentSpec ? MissingArgument<A, EffectiveVariadic<A>> : never;

type NamedArguments<
  A extends readonly ArgumentSpec[],
  Name extends string,
> = A[number] extends infer P
  ? P extends ArgumentSpec
    ? [Name & P["name"]] extends [never]
      ? never
      : P
    : never
  : never;

type TupleHasName<A extends readonly ArgumentSpec[], Name extends string> = A extends readonly [
  infer Head extends ArgumentSpec,
  ...infer Tail extends readonly ArgumentSpec[],
]
  ? [Head["name"]] extends [Name]
    ? string extends Head["name"]
      ? TupleHasName<Tail, Name>
      : true
    : TupleHasName<Tail, Name>
  : false;

type HasCertainName<
  A extends readonly ArgumentSpec[],
  Name extends string,
> = number extends A["length"]
  ? false
  : Record<never, never> extends Record<Name, unknown>
    ? false
    : true extends IsUnion<A>
      ? false
      : TupleHasName<A, Name>;

type CertainNames<A extends readonly ArgumentSpec[]> = {
  [Name in A[number]["name"]]: HasCertainName<A, Name> extends true ? Name : never;
}[A[number]["name"]];

type RequiredValueNames<A extends readonly ArgumentSpec[]> = {
  [Name in A[number]["name"]]: HasCertainName<A, Name> extends true
    ? true extends MayBeMissing<NamedArguments<A, Name>>
      ? never
      : Name
    : never;
}[A[number]["name"]];

/** 可选单值缺席时省略键，已知变长参数始终有数组 */
export type ArgumentValues<A extends readonly ArgumentSpec[]> = {
  readonly [Name in RequiredValueNames<A>]: ArgumentValue<NamedArguments<A, Name>>;
} & {
  readonly [Name in Exclude<A[number]["name"], RequiredValueNames<A>>]?: ArgumentValue<
    NamedArguments<A, Name>
  >;
};

/** 每个值保留原文、归一化结果与传入 argv 的下标 */
export interface ArgumentValueRecord<T = unknown> {
  readonly value: T;
  readonly raw: string;
  readonly normalized: string;
  readonly index: number;
}

export type ArgumentProvided<A extends readonly ArgumentSpec[]> = {
  readonly [Name in CertainNames<A>]: boolean;
} & {
  readonly [Name in Exclude<A[number]["name"], CertainNames<A>>]?: boolean;
};

/** 已知名称总有记录数组，未提供时为空 */
export type ArgumentRecords<A extends readonly ArgumentSpec[]> = {
  readonly [Name in CertainNames<A>]: readonly ArgumentValueRecord<
    InferValue<NamedArguments<A, Name>>
  >[];
} & {
  readonly [Name in Exclude<A[number]["name"], CertainNames<A>>]?: readonly ArgumentValueRecord<
    InferValue<NamedArguments<A, Name>>
  >[];
};

export interface ParsedPositionals<A extends readonly ArgumentSpec[]> {
  readonly values: ArgumentValues<A>;
  readonly provided: ArgumentProvided<A>;
  readonly records: ArgumentRecords<A>;
}

/** 处理函数只接收业务字段，完整来源由 source 保留 */
export interface CommandInput<
  S extends readonly CommandOption[],
  A extends readonly ArgumentSpec[],
> {
  readonly options: ParsedValues<S>;
  readonly arguments: ArgumentValues<A>;
  readonly source: {
    readonly options: ParsedArguments<S>;
    readonly arguments: ParsedPositionals<A>;
  };
}

export interface HelpOption {
  readonly long: string;
  readonly short?: string;
  readonly description?: string;
  readonly valueName?: string;
  readonly required: boolean;
  readonly repeat: Repeat;
  readonly bare: boolean;
}

export interface HelpArgument {
  readonly name: string;
  readonly description?: string;
  readonly required: boolean;
  readonly variadic: boolean;
}

/** 结构化帮助不依赖终端或输出流 */
export interface HelpDocument {
  readonly name: string;
  readonly description?: string;
  readonly usage: string;
  readonly options: readonly HelpOption[];
  readonly arguments: readonly HelpArgument[];
}

export interface HelpRequest {
  readonly kind: "help";
  readonly document: HelpDocument;
}

export interface VersionRequest {
  readonly kind: "version";
  readonly version: string;
}

/** parse 不调用处理函数，帮助和版本也不产生业务输入 */
export type CommandParseResult<
  S extends readonly CommandOption[],
  A extends readonly ArgumentSpec[],
> = { readonly kind: "input"; readonly input: CommandInput<S, A> } | HelpRequest | VersionRequest;

/** 等待处理函数完成，普通返回值不解释为输出或退出码 */
export type CommandExecuteResult<
  S extends readonly CommandOption[],
  A extends readonly ArgumentSpec[],
  R,
> =
  | { readonly kind: "executed"; readonly input: CommandInput<S, A>; readonly value: Awaited<R> }
  | HelpRequest
  | VersionRequest;

/** 同一对象提供独立解析与解析后执行，两次调用彼此独立 */
export interface Command<S extends readonly CommandOption[], A extends readonly ArgumentSpec[], R> {
  readonly help: HelpDocument;
  parse(argv: readonly string[]): CommandParseResult<S, A>;
  execute(argv: readonly string[]): Promise<CommandExecuteResult<S, A, R>>;
}

type RequiredSpecField<Key extends string, Specs extends readonly unknown[]> = [Specs] extends [
  readonly [],
]
  ? unknown
  : { readonly [K in Key]: Specs };

/** 输入类型来自声明；非空规格必须同时提供对应的声明字段 */
export type CommandDefinition<
  S extends readonly CommandOption[],
  A extends readonly ArgumentSpec[],
  R,
> = {
  readonly name: string;
  readonly description?: string;
  readonly help?: boolean;
  readonly version?: string;
  readonly parser?: ParseConfig;
  readonly options?: S;
  readonly arguments?: A;
  readonly handler: (input: NoInfer<CommandInput<S, A>>) => R;
} & RequiredSpecField<"options", NoInfer<S>> &
  RequiredSpecField<"arguments", NoInfer<A>>;
