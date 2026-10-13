import type { Command } from '@argvia/core'
import { argument, defineCommand, DefinitionError, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

function createApplication() {
  const launch = vi.fn(context => context)
  const plan = vi.fn()
  const initialize = vi.fn()
  const command = defineCommand({
    name: 'tool',
    defaultCommand: 'run',
    commands: {
      run: defineCommand({
        options: {
          cwd: option.string(),
          items: option.string({ flag: '--item', multiple: true }),
        },
        passthrough: true,
        run: launch,
      }),
      plan: defineCommand({ run: plan }),
      init: defineCommand({ options: { force: option.boolean() }, run: initialize }),
    },
  })
  return { command, launch, plan, initialize }
}

describe('默认子命令路由', () => {
  it.each([
    { argv: [] },
    { argv: ['--cwd=project', '--item=a', '--item=b'] },
    { argv: ['--', '--help', '--', '', ' a ', 'x=y'] },
  ])('默认与显式选择执行同一叶子：$argv', async ({ argv }) => {
    const { command, launch, plan, initialize } = createApplication()
    const input = Object.freeze([...argv])
    const implicit = await run(command, { argv: input })
    const explicit = await run(command, { argv: ['run', ...input] })

    expect(implicit.kind).toBe('executed')
    expect(implicit).toEqual(explicit)
    expect(launch).toHaveBeenCalledTimes(2)
    expect(plan).not.toHaveBeenCalled()
    expect(initialize).not.toHaveBeenCalled()
    expect(input).toEqual(argv)
  })

  it('显式兄弟命令不会触发默认命令', async () => {
    const { command, launch, plan, initialize } = createApplication()
    expect(await run(command, { argv: ['plan'] })).toMatchObject({ kind: 'executed' })
    expect(await run(command, { argv: ['init', '--force'] })).toMatchObject({ kind: 'executed' })
    expect(plan).toHaveBeenCalledOnce()
    expect(initialize).toHaveBeenCalledExactlyOnceWith({ args: {}, options: { force: true } })
    expect(launch).not.toHaveBeenCalled()
  })

  it.each([
    { argv: ['plna'], code: 'unknown-command', path: ['tool'] },
    { argv: ['plna', '--help'], code: 'unknown-command', path: ['tool'] },
    { argv: ['--force'], code: 'unknown-option', path: ['tool', 'run'] },
    { argv: ['--force', 'init'], code: 'unknown-option', path: ['tool', 'run'] },
    { argv: ['--cwd', 'project', 'plan'], code: 'extra-argument', path: ['tool', 'run'] },
  ])('路由错误保留选中命令路径：$argv', async ({ argv, code, path }) => {
    const { command, launch, plan, initialize } = createApplication()
    expect(await run(command, { argv })).toMatchObject({ kind: 'invalid-input', diagnostic: { code, commandPath: path } })
    for (const handler of [launch, plan, initialize])
      expect(handler).not.toHaveBeenCalled()
  })

  it('命令词和帮助标记可以作为默认叶子的字符串取值', async () => {
    const { command, plan } = createApplication()
    for (const cwd of ['plan', '--help']) {
      expect(await run(command, { argv: ['--cwd', cwd] })).toMatchObject({
        kind: 'executed',
        value: { options: { cwd } },
      })
    }
    expect(plan).not.toHaveBeenCalled()
  })

  it('分组帮助标明默认入口，显式或已选默认命令显示叶子帮助', async () => {
    const { command, launch } = createApplication()
    for (const argv of [['--help'], ['-h']]) {
      const result = await run(command, { argv })
      expect(result.kind).toBe('help')
      if (result.kind === 'help') {
        expect(result.text).toContain('默认')
        expect(result.text).toContain('tool run --help')
        expect(result.text).not.toContain('<命令>')
      }
    }
    for (const argv of [['run', '--help'], ['--cwd=project', '--help']]) {
      const result = await run(command, { argv })
      expect(result.kind).toBe('help')
      if (result.kind === 'help') {
        expect(result.text).toContain('tool run')
        expect(result.text).toContain('--item')
        expect(result.text).toContain('透传')
      }
    }
    expect(launch).not.toHaveBeenCalled()
  })

  it('嵌套默认分组保留完整路径及首个分隔符', async () => {
    const execute = defineCommand({ passthrough: true, run: context => context.passthrough })
    const group = defineCommand({ commands: { execute }, defaultCommand: 'execute' })
    const root = defineCommand({ name: 'tool', commands: { group }, defaultCommand: 'group' })
    const tail = ['--help', '--', '', ' a ', 'x=y']

    expect(await run(root, { argv: ['--', ...tail] })).toEqual({ kind: 'executed', value: tail })
    expect(await run(root, { argv: ['--unknown'] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { commandPath: ['tool', 'group', 'execute'] },
    })
    const help = await run(root, { argv: ['group', '--help'] })
    expect(help.kind).toBe('help')
    if (help.kind === 'help')
      expect(help.text).toContain('tool group execute --help')
  })

  it('默认叶子的位置参数通过显式命令或分隔符消歧，选中后按普通规则解析', async () => {
    const leaf = defineCommand({
      args: [argument.string('entry', { required: true })],
      options: { mode: option.string() },
      run: context => context.args.entry,
    })
    const command = defineCommand({ commands: { run: leaf }, defaultCommand: 'run' })
    for (const argv of [['run', 'file.ts'], ['--', 'file.ts'], ['--mode=dev', 'file.ts']])
      expect(await run(command, { argv })).toEqual({ kind: 'executed', value: 'file.ts' })
    expect(await run(command, { argv: [] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'missing-required', commandPath: ['argvia', 'run'] },
    })
    expect(await run(command, { argv: ['file.ts'] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'unknown-command' },
    })
  })

  it('未设默认命令的分组要求命令路径在分隔符之前', async () => {
    const leaf = defineCommand({ passthrough: true, run: context => context.passthrough })
    const command = defineCommand({ commands: { run: leaf } })
    expect(await run(command, { argv: [] })).toMatchObject({ kind: 'help' })
    expect(await run(command, { argv: ['--', 'run', '--', 'tail'] })).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code: 'unknown-option', commandPath: ['argvia'] },
    })
    expect(await run(command, { argv: ['run', '--', '--help'] })).toEqual({ kind: 'executed', value: ['--help'] })
  })

  it('默认目标与子命令表在定义阶段保存快照', async () => {
    const commands = {
      run: defineCommand({ run: () => 'run' }),
      plan: defineCommand({ run: () => 'plan' }),
    }
    const definition: { commands: typeof commands, defaultCommand: 'run' | 'plan' } = { commands, defaultCommand: 'run' }
    const command = defineCommand(definition)
    definition.defaultCommand = 'plan'
    commands.run = commands.plan
    expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value: 'run' })
  })

  it('定义校验拒绝不存在或继承的目标，以及叶子上的默认命令字段', () => {
    const leaf = defineCommand({ run() {} })
    const commands: Record<string, Command> = { run: leaf }
    for (const target of ['missing', 'constructor', 'toString'])
      expect(() => defineCommand({ commands, defaultCommand: target })).toThrow(DefinitionError)
    const definitions = [
      // @ts-expect-error 默认目标必须是已注册的键
      () => defineCommand({ commands: { run: leaf }, defaultCommand: 'missing' }),
      // @ts-expect-error 默认目标不能显式为 undefined
      () => defineCommand({ commands, defaultCommand: undefined }),
      // @ts-expect-error 默认目标必须是字符串
      () => defineCommand({ commands, defaultCommand: null }),
      // @ts-expect-error 叶子不能声明默认子命令
      () => defineCommand({ defaultCommand: 'run', run() {} }),
    ]
    for (const define of definitions)
      expect(define).toThrow(DefinitionError)
  })
})
