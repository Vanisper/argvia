import { argument, defineCommand, DefinitionError, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('选项的终端拼写', () => {
  it.each([
    ['--tool', 'maven', '--main', 'example.App', '--max-retries', '3', '--include-tests'],
    ['--tool=maven', '--main=example.App', '--max-retries=3', '--include-tests'],
  ])('各类选项按显式拼写解析，结果保留定义字段：%j', async (...argv) => {
    const command = defineCommand({
      options: {
        buildTool: option.enum(['maven', 'gradle'], { flag: '--tool' }),
        mainClass: option.string({ flag: '--main', required: true }),
        retries: option.number({ flag: '--max-retries', default: 1 }),
        includeTests: option.boolean({ flag: '--include-tests' }),
      },
      run: context => context.options,
    })

    expect(await run(command, { argv })).toEqual({
      kind: 'executed',
      value: { buildTool: 'maven', mainClass: 'example.App', retries: 3, includeTests: true },
    })
    const help = await run(command, { argv: ['--help'] })
    expect(help.kind).toBe('help')
    if (help.kind === 'help') {
      for (const flag of ['--tool', '--main', '--max-retries', '--include-tests'])
        expect(help.text).toContain(flag)
      for (const key of ['buildTool', 'mainClass', 'includeTests', '--retries'])
        expect(help.text).not.toContain(key)
    }
  })

  it('显式拼写替换默认拼写，错误提示采用终端名称', async () => {
    const handler = vi.fn()
    const command = defineCommand({
      options: { mainClass: option.string({ flag: '--main', required: true }) },
      run: handler,
    })

    for (const [argv, code] of [
      [[], 'missing-required'],
      [['--main'], 'missing-value'],
      [['--main=A', '--main=B'], 'duplicate-option'],
    ] as const) {
      expect(await run(command, { argv })).toMatchObject({
        kind: 'invalid-input',
        diagnostic: { code, message: expect.stringContaining('--main') },
      })
    }
    expect(await run(command, { argv: ['--mainClass=A'] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'unknown-option' },
    })
    expect(handler).not.toHaveBeenCalled()
  })

  it('字符串取值、帮助与分隔符使用同一拼写规则', async () => {
    const handler = vi.fn(context => context)
    const command = defineCommand({
      args: [argument.string('entry')],
      options: {
        mainClass: option.string({ flag: '--main' }),
        retryCount: option.number({ flag: '--retries' }),
      },
      run: handler,
    })

    expect(await run(command, { argv: ['--main', '--help'] })).toMatchObject({
      kind: 'executed',
      value: { options: { mainClass: '--help' } },
    })
    expect(await run(command, { argv: ['--main=--help'] })).toMatchObject({ kind: 'executed' })
    expect(await run(command, { argv: ['--', '--help'] })).toMatchObject({
      kind: 'executed',
      value: { args: { entry: '--help' } },
    })
    expect(await run(command, { argv: ['--main', '--', '--help'] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'missing-value' },
    })
    handler.mockClear()
    for (const argv of [['--retries', '--help'], ['--unknown', '--help'], ['--retries=bad', '--help']])
      expect(await run(command, { argv })).toMatchObject({ kind: 'help' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('定义保存拼写快照，未指定拼写的字段继续使用对象键', async () => {
    const config: { flag: `--${string}` } = { flag: '--main' }
    const command = defineCommand({
      options: { mainClass: option.string(config), cwd: option.string() },
      run: context => context.options,
    })
    config.flag = '--entry'

    expect(await run(command, { argv: ['--main=A', '--cwd=project'] })).toEqual({
      kind: 'executed',
      value: { mainClass: 'A', cwd: 'project' },
    })
  })

  it.each([
    { name: '显式拼写重复', fields: () => ({ first: option.string({ flag: '--value' }), second: option.string({ flag: '--value' }) }) },
    { name: '显式拼写与默认拼写冲突', fields: () => ({ first: option.string({ flag: '--value' }), value: option.string() }) },
    { name: '内置帮助拼写', fields: () => ({ assistance: option.boolean({ flag: '--help' }) }) },
  ])('定义阶段拒绝冲突：$name', ({ fields }) => {
    expect(() => defineCommand({ options: fields(), run() {} })).toThrow(DefinitionError)
  })

  it.each(['--', '---value', '--with space', '--value=x', '--1value'])('拒绝非法长选项拼写 %j', (flag) => {
    expect(() => defineCommand({
      options: { value: option.string({ flag: flag as `--${string}` }) },
      run() {},
    })).toThrow(DefinitionError)
  })

  it('运行时同样拒绝错误的拼写配置与位置参数拼写', () => {
    expect(() => {
      // @ts-expect-error 验证 JavaScript 调用者的定义校验
      return option.string({ flag: 'value' })
    }).toThrow(DefinitionError)
    expect(() => {
      // @ts-expect-error 显式 undefined 不是有效拼写
      return option.string({ flag: undefined })
    }).toThrow(DefinitionError)
    expect(() => {
      // @ts-expect-error 位置参数没有长选项拼写
      return argument.string('entry', { flag: '--entry' })
    }).toThrow(DefinitionError)
  })
})
