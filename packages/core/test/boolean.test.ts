import { argument, defineCommand, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('显式布尔值', () => {
  it.each([undefined, false, true])('显式值覆盖默认值 %s，后续省略仍采用原默认值', async (defaultValue) => {
    const command = defineCommand({
      options: {
        includeTests: defaultValue === undefined
          ? option.boolean({ flag: '--include-tests' })
          : option.boolean({ flag: '--include-tests', default: defaultValue }),
      },
      run: context => context.options,
    })

    for (const [argv, value] of [
      [[], defaultValue],
      [['--include-tests'], true],
      [['--include-tests=true'], true],
      [['--include-tests=false'], false],
      [[], defaultValue],
    ] as const) {
      expect(await run(command, { argv }))
        .toEqual({ kind: 'executed', value: { includeTests: value } })
    }
  })

  it('独立的 false 留给位置参数，不作为布尔值消费', async () => {
    const options = { includeTests: option.boolean({ flag: '--include-tests' }) }
    const command = defineCommand({
      args: [argument.string('entry', { required: true })],
      options,
      run: context => context,
    })

    expect(await run(command, { argv: ['--include-tests', 'false'] })).toEqual({
      kind: 'executed',
      value: { args: { entry: 'false' }, options: { includeTests: true } },
    })

    const handler = vi.fn()
    const withoutArgument = defineCommand({ options, run: handler })
    expect(await run(withoutArgument, { argv: ['--include-tests', 'false'] }))
      .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'extra-argument' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['', '0', '1', 'False', 'TRUE', 'false ', ' true', 'true=false'])('拒绝非精确布尔值 %j，诊断使用显式拼写', async (raw) => {
    const handler = vi.fn()
    const command = defineCommand({
      name: 'launch',
      options: { includeTests: option.boolean({ flag: '--include-tests' }) },
      run: handler,
    })

    expect(await run(command, { argv: [`--include-tests=${raw}`] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: {
        code: 'invalid-value',
        message: expect.stringContaining('「--include-tests」'),
        commandPath: ['launch'],
      },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  const forms = ['--include-tests', '--include-tests=true', '--include-tests=false']
  it.each(forms.flatMap(first => forms.map(second => ({ argv: [first, second] }))))('裸开关和等号形式的重复组合均被拒绝：$argv', async ({ argv }) => {
    const handler = vi.fn()
    const command = defineCommand({
      options: { includeTests: option.boolean({ flag: '--include-tests' }) },
      run: handler,
    })

    expect(await run(command, { argv })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'duplicate-option', message: expect.stringContaining('「--include-tests」') },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('显式 false 经默认命令执行，帮助仍优先于无效取值', async () => {
    const handler = vi.fn(context => context.options)
    const command = defineCommand({
      name: 'tool',
      defaultCommand: 'launch',
      commands: {
        launch: defineCommand({
          options: { includeTests: option.boolean({ flag: '--include-tests', default: true }) },
          run: handler,
        }),
      },
    })

    expect(await run(command, { argv: ['--include-tests=false'] }))
      .toEqual({ kind: 'executed', value: { includeTests: false } })
    handler.mockClear()
    const result = await run(command, { argv: ['--include-tests=bad', '--help'] })
    expect(result.kind).toBe('help')
    if (result.kind === 'help') {
      expect(result.text).toContain('tool launch')
      expect(result.text).toContain('--include-tests[=true|false]')
      expect(result.text).toContain('默认值：true')
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it('布尔值后字符串选项消费的帮助标记仍作为字符串', async () => {
    const command = defineCommand({
      options: { enabled: option.boolean(), label: option.string() },
      run: context => context.options,
    })

    expect(await run(command, { argv: ['--enabled=false', '--label', '--help'] }))
      .toEqual({ kind: 'executed', value: { enabled: false, label: '--help' } })
  })

  it('透传尾部的布尔拼写和帮助标记保留原样，不能掩盖前面的无效值', async () => {
    const handler = vi.fn()
    const command = defineCommand({
      options: { enabled: option.boolean({ default: true }) },
      passthrough: true,
      run(context) {
        handler(context)
        return context
      },
    })
    const tail = ['--enabled=true', '--help', '--']

    expect(await run(command, { argv: ['--enabled=false', '--', ...tail] })).toEqual({
      kind: 'executed',
      value: { args: {}, options: { enabled: false }, passthrough: tail },
    })
    handler.mockClear()
    expect(await run(command, { argv: ['--enabled=bad', '--', ...tail] }))
      .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'invalid-value' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it.each(['--no-include-tests', '--includeTests=false'])('不生成否定拼写或恢复对象键别名：%s', async (token) => {
    const handler = vi.fn()
    const command = defineCommand({
      options: { includeTests: option.boolean({ flag: '--include-tests' }) },
      run: handler,
    })

    expect(await run(command, { argv: [token] }))
      .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'unknown-option' } })
    expect(handler).not.toHaveBeenCalled()
  })
})
