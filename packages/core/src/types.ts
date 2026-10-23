import type {
  InferValue,
  OptionSpec,
  ParseConfig,
  ParsedArguments,
  ParsedValues,
  PreparedArguments,
  PreparedValues,
  ValueParser,
} from "@argvia/parser";

/** 选项解析规则与展示元数据共用一份声明 */
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

/** 完整命令输入及其选项、位置参数来源 */
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

/** 节点名称、说明与自定义元数据 */
export interface NodeMetadata<N extends string = string> {
  readonly name: N;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export type OptionDescriptions<S extends readonly CommandOption[]> = {
  readonly [K in keyof S]: CommandOption<InferValue<S[K]>>;
};

export type ArgumentDescriptions<A extends readonly ArgumentSpec[]> = {
  readonly [K in keyof A]: ArgumentSpec<InferValue<A[K]>>;
};

export interface CommandDescription<
  S extends readonly CommandOption[] = readonly CommandOption[],
  A extends readonly ArgumentSpec[] = readonly ArgumentSpec[],
  N extends string = string,
> extends NodeMetadata<N> {
  readonly kind: "command";
  readonly options: OptionDescriptions<S>;
  readonly arguments: ArgumentDescriptions<A>;
  readonly parser: Readonly<Required<ParseConfig>>;
}

export interface GroupDescription<
  S extends readonly CommandOption[] = readonly CommandOption[],
  N extends string = string,
> extends NodeMetadata<N> {
  readonly kind: "group";
  readonly options: OptionDescriptions<S>;
  readonly commands: readonly NodeDescription[];
  readonly parser: Readonly<Required<ParseConfig>>;
}

export type NodeDescription = CommandDescription | GroupDescription;

/** 一次完成调用可以显式执行；每次 execute 都独立调用 handler */
export interface ParsedCommand<
  S extends readonly CommandOption[] = readonly CommandOption[],
  A extends readonly ArgumentSpec[] = readonly ArgumentSpec[],
  R = unknown,
  N extends string = string,
> {
  readonly kind: "command";
  readonly name: N;
  readonly definition: CommandDescription<S, A, N>;
  readonly path: readonly string[];
  readonly input: CommandInput<S, A>;
  execute(): Promise<ExecutedCommand<S, A, R, N>>;
}

export interface ParsedGroup<
  S extends readonly CommandOption[] = readonly CommandOption[],
  N extends string = string,
> {
  readonly kind: "group";
  readonly name: N;
  readonly definition: GroupDescription<S, N>;
  readonly path: readonly string[];
  readonly input: CommandInput<S, readonly []>;
}

export type ParsedNode = ParsedCommand | ParsedGroup;

/** 准备结果已有选项归属；complete 缓存完整校验的成功或失败 */
export interface PreparedCommand<
  S extends readonly CommandOption[] = readonly CommandOption[],
  A extends readonly ArgumentSpec[] = readonly ArgumentSpec[],
  R = unknown,
  N extends string = string,
> {
  readonly kind: "command";
  readonly name: N;
  readonly definition: CommandDescription<S, A, N>;
  readonly path: readonly string[];
  readonly options: PreparedValues<S>;
  readonly source: PreparedArguments<S>;
  complete(): ParsedCommand<S, A, R, N>;
}

export interface PreparedGroup<
  S extends readonly CommandOption[] = readonly CommandOption[],
  N extends string = string,
> {
  readonly kind: "group";
  readonly name: N;
  readonly definition: GroupDescription<S, N>;
  readonly path: readonly string[];
  readonly options: PreparedValues<S>;
  readonly source: PreparedArguments<S>;
  complete(): ParsedGroup<S, N>;
}

export type PreparedNode = PreparedCommand | PreparedGroup;

/** 返回值保持业务含义，坐标与 path 属于本次调用 */
export interface ExecutedCommand<
  S extends readonly CommandOption[] = readonly CommandOption[],
  A extends readonly ArgumentSpec[] = readonly ArgumentSpec[],
  R = unknown,
  N extends string = string,
> {
  readonly kind: "executed";
  readonly name: N;
  readonly definition: CommandDescription<S, A, N>;
  readonly path: readonly string[];
  readonly input: CommandInput<S, A>;
  readonly value: Awaited<R>;
}

/** 可组合的节点，定义树与每次调用的状态互相独立 */
export interface CommandNode {
  readonly definition: NodeDescription;
  prepare(argv: readonly string[]): PreparedNode;
  parse(argv: readonly string[]): ParsedNode;
  execute(argv: readonly string[]): Promise<ExecutedCommand>;
}

export interface Command<
  S extends readonly CommandOption[],
  A extends readonly ArgumentSpec[],
  R,
  N extends string = string,
> extends CommandNode {
  readonly definition: CommandDescription<S, A, N>;
  prepare(argv: readonly string[]): PreparedCommand<S, A, R, N>;
  parse(argv: readonly string[]): ParsedCommand<S, A, R, N>;
  execute(argv: readonly string[]): Promise<ExecutedCommand<S, A, R, N>>;
}

export type PreparedOf<C extends CommandNode> = ReturnType<C["prepare"]>;
export type ParsedOf<C extends CommandNode> = ReturnType<C["parse"]>;
export type ExecutedOf<C extends CommandNode> = Awaited<ReturnType<C["execute"]>>;

export interface CommandGroup<
  S extends readonly CommandOption[],
  C extends readonly CommandNode[],
  N extends string = string,
> extends CommandNode {
  readonly definition: GroupDescription<S, N>;
  prepare(argv: readonly string[]): PreparedGroup<S, N> | PreparedOf<C[number]>;
  parse(argv: readonly string[]): ParsedGroup<S, N> | ParsedOf<C[number]>;
  execute(argv: readonly string[]): Promise<ExecutedOf<C[number]>>;
}

type RequiredSpecField<Key extends string, Specs extends readonly unknown[]> = [Specs] extends [
  readonly [],
]
  ? unknown
  : { readonly [K in Key]: Specs };

export type CommandDefinition<
  S extends readonly CommandOption[],
  A extends readonly ArgumentSpec[],
  R,
  N extends string = string,
> = NodeMetadata<N> & {
  readonly parser?: ParseConfig;
  readonly options?: S;
  readonly arguments?: A;
  readonly handler: (input: NoInfer<CommandInput<S, A>>) => R;
  readonly commands?: never;
} & RequiredSpecField<"options", NoInfer<S>> &
  RequiredSpecField<"arguments", NoInfer<A>>;

export type GroupDefinition<
  S extends readonly CommandOption[],
  C extends readonly CommandNode[],
  N extends string = string,
> = NodeMetadata<N> & {
  readonly parser?: ParseConfig;
  readonly options?: S;
  readonly commands: C;
  readonly arguments?: never;
  readonly handler?: never;
} & RequiredSpecField<"options", NoInfer<S>>;
