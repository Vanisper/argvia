import type { DefaultConfig, OptionConfig, RequiredConfig } from '@argvia/core'
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
