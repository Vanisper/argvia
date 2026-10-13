import type { DefaultConfig, MultipleConfig, Option, OptionConfig, RequiredConfig } from '@argvia/core'
import { argument, defineCommand, option } from '@argvia/core'
import { expectTypeOf } from 'vitest'

/** 检查终端拼写与处理函数字段之间的类型契约，负例只参与编译检查 */
export function verifyInputTypes(): void {
  const sharedConfig: OptionConfig = { flag: '--shared-value', description: '共享配置' }
  const requiredConfig: RequiredConfig & OptionConfig = { required: true, flag: '--required-value' }
  const defaultConfig: DefaultConfig<number> & OptionConfig = { default: 3000, flag: '--port' }

  defineCommand({
    args: [argument.string('entry', { required: true })],
    options: {
      hostName: option.string({ flag: '--host' }),
      serverPort: option.number(defaultConfig),
      includeTests: option.boolean({ flag: '--include-tests' }),
      forceRun: option.boolean({ flag: '--force', default: false }),
      buildTool: option.enum(['maven', 'gradle'], { flag: '--tool', default: 'maven' }),
      targetName: option.string(requiredConfig),
      sharedValue: option.number(sharedConfig),
    },
    run({ args, options }) {
      expectTypeOf(args.entry).toEqualTypeOf<string>()
      expectTypeOf(options.hostName).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.serverPort).toEqualTypeOf<number>()
      expectTypeOf(options.includeTests).toEqualTypeOf<boolean | undefined>()
      expectTypeOf(options.forceRun).toEqualTypeOf<boolean>()
      expectTypeOf(options.buildTool).toEqualTypeOf<'maven' | 'gradle'>()
      expectTypeOf(options.targetName).toEqualTypeOf<string>()
      expectTypeOf(options.sharedValue).toEqualTypeOf<number | undefined>()

      // @ts-expect-error 终端拼写不会增加处理函数字段
      expectTypeOf(options.host)
      // @ts-expect-error 含前缀的终端拼写不会增加处理函数字段
      expectTypeOf(options['--include-tests'])
      // @ts-expect-error 映射后的可选字段仍可能缺省
      expectTypeOf<boolean>(options.includeTests)
    },
  })

  // @ts-expect-error 显式长选项拼写必须携带 -- 前缀
  option.string({ flag: 'host' })
  // @ts-expect-error 显式长选项拼写不支持短选项
  option.boolean({ flag: '-f' })
  // @ts-expect-error 显式 undefined 不符合可选拼写契约
  option.number({ flag: undefined })
  // @ts-expect-error 映射拼写不会放宽枚举默认值
  option.enum(['maven', 'gradle'], { flag: '--tool', default: 'other' })
  // @ts-expect-error 位置参数不能声明终端选项拼写
  argument.string('entry', { flag: '--entry' })
  // @ts-expect-error 抽出的选项配置也不能交给位置参数
  argument.string('entry', requiredConfig)
  // @ts-expect-error 位置参数也拒绝显式 undefined 拼写
  argument.string('entry', { flag: undefined })

  defineCommand({
    options: { token: option.string({ flag: '--access-token' }) },
    // @ts-expect-error 终端拼写不允许处理函数反向收窄可选字段
    run({ options }: { options: { token: string } }) {
      return options.token.toUpperCase()
    },
  })
}

/** 检查重复字符串的数组推导与单值配置隔离，负例只参与编译检查 */
export function verifyMultipleTypes(): void {
  const repeatedConfig: MultipleConfig = { multiple: true, flag: '--arg' }
  const sharedOptions = { applicationArgs: option.string(repeatedConfig) }

  defineCommand({
    options: {
      ...sharedOptions,
      jvmArgs: option.string({ multiple: true, flag: '--jvm-arg' }),
      label: option.string({ multiple: false }),
      count: option.number({ multiple: false, default: 1 }),
      force: option.boolean({ multiple: false, default: false }),
      mode: option.enum(['dev', 'prod'], { multiple: false, required: true }),
    },
    run({ options }) {
      expectTypeOf(options.applicationArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.jvmArgs).toEqualTypeOf<string[]>()
      expectTypeOf(options.label).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.count).toEqualTypeOf<number>()
      expectTypeOf(options.force).toEqualTypeOf<boolean>()
      expectTypeOf(options.mode).toEqualTypeOf<'dev' | 'prod'>()
      options.applicationArgs.push('extra')

      // @ts-expect-error 重复选项不会作为标量输入
      expectTypeOf<string>(options.jvmArgs)
      // @ts-expect-error 重复选项的终端拼写不会增加结果字段
      expectTypeOf(options['jvm-arg'])
    },
  })

  const dynamicOptions: Record<string, Option<string[]>> = sharedOptions
  defineCommand({
    options: dynamicOptions,
    run({ options }) {
      expectTypeOf(options.missing).toEqualTypeOf<string[] | undefined>()
    },
  })

  const withDefault = { multiple: true, default: 'value' } as const
  const withRequired = { multiple: true, required: true } as const
  const withOptional = { multiple: true, required: false } as const
  // @ts-expect-error 提取后的重复配置不能误选带默认值的单值重载
  option.string(withDefault)
  // @ts-expect-error 提取后的重复配置不能误选必填单值重载
  option.string(withRequired)
  // @ts-expect-error 重复配置也不接受 required 为 false
  option.string(withOptional)
  // @ts-expect-error 重复配置不接受数组默认值
  option.string({ multiple: true, default: [] })
  // @ts-expect-error 重复配置不接受显式 undefined 默认值
  option.string({ multiple: true, default: undefined })
  // @ts-expect-error multiple 属性不能显式为 undefined
  option.string({ multiple: undefined })
  // @ts-expect-error 数值选项不支持重复配置，即使配置已提取
  option.number(repeatedConfig)
  // @ts-expect-error 布尔选项不支持重复配置，即使配置已提取
  option.boolean(repeatedConfig)
  // @ts-expect-error 枚举选项不支持重复配置，即使配置已提取
  option.enum(['dev', 'prod'], repeatedConfig)
  // @ts-expect-error 位置参数不支持重复输入
  argument.string('entry', { multiple: true })
  // @ts-expect-error 位置参数也不接受 multiple 为 false
  argument.string('entry', { multiple: false })
  // @ts-expect-error 提取后的 multiple 配置不能进入位置参数
  argument.string('entry', withRequired)

  defineCommand({
    options: sharedOptions,
    // @ts-expect-error 处理函数不能反向将重复字符串推导为标量
    run({ options }: { options: { applicationArgs: string } }) {
      return options.applicationArgs
    },
  })
}
