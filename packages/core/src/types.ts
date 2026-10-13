declare const fieldValue: unique symbol
declare const commandBrand: unique symbol
declare const exitBrand: unique symbol

/** 参数描述器携带的运行时规则 */
export interface FieldRules {
  /** 决定输入转换与帮助中的取值提示 */
  readonly kind: 'string' | 'number' | 'boolean' | 'enum'
  readonly description?: string
  /** 帮助中显示的值标签，省略时使用类型提示或位置参数名 */
  readonly valueName?: string
  /** 是否必须显式提供输入 */
  readonly required: boolean
  /** 输入省略时使用的值 */
  readonly default?: string | number | boolean
  /** 枚举允许的字符串取值 */
  readonly choices?: readonly string[]
}

/** 保留解析值类型的选项描述器 */
export interface Option<Value> extends FieldRules {
  /** 显式长选项拼写，省略时由命令定义中的对象键决定 */
  readonly flag?: `--${string}`
  /** 是否按出现顺序收集字符串，省略输入时得到空数组 */
  readonly multiple?: boolean
  readonly [fieldValue]?: Value
}

/** 按名称写入处理函数上下文的位置参数描述器 */
export interface Argument<Name extends string, Value> extends Option<Value> {
  readonly name: Name
  readonly flag?: never
  readonly multiple?: never
}

/** 参数的帮助说明 */
export interface FieldConfig {
  readonly description?: string
}

/** 选项的帮助说明与终端拼写 */
export interface OptionConfig extends FieldConfig {
  /**
   * 替换对象键对应的默认长选项拼写
   *
   * @description 必须以 -- 和字母开头，后续仅含字母、数字、下划线或连字符；结果字段名仍由对象键决定
   */
  readonly flag?: `--${string}`
}

/** 指定帮助中值占位符的标签 */
export interface ValueNameConfig {
  /** 非空白单行文本，不包含尖括号或首尾空白 */
  readonly valueName?: string
}

/** 收集重复字符串的选项规则，不接受 required 或 default */
export interface MultipleConfig extends OptionConfig, ValueNameConfig {
  /** 每次出现收集一个字符串，每次执行使用独立数组 */
  readonly multiple: true
  readonly required?: never
  readonly default?: never
}

/** 要求调用者显式输入的字段规则 */
export interface RequiredConfig extends FieldConfig {
  readonly required: true
  readonly default?: never
}

/** 省略输入时采用默认值的字段规则 */
export interface DefaultConfig<Value> extends FieldConfig {
  readonly default: Value
  readonly required?: never
}

/** 省略输入时得到 undefined 的字段规则 */
export interface OptionalConfig extends FieldConfig {
  readonly required?: false
  readonly default?: never
}

/** 将有序位置参数映射为按名称访问的值 */
export type InferArguments<Args extends readonly Argument<string, unknown>[]> = {
  -readonly [Name in Args[number]['name']]: ArgumentValue<Args[number], Name>
    | (true extends MissingArgument<Args, Name> ? undefined : never)
}

/** 将选项描述映射为处理函数获得的值 */
export type InferOptions<Options extends Readonly<Record<string, Option<unknown>>>> = {
  -readonly [Key in keyof Options]: OptionValue<Options[Key]> | (string extends Key ? undefined : never)
}

type ArgumentValue<Field, Name extends string> = Field extends Argument<infer FieldName, infer Value>
  ? Name extends FieldName ? Value : never
  : never

type MissingArgument<Args extends readonly Argument<string, unknown>[], Name extends string> = Args extends unknown
  ? number extends Args['length']
    ? true
    : string extends Name
      ? true
      : Extract<Args[number], Argument<Name, unknown>> extends never ? true : false
  : never

type OptionValue<Field> = Field extends Option<infer Value> ? Value : undefined

/** 校验通过后传入处理函数的值 */
export type CommandContext<
  Args extends readonly Argument<string, unknown>[],
  Options extends Readonly<Record<string, Option<unknown>>>,
  Passthrough extends boolean = false,
> = {
  readonly args: InferArguments<Args>
  readonly options: InferOptions<Options>
} & (Passthrough extends true ? {
  /** 首个独立 -- 之后的原始 token，未输入分隔符时为空数组 */
  readonly passthrough: readonly string[]
} : unknown)

