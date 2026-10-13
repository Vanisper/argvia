import { argument, defineCommand, DefinitionError, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('重复字符串选项', () => {
  it('交错输入按字段收集，保留空白、空字符串、等号和帮助标记取值', async () => {
    const command = defineCommand({
      options: {
        jvmArgs: option.string({ flag: '--jvm-arg', multiple: true }),
        applicationArgs: option.string({ flag: '--arg', multiple: true }),
      },
      run: context => context.options,
    })
    const argv = Object.freeze([
      '--jvm-arg=-Dname=a=b',
      '--arg=',
      '--jvm-arg',
      '-Xmx1g',
      '--arg',
      '--help',
      '--arg=hello world',
      '--arg=a,b',
    ])

    expect(await run(command, { argv })).toEqual({
      kind: 'executed',
      value: {
        jvmArgs: ['-Dname=a=b', '-Xmx1g'],
        applicationArgs: ['', '--help', 'hello world', 'a,b'],
      },
    })
    expect(argv[1]).toBe('--arg=')
    const help = await run(command, { argv: ['--help'] })
    expect(help.kind).toBe('help')
    if (help.kind === 'help') {
      expect(help.text).toContain('--jvm-arg')
      expect(help.text).toContain('可重复')
    }
  })

  it('每次执行创建独立数组，处理函数修改结果不影响下一次输入', async () => {
    const config = { flag: '--item' as const, multiple: true as const }
    const command = defineCommand({
      options: { items: option.string(config) },
      run({ options }) {
        const received = [...options.items]
        options.items.push('handler-change')
        return received
      },
    })

    expect(await run(command, { argv: ['--item=first'] })).toEqual({ kind: 'executed', value: ['first'] })
    expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value: [] })
    expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value: [] })
    expect(config).toEqual({ flag: '--item', multiple: true })
  })

  it('重复选项仍校验缺值，单值选项仍拒绝重复，帮助按字符串边界识别', async () => {
    const handler = vi.fn()
    const command = defineCommand({
      options: {
        items: option.string({ flag: '--item', multiple: true }),
        output: option.string(),
      },
      run: handler,
    })

    for (const argv of [['--item=first', '--item'], ['--item', '--', '--help']]) {
      expect(await run(command, { argv })).toMatchObject({
        kind: 'invalid-input',
        diagnostic: { code: 'missing-value', message: expect.stringContaining('--item') },
      })
    }
    expect(await run(command, { argv: ['--output=a', '--output=b'] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'duplicate-option' },
    })
    expect(await run(command, { argv: ['--item=x', '--help'] })).toMatchObject({ kind: 'help' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('绕过类型检查也不能使用不支持的集合配置', () => {
    const invalidDefinitions = [
      // @ts-expect-error 重复字符串不接受默认值
      () => option.string({ multiple: true, default: [] }),
      // @ts-expect-error 重复字符串不接受必填配置
      () => option.string({ multiple: true, required: true }),
      // @ts-expect-error 重复字符串不接受显式 required 配置
      () => option.string({ multiple: true, required: false }),
      // @ts-expect-error 布尔重复不是字符串集合
      () => option.boolean({ multiple: true }),
      // @ts-expect-error 数值重复尚未提供
      () => option.number({ multiple: true }),
      // @ts-expect-error 枚举重复尚未提供
      () => option.enum(['a', 'b'], { multiple: true }),
      // @ts-expect-error 位置参数没有重复选项配置
      () => argument.string('entry', { multiple: true }),
      // @ts-expect-error multiple 必须省略或提供有效布尔值
      () => option.string({ multiple: undefined }),
    ]

    for (const create of invalidDefinitions)
      expect(create).toThrow(DefinitionError)
  })
})
