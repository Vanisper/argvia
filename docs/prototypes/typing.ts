// 候选接口的编译期实验，仅包含类型声明
export {}

type Option<T> = { readonly output: T }
type Argument<Name extends string, T> = { readonly name: Name; readonly output: T }

declare const argument: {
  string<const Name extends string>(name: Name, config: { required: true }): Argument<Name, string>
  string<const Name extends string>(name: Name, config?: { required?: false }): Argument<Name, string | undefined>
}

declare const option: {
  number(config: { default: number; required?: never }): Option<number>
  number(config: { required: true; default?: never }): Option<number>
  number(config?: { required?: false; default?: never }): Option<number | undefined>
  string(config: { required: true; default?: never }): Option<string>
  string(config: { default: string; required?: never }): Option<string>
  string(config?: { required?: false; default?: never }): Option<string | undefined>
  boolean(): Option<boolean>
  enum<const Choices extends readonly string[]>(
    choices: Choices,
    config: { default: NoInfer<Choices[number]>; required?: never },
  ): Option<Choices[number]>
}

type InferArguments<Args extends readonly Argument<string, unknown>[]> = {
  [Field in Args[number] as Field['name']]: Field['output']
}

type InferOptions<Options extends Readonly<Record<string, Option<unknown>>>> = {
  -readonly [Key in keyof Options]: Options[Key]['output']
}

declare function defineCommand<
  const Args extends readonly Argument<string, unknown>[],
  const Options extends Readonly<Record<string, Option<unknown>>>,
>(definition: {
  description?: string
  args: Args
  options: Options
  run(context: {
    args: InferArguments<Args>
    options: InferOptions<Options>
  }): unknown | Promise<unknown>
}): unknown

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T

const sharedOptions = {
  port: option.number({ default: 3000 }),
  mode: option.enum(['dev', 'prod'], { default: 'dev' }),
  token: option.string(),
  verbose: option.boolean(),
  retries: option.number({ required: true }),
}

defineCommand({
  description: '部署应用',
  args: [argument.string('entry', { required: true }), argument.string('label')],
  options: sharedOptions,
  async run({ args, options }) {
    type Entry = Expect<Equal<typeof args.entry, string>>
    type Label = Expect<Equal<typeof args.label, string | undefined>>
    type Port = Expect<Equal<typeof options.port, number>>
    type Mode = Expect<Equal<typeof options.mode, 'dev' | 'prod'>>
    type Token = Expect<Equal<typeof options.token, string | undefined>>
    type Verbose = Expect<Equal<typeof options.verbose, boolean>>
    type Retries = Expect<Equal<typeof options.retries, number>>

    // @ts-expect-error 未声明的选项应在编译期报错
    options.missing
    // @ts-expect-error 可选值不能作为必有字符串使用
    const token: string = options.token
    return [args.entry, options.port, options.mode]
  },
})

// @ts-expect-error 默认值不能扩大枚举的取值范围
option.enum(['dev', 'prod'], { default: 'test' })
// @ts-expect-error 数值选项的默认值必须是数值
option.number({ default: '3000' })
// @ts-expect-error 必须显式输入与提供默认值互斥
option.number({ required: true, default: 3000 })
