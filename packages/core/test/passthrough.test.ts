import { argument, defineCommand, DefinitionError, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('独立透传尾部', () => {
  it('首个分隔符之后不再解释参数，保留原始 token 边界', async () => {
    const command = defineCommand({
      args: [argument.string('entry', { required: true })],
      options: { items: option.string({ flag: '--item', multiple: true }) },
      passthrough: true,
      run: context => context,
    })
    const tail = ['--help', '--item=tail', '--', '', ' a b ', 'x=y', 'plan']
    const argv = Object.freeze(['entry.ts', '--item=first', '--', ...tail])

    expect(await run(command, { argv })).toEqual({
      kind: 'executed',
      value: { args: { entry: 'entry.ts' }, options: { items: ['first'] }, passthrough: tail },
    })
    expect(argv).toEqual(['entry.ts', '--item=first', '--', ...tail])
    const help = await run(command, { argv: ['--help'] })
    expect(help.kind).toBe('help')
    if (help.kind === 'help') {
      expect(help.text).toContain('--')
      expect(help.text).toContain('透传')
    }
  })

  it('透传尾部不能补足必填位置参数，也不掩盖前面的输入错误', async () => {
    const handler = vi.fn()
    const command = defineCommand({
      args: [argument.string('entry', { required: true })],
      options: { value: option.string() },
      passthrough: true,
      run: handler,
    })

    for (const { argv, code } of [
      { argv: ['--', 'entry.ts'], code: 'missing-required' },
      { argv: ['entry.ts', '--unknown', '--', '--help'], code: 'unknown-option' },
      { argv: ['entry.ts', '--value', '--', '--help'], code: 'missing-value' },
      { argv: ['entry.ts', 'extra', '--', 'tail'], code: 'extra-argument' },
    ]) {
      expect(await run(command, { argv })).toMatchObject({ kind: 'invalid-input', diagnostic: { code } })
    }
    expect(handler).not.toHaveBeenCalled()
    expect(await run(command, { argv: ['--unknown', '--help', '--', 'tail'] })).toMatchObject({ kind: 'help' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('字符串中的帮助和分隔符取值，与真正的透传边界分别处理', async () => {
    const command = defineCommand({
      options: { items: option.string({ flag: '--item', multiple: true }) },
      passthrough: true,
      run: context => context,
    })

    expect(await run(command, { argv: ['--item', '--help', '--item=--', '--', '--help'] })).toEqual({
      kind: 'executed',
      value: { args: {}, options: { items: ['--help', '--'] }, passthrough: ['--help'] },
    })
    expect(await run(command, { argv: ['--item=x', '--help', '--', '--item=y'] })).toMatchObject({ kind: 'help' })
  })

  it.each([{}, { passthrough: false as const }])('未开启时保持位置参数行为且上下文没有透传字段：%j', async (settings) => {
    const command = defineCommand({
      ...settings,
      args: [argument.string('entry')],
      run: context => context,
    })

    expect(await run(command, { argv: ['--', '--help'] })).toEqual({
      kind: 'executed',
      value: { args: { entry: '--help' }, options: {} },
    })
  })

  it('无分隔符和空尾部都获得独立数组，调用者输入不被共享', async () => {
    const received: (readonly string[])[] = []
    const command = defineCommand({
      passthrough: true,
      run({ passthrough }) {
        received.push(passthrough)
        return passthrough
      },
    })
    const argv = ['--', 'first']
    expect(await run(command, { argv })).toEqual({ kind: 'executed', value: ['first'] })
    argv[1] = 'changed'
    expect(received[0]).toEqual(['first'])
    expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value: [] })
    expect(await run(command, { argv: ['--'] })).toEqual({ kind: 'executed', value: [] })
    expect(received[1]).not.toBe(received[2])
  })

  it('定义阶段拒绝错误的开关与分组透传', () => {
    const definitions = [
      // @ts-expect-error 显式 undefined 不是有效开关
      () => defineCommand({ passthrough: undefined, run() {} }),
      // @ts-expect-error 透传开关必须使用布尔值
      () => defineCommand({ passthrough: 'yes', run() {} }),
      // @ts-expect-error 分组不能开启透传
      () => defineCommand({ commands: {}, passthrough: true }),
      // @ts-expect-error 分组不能声明透传开关
      () => defineCommand({ commands: {}, passthrough: false }),
    ]
    for (const define of definitions)
      expect(define).toThrow(DefinitionError)
  })
})