/** 命令的帮助元信息 */
export interface CommandMeta {
  /** 根命令在帮助中显示的程序名，省略时使用 argvia */
  readonly name?: string
  readonly description?: string
  /** 当前命令的完整调用示例，非空白单行文本按顺序展示 */
  readonly examples?: readonly string[]
}

/** 已完成定义校验、可交给执行器或命令分组的命令 */
export interface Command extends CommandMeta {
  readonly [commandBrand]: true
}

/** 处理参数后执行业务的叶子命令定义 */
export type LeafDefinition<
  Args extends readonly Argument<string, unknown>[],
  Options extends Readonly<Record<string, Option<unknown>>>,
  Passthrough extends boolean = false,
> = CommandMeta & {
  readonly args?: Args
  readonly options?: Options
  readonly commands?: never
  readonly defaultCommand?: never
  run: (context: NoInfer<CommandContext<Args, Options, Passthrough>>) => unknown
} & (Passthrough extends true ? {
  /** 将首个独立 -- 之后的输入单独作为原始参数提供 */
  readonly passthrough: true
} : {
  readonly passthrough?: false
})

/** 由对象键指定子命令名称的分组定义 */
export interface GroupDefinition<
  Commands extends Readonly<Record<string, Command>> = Readonly<Record<string, Command>>,
> extends CommandMeta {
  readonly commands: Commands
  /** 没有输入或首项为选项时选择的子命令键，帮助标记仍显示当前分组帮助 */
  readonly defaultCommand?: NoInfer<keyof Commands & string>
  readonly args?: never
  readonly options?: never
  readonly run?: never
  readonly passthrough?: never
}

/** 输入错误的诊断，commandPath 包含根程序名 */
export interface InputDiagnostic {
  readonly code: 'unknown-command' | 'unknown-option' | 'duplicate-option' | 'missing-value' | 'invalid-value' | 'missing-required' | 'extra-argument'
  readonly message: string
  readonly commandPath: readonly string[]
}

/** 由 exit 创建、供处理函数返回的显式退出结果 */
export interface ExitResult {
  /** 需要交给进程适配器的退出码，范围为 0..255 */
  readonly exitCode: number
  readonly [exitBrand]: true
}

/** 执行结果，未声明为预期失败的异常通过 Promise 拒绝传播 */
export type RunResult
  = | { readonly kind: 'executed', readonly value: unknown }
    | { readonly kind: 'exit', readonly exitCode: number, readonly commandPath: readonly string[] }
    | { readonly kind: 'failed', readonly message: string, readonly exitCode: number, readonly commandPath: readonly string[] }
    | { readonly kind: 'help', readonly text: string }
    | { readonly kind: 'invalid-input', readonly diagnostic: InputDiagnostic }

/** 显式传入的命令行参数，已去掉运行时及脚本路径 */
export interface RunConfig {
  readonly argv: readonly string[]
}

export interface RuntimeContext {
  args: Record<string, unknown>
  options: Record<string, unknown>
  passthrough?: readonly string[]
}

export interface ResolvedLeaf extends CommandMeta {
  readonly kind: 'leaf'
  readonly args: readonly Argument<string, unknown>[]
  readonly options: Readonly<Record<string, ResolvedOption>>
  readonly passthrough: boolean
  readonly invoke: (context: RuntimeContext) => unknown
}

export interface ResolvedOption {
  readonly name: string
  readonly flag: string
  readonly field: Option<unknown>
}

export interface ResolvedGroup extends CommandMeta {
  readonly kind: 'group'
  readonly commands: Readonly<Record<string, Command>>
  readonly defaultCommand?: string
}

export type ResolvedCommand = ResolvedLeaf | ResolvedGroup

export type ValueConfig = RequiredConfig | DefaultConfig<string | number | boolean> | OptionalConfig
export type InputFailure = Extract<RunResult, { kind: 'invalid-input' }>
export type ParsedInput = { readonly kind: 'parsed', readonly context: RuntimeContext } | InputFailure
export type ParsedValue = { readonly ok: true, readonly value: unknown } | { readonly ok: false, readonly message: string }
