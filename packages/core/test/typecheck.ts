import type { Argument, Option } from '@argvia/core'
import { argument, defineCommand, option } from '@argvia/core'
import { expectTypeOf } from 'vitest'

/** 检查命令定义的类型契约，负例只参与编译检查 */
export function verifyTypes(): void {
  const sharedOptions = {
    token: option.string(),
    verbose: option.boolean(),
    retries: option.number({ required: true }),
  }

  const deploy = defineCommand({
    args: [
      argument.string('entry', { required: true }),
      argument.string('label'),
    ],
    options: {
      ...sharedOptions,
      port: option.number({ default: 3000 }),
      mode: option.enum(['dev', 'prod'], { default: 'dev' }),
    },
    async run({ args, options }) {
      expectTypeOf(args.entry).toEqualTypeOf<string>()
      expectTypeOf(args.label).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.port).toEqualTypeOf<number>()
      expectTypeOf(options.mode).toEqualTypeOf<'dev' | 'prod'>()
      expectTypeOf(options.token).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.verbose).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(options.retries).toEqualTypeOf<number>()

      // @ts-expect-error 未声明的选项不可访问
      expectTypeOf(options.missing)
      // @ts-expect-error 可选字符串不能作为必有字符串使用
      expectTypeOf<string>(options.token)
      // @ts-expect-error 可选布尔不能作为必有布尔使用
      expectTypeOf<boolean>(options.verbose)

      return { entry: args.entry, port: options.port }
    },
  })

  const empty = defineCommand({
    run({ args, options }) {
      expectTypeOf(args).toEqualTypeOf<Record<never, never>>()
      expectTypeOf(options).toEqualTypeOf<Record<never, never>>()
      // @ts-expect-error 省略位置参数后不存在动态字段
      expectTypeOf(args.entry)
      // @ts-expect-error 省略选项后不存在动态字段
      expectTypeOf(options.port)
    },
  })

  const sharedArgs = [
    argument.string('entry', { required: true }),
    argument.string('label'),
  ] as const

  const argsOnly = defineCommand({
    args: sharedArgs,
    run({ args, options }) {
      expectTypeOf(args.entry).toEqualTypeOf<string>()
      expectTypeOf(args.label).toEqualTypeOf<string | undefined>()
      expectTypeOf(options).toEqualTypeOf<Record<never, never>>()
    },
  })

  const optionsOnly = defineCommand({
    options: sharedOptions,
    run({ args, options }) {
      expectTypeOf(args).toEqualTypeOf<Record<never, never>>()
      expectTypeOf(options.token).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.verbose).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(options.retries).toEqualTypeOf<number>()
    },
  })

  const overridden = defineCommand({
    options: {
      ...sharedOptions,
      token: option.string({ required: true }),
    },
    run({ options }) {
      expectTypeOf(options.token).toEqualTypeOf<string>()
    },
  })

  const reused = defineCommand({
    options: sharedOptions,
    run({ options }) {
      expectTypeOf(options.token).toEqualTypeOf<string | undefined>()
    },
  })

  const handlerFirst = defineCommand({
    run: async ({ args, options }) => {
      expectTypeOf(args.entry).toEqualTypeOf<string>()
      expectTypeOf(options.port).toEqualTypeOf<number>()
      return options.port
    },
    options: { port: option.number({ default: 3000 }) },
    args: [argument.string('entry', { required: true })],
  })

  const readonlyArgs = [argument.string('entry', { required: true })] as const
  const readonlyOptions = { port: option.number({ default: 3000 }) } as const

  const readonlyDescriptors = defineCommand({
    args: readonlyArgs,
    options: readonlyOptions,
    run({ args, options }) {
      expectTypeOf(args.entry).toEqualTypeOf<string>()
      expectTypeOf(options.port).toEqualTypeOf<number>()
    },
  })

  const enumShapes = defineCommand({
    options: {
      optionalMode: option.enum(['dev', 'prod']),
      requiredMode: option.enum(['dev', 'prod'], { required: true }),
      optionalPort: option.number(),
      defaultLabel: option.string({ default: 'application' }),
      enabled: option.boolean({ default: true }),
      disabled: option.boolean({ default: false }),
      optionalFlag: option.boolean({ description: '可选开关' }),
    },
    run({ options }) {
      expectTypeOf(options.optionalMode).toEqualTypeOf<'dev' | 'prod' | undefined>()
      expectTypeOf(options.requiredMode).toEqualTypeOf<'dev' | 'prod'>()
      expectTypeOf(options.optionalPort).toEqualTypeOf<number | undefined>()
      expectTypeOf(options.defaultLabel).toEqualTypeOf<string>()
      expectTypeOf(options.enabled).toEqualTypeOf<boolean>()
      expectTypeOf(options.disabled).toEqualTypeOf<boolean>()
      expectTypeOf(options.optionalFlag).toEqualTypeOf<boolean | undefined>()
    },
  })

  const choices = ['dev', 'prod'] as const
  const extractedEnum = defineCommand({
    options: { mode: option.enum(choices, { default: 'dev' }) },
    run({ options }) {
      expectTypeOf(options.mode).toEqualTypeOf<'dev' | 'prod'>()
    },
  })

  const group = defineCommand({
    name: 'tool',
    commands: {
      deploy,
      empty,
      argsOnly,
      optionsOnly,
      overridden,
      reused,
      handlerFirst,
      readonlyDescriptors,
      extractedEnum,
      enumShapes,
      nested: defineCommand({ commands: { empty } }),
    },
  })
  defineCommand({ commands: { group } })

  // @ts-expect-error 分组与叶子处理函数不可混合
  defineCommand({ commands: { deploy }, run() {} })
  // @ts-expect-error 分组不提供继承选项
  defineCommand({ commands: { deploy }, options: sharedOptions })
  // @ts-expect-error 子命令必须是经过 defineCommand 处理的定义
  defineCommand({ commands: { raw: { run() {} } } })
  // @ts-expect-error 缺少处理函数和子命令的定义不能执行
  defineCommand({ description: '未完成的命令' })
  // @ts-expect-error explicit undefined 不符合exactOptionalPropertyTypes 契约
  defineCommand({ args: undefined, run() {} })
  // @ts-expect-error explicit undefined 不符合exactOptionalPropertyTypes 契约
  defineCommand({ options: undefined, run() {} })
  // @ts-expect-error 位置参数必须使用描述器
  defineCommand({ args: ['entry'], run() {} })
  // @ts-expect-error 选项必须使用描述器
  defineCommand({ options: { port: 3000 }, run() {} })
  // @ts-expect-error 默认值不能扩大枚举类型
  option.enum(['dev', 'prod'], { default: 'test' })
  // @ts-expect-error 抽出的枚举集合仍然限制默认值
  option.enum(choices, { default: 'test' })
  // @ts-expect-error 数值默认值不能使用字符串
  option.number({ default: '3000' })
  // @ts-expect-error 显式输入要求与默认值互斥
  option.number({ required: true, default: 3000 })
  // @ts-expect-error 布尔默认值不能使用字符串
  option.boolean({ default: 'false' })
  // @ts-expect-error 布尔开关没有必填能力
  option.boolean({ required: true })
  // @ts-expect-error 布尔默认值与显式输入要求互斥
  option.boolean({ required: true, default: false })
  // @ts-expect-error explicit undefined 不符合默认值契约
  option.boolean({ default: undefined })
  defineCommand({
    options: { token: option.string() },
    // @ts-expect-error 处理函数不能把可选选项收窄为必有字符串
    run({ options }: { args: Record<never, never>, options: { token: string } }) {
      return options.token.toUpperCase()
    },
  })

  // 宽泛的显式注解已丢失字段和值类型，defineCommand 无法恢复
  const broadOptions: Readonly<Record<string, Option<unknown>>> = sharedOptions
  defineCommand({
    options: broadOptions,
    run({ options }) {
      expectTypeOf(options.token).toEqualTypeOf<unknown>()
      expectTypeOf(options.missing).toEqualTypeOf<unknown>()
    },
  })

  // 已推宽为 string[] 的变量无法恢复为枚举字面量联合
  const widenedChoices = ['dev', 'prod']
  defineCommand({
    options: { mode: option.enum(widenedChoices, { default: 'dev' }) },
    run({ options }) {
      expectTypeOf(options.mode).toEqualTypeOf<string>()
    },
  })

  const dynamicName: string = 'entry'
  defineCommand({
    args: [argument.string(dynamicName, { required: true })],
    run({ args }) {
      expectTypeOf(args).toEqualTypeOf<Record<string, string | undefined>>()
    },
  })

  const dynamicOptions: Record<string, Option<number>> = { port: option.number({ default: 3000 }) }
  defineCommand({
    options: dynamicOptions,
    run({ options }) {
      expectTypeOf(options).toEqualTypeOf<Record<string, number | undefined>>()
    },
  })

  const conditionalName = Math.random() > 0.5 ? 'entry' : 'file'
  defineCommand({
    args: [argument.string(conditionalName, { required: true })],
    run({ args }) {
      expectTypeOf(args.entry).toEqualTypeOf<string | undefined>()
      expectTypeOf(args.file).toEqualTypeOf<string | undefined>()
    },
  })

  const looseArgs: Argument<'entry', string>[] = []
  defineCommand({
    args: looseArgs,
    run({ args }) {
      expectTypeOf(args.entry).toEqualTypeOf<string | undefined>()
    },
  })

  const conditionalArgs: readonly [] | readonly [Argument<'entry', string>] = Math.random() > 0.5
    ? [argument.string('entry', { required: true })]
    : []
  defineCommand({
    args: conditionalArgs,
    run({ args }) {
      expectTypeOf(args.entry).toEqualTypeOf<string | undefined>()
    },
  })

  const optionalDefinitions: { port?: Option<number> } = { port: option.number({ default: 3000 }) }
  defineCommand({
    options: optionalDefinitions,
    run({ options }) {
      expectTypeOf(options.port).toEqualTypeOf<number | undefined>()
    },
  })
}
