import { argument, defineCommand, DefinitionError, option, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

function createTool() {
  const handler = vi.fn()
  const deploy = defineCommand({
    description: '部署应用',
    args: [
      argument.string('entry', { required: true }),
      argument.string('tag'),
    ],
    options: {
      port: option.number({ default: 3000 }),
      mode: option.enum(['dev', 'prod'], { default: 'dev' }),
      token: option.string(),
      retries: option.number(),
      channel: option.enum(['stable', 'preview']),
      verbose: option.boolean(),
    },
    run(context) {
      handler(context)
      return context
    },
  })
  return {
    handler,
    tool: defineCommand({ name: 'tool', commands: { deploy } }),
  }
}

describe('命令执行公共接口', () => {
  it.each([
    ['--port', '8080', '--mode', 'prod'],
    ['--port=8080', '--mode=prod'],
  ])('长选项分隔形式与等号形式产生相同的值：%j', async (...flags) => {
    const { handler, tool } = createTool()
    const context = {
      args: { entry: 'app.ts', tag: undefined },
      options: {
        port: 8080,
        mode: 'prod',
        token: undefined,
        retries: undefined,
        channel: undefined,
        verbose: undefined,
      },
    }

    expect(await run(tool, { argv: ['deploy', 'app.ts', ...flags] }))
      .toEqual({ kind: 'executed', value: context })
    expect(handler).toHaveBeenCalledExactlyOnceWith(context)
  })

  it('缺省值覆盖数值和枚举，无默认值的可选字段保留 undefined', async () => {
    const { tool } = createTool()

    expect(await run(tool, { argv: ['deploy', 'app.ts'] })).toEqual({
      kind: 'executed',
      value: {
        args: { entry: 'app.ts', tag: undefined },
        options: {
          port: 3000,
          mode: 'dev',
          token: undefined,
          retries: undefined,
          channel: undefined,
          verbose: undefined,
        },
      },
    })
  })

  it.each([false, true])('布尔开关省略时采用显式默认值 %s，输入时得到 true', async (defaultValue) => {
    const command = defineCommand({
      options: { verbose: option.boolean({ default: defaultValue }) },
      run: context => context.options,
    })

    expect(await run(command, { argv: [] }))
      .toEqual({ kind: 'executed', value: { verbose: defaultValue } })
    expect(await run(command, { argv: ['--verbose'] }))
      .toEqual({ kind: 'executed', value: { verbose: true } })
  })

  it('布尔开关不消耗后续位置参数，空字符串仍是字符串选项的有效值', async () => {
    const { tool } = createTool()
    const result = await run(tool, { argv: ['deploy', '--verbose', 'app.ts', 'release', '--token='] })

    expect(result).toMatchObject({
      kind: 'executed',
      value: {
        args: { entry: 'app.ts', tag: 'release' },
        options: { verbose: true, token: '' },
      },
    })
  })

  it('-- 后的选项和帮助标记按位置参数处理', async () => {
    const { handler, tool } = createTool()

    expect(await run(tool, { argv: ['deploy', '--', '--help', '--port=9000'] }))
      .toMatchObject({
        kind: 'executed',
        value: {
          args: { entry: '--help', tag: '--port=9000' },
          options: { port: 3000 },
        },
      })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('字符串选项的帮助标记取值不会触发帮助', async () => {
    const { handler, tool } = createTool()

    expect(await run(tool, { argv: ['deploy', 'app.ts', '--token', '--help'] }))
      .toMatchObject({ kind: 'executed', value: { options: { token: '--help' } } })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('合法命令的帮助优先于输入校验，未知命令仍报告错误', async () => {
    const { handler, tool } = createTool()

    expect(await run(tool, { argv: ['deploy', '--port=bad', '--help'] }))
      .toMatchObject({ kind: 'help' })
    expect(await run(tool, { argv: ['unknown', '--help'] }))
      .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'unknown-command' } })
    expect(handler).not.toHaveBeenCalled()
  })

  it('停在分组时显示当前帮助，执行时不修改传入的 argv', async () => {
    const { tool } = createTool()
    const argv = Object.freeze(['deploy', 'app.ts', '--port=8080'])

    expect(await run(tool, { argv: [] })).toMatchObject({ kind: 'help' })
    expect(await run(tool, { argv })).toMatchObject({ kind: 'executed' })
    expect(argv).toEqual(['deploy', 'app.ts', '--port=8080'])
  })

  it('嵌套命令由 commands 的键匹配，根 name 组成帮助路径', async () => {
    const handler = vi.fn(() => 'configuration')
    const read = defineCommand({ name: 'ignored', run: handler })
    const app = defineCommand({
      name: 'tool',
      commands: { config: defineCommand({ commands: { get: read } }) },
    })

    expect(await run(app, { argv: ['config', 'get'] }))
      .toEqual({ kind: 'executed', value: 'configuration' })
    expect(handler).toHaveBeenCalledExactlyOnceWith({ args: {}, options: {} })

    const help = await run(app, { argv: ['config', 'get', '--help'] })
    expect(help.kind).toBe('help')
    if (help.kind === 'help') {
      expect(help.text).toContain('tool config get')
      expect(help.text).not.toContain('ignored')
    }
  })

  it.each([
    { argv: ['-h'], path: 'tool', detail: 'deploy' },
    { argv: ['--help'], path: 'tool', detail: 'deploy' },
    { argv: ['deploy', '-h'], path: 'tool deploy', detail: '--port' },
    { argv: ['deploy', '--help'], path: 'tool deploy', detail: 'prod' },
  ])('帮助跳过必填检查且不执行处理函数：$argv', async ({ argv, path, detail }) => {
    const { handler, tool } = createTool()
    const result = await run(tool, { argv })

    expect(result.kind).toBe('help')
    if (result.kind === 'help') {
      expect(result.text).toContain(path)
      expect(result.text).toContain(detail)
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    { argv: ['unknown'], code: 'unknown-command', path: ['tool'] },
    { argv: ['deploy', 'app.ts', '--unknown'], code: 'unknown-option', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '-v'], code: 'unknown-option', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--no-verbose'], code: 'unknown-option', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--port=1', '--port', '2'], code: 'duplicate-option', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--verbose', '--verbose'], code: 'duplicate-option', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--verbose=true'], code: 'invalid-value', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--verbose=false'], code: 'invalid-value', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--verbose='], code: 'invalid-value', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', '--port'], code: 'missing-value', path: ['tool', 'deploy'] },
    { argv: ['deploy'], code: 'missing-required', path: ['tool', 'deploy'] },
    { argv: ['deploy', 'app.ts', 'release', 'extra'], code: 'extra-argument', path: ['tool', 'deploy'] },
  ])('输入失败返回诊断而不调用处理函数：$code $argv', async ({ argv, code, path }) => {
    const { handler, tool } = createTool()
    const result = await run(tool, { argv })

    expect(result).toMatchObject({
      kind: 'invalid-input',
      diagnostic: { code, commandPath: path, message: expect.any(String) },
    })
    if (result.kind === 'invalid-input')
      expect(result.diagnostic.message.length).toBeGreaterThan(0)
    expect(handler).not.toHaveBeenCalled()
  })

  it('枚举精确匹配候选值，可选枚举有输入时同样接受校验', async () => {
    const { handler, tool } = createTool()

    expect(await run(tool, { argv: ['deploy', 'app.ts', '--channel=preview'] }))
      .toMatchObject({ kind: 'executed', value: { options: { channel: 'preview' } } })
    handler.mockClear()
    for (const flags of [['--mode=Prod'], ['--channel=nightly']]) {
      expect(await run(tool, { argv: ['deploy', 'app.ts', ...flags] }))
        .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'invalid-value' } })
    }
    expect(handler).not.toHaveBeenCalled()
  })

  it.each([
    { raw: '3e2', value: 300 },
    { raw: '-2.5', value: -2.5 },
    { raw: '+12', value: 12 },
    { raw: '0.125', value: 0.125 },
    { raw: '1E-3', value: 0.001 },
  ])('数值按有限十进制和指数转换：$raw', async ({ raw, value }) => {
    const { tool } = createTool()

    expect(await run(tool, { argv: ['deploy', 'app.ts', '--port', raw] }))
      .toMatchObject({ kind: 'executed', value: { options: { port: value } } })
  })

  it.each(['', 'NaN', 'Infinity', '0x10', '3px', '1e999', ' 3 ', '1_000', '1e'])('拒绝非有限或非十进制数值：%j', async (raw) => {
    const { handler, tool } = createTool()

    expect(await run(tool, { argv: ['deploy', 'app.ts', `--port=${raw}`] }))
      .toMatchObject({
        kind: 'invalid-input',
        diagnostic: { code: 'invalid-value', commandPath: ['tool', 'deploy'] },
      })
    expect(handler).not.toHaveBeenCalled()
  })

  it('必填数值和枚举必须显式输入，全部校验通过才执行', async () => {
    const handler = vi.fn()
    const command = defineCommand({
      options: {
        port: option.number({ required: true }),
        mode: option.enum(['dev', 'prod'], { required: true }),
      },
      run(context) {
        handler(context)
        return context.options
      },
    })

    for (const argv of [['--port=3000'], ['--mode=prod']]) {
      expect(await run(command, { argv }))
        .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'missing-required' } })
    }
    expect(handler).not.toHaveBeenCalled()
    expect(await run(command, { argv: ['--port=3000', '--mode=prod'] }))
      .toEqual({ kind: 'executed', value: { port: 3000, mode: 'prod' } })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('等待异步处理函数完成并保留返回值', async () => {
    const value = { deployed: true }
    const command = defineCommand({
      async run() {
        await Promise.resolve()
        return value
      },
    })

    expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value })
  })

  it.each(['sync', 'async'])('处理函数的原始异常通过拒绝传播：%s', async (mode) => {
    const failure = new Error('deployment failed')
    const command = defineCommand({
      run: mode === 'async'
        ? async () => { throw failure }
        : () => { throw failure },
    })

    await expect(run(command, { argv: [] })).rejects.toBe(failure)
  })

  it('命令保存共享选项和枚举候选，不受之后修改原对象影响', async () => {
    const choices = ['dev', 'prod']
    const options = {
      port: option.number({ default: 3000 }),
      mode: option.enum(choices, { default: 'dev' }),
    }
    const command = defineCommand({ options, run: context => context.options })

    options.port = option.number({ default: 9000 })
    choices.splice(1, 1, 'stage')

    expect(await run(command, { argv: ['--mode=prod'] }))
      .toEqual({ kind: 'executed', value: { port: 3000, mode: 'prod' } })
    expect(await run(command, { argv: ['--mode=stage'] }))
      .toMatchObject({ kind: 'invalid-input', diagnostic: { code: 'invalid-value' } })
  })

  it('布尔描述器保存默认值，不受之后修改配置对象影响', async () => {
    const config = { default: false }
    const verbose = option.boolean(config)
    const command = defineCommand({ options: { verbose }, run: context => context.options })

    config.default = true

    expect(Object.isFrozen(verbose)).toBe(true)
    expect(await run(command, { argv: [] }))
      .toEqual({ kind: 'executed', value: { verbose: false } })
  })

  it('拒绝复制后改写规则的描述器，避免携带旧类型的规则进入处理函数', () => {
    const port = { ...option.number({ default: 3000 }), kind: 'string' as const, default: 'text' }

    expect(() => defineCommand({
      options: { port },
      run({ options }) {
        const value: number = options.port
        return value
      },
    })).toThrow(DefinitionError)
  })

  it.each([
    {
      name: 'required 与 default 互斥',
      create: () => {
        // @ts-expect-error 验证绕过类型检查时的定义错误
        return option.string({ required: true, default: 'value' })
      },
    },
    { name: '空枚举', create: () => option.enum([]) },
    { name: '重复枚举候选', create: () => option.enum(['dev', 'dev']) },
    {
      name: '枚举默认值超出候选集合',
      create: () => {
        // @ts-expect-error 验证绕过类型检查时的定义错误
        return option.enum(['dev', 'prod'], { default: 'stage' })
      },
    },
    { name: '非有限数值默认值', create: () => option.number({ default: Number.POSITIVE_INFINITY }) },
    {
      name: '非布尔默认值',
      create: () => {
        // @ts-expect-error 验证绕过类型检查时的定义错误
        return option.boolean({ default: 'false' })
      },
    },
    {
      name: '布尔默认值显式为 undefined',
      create: () => {
        // @ts-expect-error 验证未启用 exactOptionalPropertyTypes 的调用者同样会得到定义错误
        return option.boolean({ default: undefined })
      },
    },
    {
      name: '布尔开关不支持 required',
      create: () => {
        // @ts-expect-error 布尔开关没有必填能力
        return option.boolean({ required: true })
      },
    },
    {
      name: '重复位置参数名称',
      create: () => defineCommand({ args: [argument.string('entry'), argument.string('entry')], run() {} }),
    },
    {
      name: '可选位置参数之后出现必填位置参数',
      create: () => defineCommand({
        args: [argument.string('tag'), argument.string('entry', { required: true })],
        run() {},
      }),
    },
    {
      name: '保留的 help 选项名称',
      create: () => defineCommand({ options: { help: option.boolean() }, run() {} }),
    },
    {
      name: '分组与处理函数互斥',
      create: () => {
        // @ts-expect-error 验证绕过类型检查时的定义错误
        return defineCommand({ commands: {}, run() {} })
      },
    },
    {
      name: '显式 undefined 位置参数定义',
      create: () => {
        // @ts-expect-error 验证未启用 exactOptionalPropertyTypes 的调用者同样会得到定义错误
        return defineCommand({ args: undefined, run() {} })
      },
    },
    {
      name: '显式 undefined 选项定义',
      create: () => {
        // @ts-expect-error 验证未启用 exactOptionalPropertyTypes 的调用者同样会得到定义错误
        return defineCommand({ options: undefined, run() {} })
      },
    },
  ])('定义错误在执行前抛出 DefinitionError：$name', ({ create }) => {
    expect(create).toThrow(DefinitionError)
  })
})
