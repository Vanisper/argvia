import { expectTypeOf } from 'vitest'

// 候选接口的声明验证，仅用于编译检查

declare const output: unique symbol
declare const commandBrand: unique symbol

/** 描述器携带的解析值类型 */
interface Option<Value> {
  readonly [output]?: Value
}

/** 已定义、可挂载为子命令的命令 */
interface Command {
  readonly [commandBrand]: true
}

type OptionMap = Readonly<Record<string, Option<unknown>>>

type InferOptions<Options extends OptionMap> = {
  -readonly [Key in keyof Options]: Options[Key] extends Option<infer Value>
    ? Value | (string extends Key ? undefined : never)
    : undefined
}

interface FieldConfig {
  /** 终端中的长选项拼写，结果字段名仍由对象键决定 */
  flag?: `--${string}`
  description?: string
}

interface OptionalConfig extends FieldConfig {
  required?: false
  default?: never
  multiple?: false
}

interface DefaultConfig<Value> extends FieldConfig {
  default: Value
  required?: never
  multiple?: false
}

interface RequiredConfig extends FieldConfig {
  required: true
  default?: never
  multiple?: false
}

/** 重复输入得到数组，省略输入时得到空数组 */
interface MultipleConfig extends FieldConfig {
  multiple: true
  required?: never
  default?: never
}

interface StringOption {
  (config: MultipleConfig): Option<string[]>
  (config: RequiredConfig): Option<string>
  (config: DefaultConfig<string>): Option<string>
  (config?: OptionalConfig): Option<string | undefined>
}

interface BooleanOption {
  (config: DefaultConfig<boolean>): Option<boolean>
  (config?: OptionalConfig): Option<boolean | undefined>
}

interface EnumOption {
  <const Choices extends readonly string[]>(choices: Choices, config: DefaultConfig<NoInfer<Choices[number]>>): Option<Choices[number]>
  <const Choices extends readonly string[]>(choices: Choices, config?: OptionalConfig): Option<Choices[number] | undefined>
}

declare const option: {
  string: StringOption
  boolean: BooleanOption
  enum: EnumOption
}

/** 开启透传时单独提供 -- 后的原始参数 */
type CommandContext<Options extends OptionMap, Passthrough extends boolean>
  = { options: InferOptions<Options> }
    & (Passthrough extends true ? { passthrough: readonly string[] } : Record<never, never>)

declare function defineCommand<
  const Options extends OptionMap = Record<never, never>,
  const Passthrough extends boolean = false,
>(definition: {
  options?: Options
  passthrough?: Passthrough
  commands?: never
  run: (context: NoInfer<CommandContext<Options, Passthrough>>) => unknown
}): Command

declare function defineCommand<const Commands extends Readonly<Record<string, Command>>>(definition: {
  name?: string
  commands: Commands
  defaultCommand?: NoInfer<keyof Commands & string>
  options?: never
  passthrough?: never
  run?: never
}): Command

/** 检查真实命令所需的候选类型，负例只参与编译检查 */
export function verifyJavaRunDefinition(): void {
  const launchOptions = {
    cwd: option.string(),
    buildTool: option.enum(['auto', 'maven', 'gradle'], { flag: '--tool' }),
    build: option.enum(['auto', 'none']),
    module: option.string(),
    mainClass: option.string({ flag: '--main' }),
    jvmArgs: option.string({ flag: '--jvm-arg', multiple: true }),
    applicationArgs: option.string({ flag: '--arg', multiple: true }),
    buildArgs: option.string({ flag: '--build-arg', multiple: true }),
    includeTests: option.boolean({ flag: '--include-tests' }),
    javaCommand: option.string({ flag: '--java' }),
    buildCommand: option.string({ flag: '--build-command' }),
  }

  const run = defineCommand({
    options: launchOptions,
    passthrough: true,
    async run({ options, passthrough }) {
      expectTypeOf(options.buildTool).toEqualTypeOf<'auto' | 'maven' | 'gradle' | undefined>()
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.buildArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.mainClass).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(passthrough).toEqualTypeOf<readonly string[]>()

      // @ts-expect-error flag 拼写不会成为处理函数的结果字段名
      expectTypeOf(options['jvm-arg'])
      // @ts-expect-error force 只属于 init
      expectTypeOf(options.force)

      const project: {
        buildTool?: 'auto' | 'maven' | 'gradle'
        includeTests?: boolean
        jvmArgs?: string[]
        applicationArgs?: string[]
      } = {}

      const effective = {
        buildTool: options.buildTool ?? project.buildTool ?? 'auto',
        includeTests: options.includeTests ?? project.includeTests ?? false,
        jvmArgs: [...(project.jvmArgs ?? []), ...options.jvmArgs],
        applicationArgs: [
          ...(project.applicationArgs ?? []),
          ...options.applicationArgs,
          ...passthrough,
        ],
      }

      expectTypeOf(effective.buildTool).toEqualTypeOf<'auto' | 'maven' | 'gradle'>()
      expectTypeOf(effective.includeTests).toEqualTypeOf<boolean>()
      return effective
    },
  })

  const plan = defineCommand({
    options: launchOptions,
    passthrough: true,
    run({ options, passthrough }) {
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(passthrough).toEqualTypeOf<readonly string[]>()
      // @ts-expect-error plan 接受透传参数，但不接受 init 的 force
      expectTypeOf(options.force)
      return [...options.applicationArgs, ...passthrough]
    },
  })

  const init = defineCommand({
    options: {
      ...launchOptions,
      force: option.boolean({ default: false }),
    },
    passthrough: true,
    run({ options, passthrough }) {
      expectTypeOf(options.force).toEqualTypeOf<boolean>()
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(passthrough).toEqualTypeOf<readonly string[]>()
      return options.force
    },
  })

  const withoutPassthrough = defineCommand({
    run(context) {
      expectTypeOf(context.options).toEqualTypeOf<Record<never, never>>()
      // @ts-expect-error 未开启透传时不存在 passthrough 上下文
      expectTypeOf(context.passthrough)
    },
  })

  const app = defineCommand({
    name: 'java-run',
    defaultCommand: 'run',
    commands: { run, plan, init },
  })
  expectTypeOf(app).toEqualTypeOf<Command>()
  expectTypeOf(withoutPassthrough).toEqualTypeOf<Command>()

  // @ts-expect-error 默认命令必须是已挂载的子命令
  defineCommand({ commands: { run, plan, init }, defaultCommand: 'missing' })
  // @ts-expect-error 重复字段暂不接受标量默认值
  option.string({ multiple: true, default: 'hello' })
  // @ts-expect-error flag 必须使用长选项前缀
  option.string({ flag: 'jvm-arg' })
  // @ts-expect-error 默认值不能扩大枚举候选集合
  option.enum(['auto', 'maven', 'gradle'], { default: 'other' })
}
