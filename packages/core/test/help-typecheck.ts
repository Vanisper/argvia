import type { DefaultConfig, OptionalConfig, ValueNameConfig } from '@argvia/core'
import { argument, defineCommand, option } from '@argvia/core'
import { expectTypeOf } from 'vitest'

/** 检查静态帮助信息不改变输入推导，负例只参与编译 */
export function verifyHelpTypes(): void {
  const label: ValueNameConfig = { valueName: '名称' }
  const defaultBoolean: DefaultConfig<boolean> = { default: false }
  const optionalBoolean: OptionalConfig = { description: '可选布尔值' }
  const examples = ['tool --help'] as const
  defineCommand({
    examples,
    args: [argument.string('entry', { required: true, valueName: '文件' })],
    options: {
      text: option.string(label),
      count: option.number({ valueName: '次数', default: 3 }),
      mode: option.enum(['dev', 'prod'], { valueName: '模式', required: true }),
      items: option.string({ valueName: '参数', multiple: true }),
      enabled: option.boolean(defaultBoolean),
      optional: option.boolean(optionalBoolean),
    },
    run({ args, options }) {
      expectTypeOf(args.entry).toEqualTypeOf<string>()
      expectTypeOf(options.text).toEqualTypeOf<string | undefined>()
      expectTypeOf(options.count).toEqualTypeOf<number>()
      expectTypeOf(options.mode).toEqualTypeOf<'dev' | 'prod'>()
      expectTypeOf(options.items).toEqualTypeOf<string[]>()
      expectTypeOf(options.enabled).toEqualTypeOf<boolean>()
      expectTypeOf(options.optional).toEqualTypeOf<boolean | undefined>()
      // @ts-expect-error 帮助标签不创建输入字段
      expectTypeOf(args.文件)
    },
  })

  // @ts-expect-error 标签必须是字符串
  option.string({ valueName: 7 })
  // @ts-expect-error 标签可省略但不能显式 undefined
  option.number({ valueName: undefined })
  // @ts-expect-error 布尔开关没有自定义值标签
  option.boolean({ valueName: '布尔值' })
  const labelledBoolean = { default: false, valueName: '布尔值' }
  // @ts-expect-error 抽出的布尔配置也不能带标签
  option.boolean(labelledBoolean)

  const leaf = defineCommand({ examples, run() {} })
  expectTypeOf(leaf.examples).toEqualTypeOf<readonly string[] | undefined>()
  defineCommand({ examples, commands: { inspect: leaf } })
  // @ts-expect-error 示例数组只读
  leaf.examples?.push('tool inspect')
  // @ts-expect-error 示例必须使用字符串数组
  defineCommand({ examples: 'tool --help', run() {} })
  // @ts-expect-error 示例项必须是字符串
  defineCommand({ examples: [7], run() {} })
  // @ts-expect-error 示例可省略但不能显式 undefined
  defineCommand({ examples: undefined, commands: {} })
}
