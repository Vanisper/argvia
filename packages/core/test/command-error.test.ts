import { CommandError, defineCommand, DefinitionError, exit, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('预期命令失败', () => {
  it('保留非空白消息原文，省略退出码时采用 1', () => {
    const message = '  项目配置无效\n'
    const failure = new CommandError(message)

    expect(failure).toBeInstanceOf(Error)
    expect(failure.name).toBe('CommandError')
    expect(failure.message).toBe(message)
    expect(failure.exitCode).toBe(1)
    expect(new CommandError(message, {}).exitCode).toBe(1)
    expect(new CommandError(message, undefined).exitCode).toBe(1)
  })

  it.each([1, 2, 130, 143, 255])('接受非零退出码 %s', (exitCode) => {
    expect(new CommandError('业务失败', { exitCode }).exitCode).toBe(exitCode)
  })

  it.each(['', ' ', '\n\t', null, undefined, 7, {}])('拒绝空白或非字符串消息：%s', (message) => {
    expect(() => Reflect.construct(CommandError, [message])).toThrow(TypeError)
  })

  it.each([0, -1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', null, undefined, true, {}, 1n])(
    '拒绝非法非零退出码，不转换或兜底：%s',
    (exitCode) => {
      expect(() => Reflect.construct(CommandError, ['业务失败', { exitCode }])).toThrow(RangeError)
    },
  )

  it.each(['sync', 'async'])('处理函数中的预期失败生成独立结果：%s', async (mode) => {
    const failure = new CommandError('配置中的 mainClass 无效', { exitCode: 2 })
    const command = defineCommand({
      name: 'tool',
      run: mode === 'sync'
        ? () => { throw failure }
        : async () => { throw failure },
    })

    expect(await run(command, { argv: [] })).toEqual({
      kind: 'failed',
      message: '配置中的 mainClass 无效',
      exitCode: 2,
      commandPath: ['tool'],
    })
  })

  it('允许应用扩展错误类，默认与显式路由保留实际嵌套路径', async () => {
    class ProjectError extends CommandError {}
    const failure = new ProjectError('项目不可用')
    const leaf = defineCommand({
      name: 'ignored',
      run: () => { throw failure },
    })
    const command = defineCommand({
      name: 'tool',
      commands: {
        project: defineCommand({ commands: { launch: leaf }, defaultCommand: 'launch' }),
      },
      defaultCommand: 'project',
    })

    for (const argv of [[], ['project'], ['project', 'launch']]) {
      expect(await run(command, { argv })).toEqual({
        kind: 'failed',
        message: '项目不可用',
        exitCode: 1,
        commandPath: ['tool', 'project', 'launch'],
      })
    }
  })

  it.each(['sync', 'async'])('正常返回 CommandError 或同形数据时保留业务值：%s', async (mode) => {
    const values = [
      new CommandError('仅作为业务值返回'),
      { name: 'CommandError', message: '普通对象', exitCode: 2 },
      { kind: 'failed', message: '普通对象', exitCode: 2, commandPath: ['tool'] },
    ]

    for (const value of values) {
      const command = defineCommand({ run: mode === 'sync' ? () => value : async () => value })
      const result = await run(command, { argv: [] })
      expect(result.kind).toBe('executed')
      if (result.kind === 'executed')
        expect(result.value).toBe(value)
    }
  })

  it.each(['sync', 'async'])('其他异常、同名错误和抛出的退出结果原样拒绝：%s', async (mode) => {
    const failures = [
      new Error('意外异常'),
      new DefinitionError('错误定义'),
      Object.assign(new Error('同名错误'), { name: 'CommandError', exitCode: 2 }),
      { name: 'CommandError', message: '同形对象', exitCode: 2 },
      '拒绝值',
      7,
      null,
      undefined,
      exit(7),
    ]

    for (const failure of failures) {
      const command = defineCommand({
        run: mode === 'sync'
          ? () => { throw failure }
          : async () => { throw failure },
      })
      await expect(run(command, { argv: [] })).rejects.toBe(failure)
    }
  })

  it('错误构造参数产生的开发异常不转换为预期失败', async () => {
    const invalidMessage = defineCommand({
      run: () => { throw new CommandError('') },
    })
    const invalidCode = defineCommand({
      run: () => { throw new CommandError('业务失败', { exitCode: 0 }) },
    })

    await expect(run(invalidMessage, { argv: [] })).rejects.toBeInstanceOf(TypeError)
    await expect(run(invalidCode, { argv: [] })).rejects.toBeInstanceOf(RangeError)
  })

  it('处理函数边界之外抛出的 CommandError 不转换为预期失败', async () => {
    const failure = new CommandError('读取输入时失败')
    const argv: string[] = []
    Object.defineProperty(argv, 'slice', {
      value: () => { throw failure },
    })
    const handler = vi.fn()
    const command = defineCommand({ run: handler })

    await expect(run(command, { argv })).rejects.toBe(failure)
    expect(handler).not.toHaveBeenCalled()
  })

  it('帮助和解析错误先于领域处理', async () => {
    const handler = vi.fn(() => {
      throw new CommandError('领域失败')
    })
    const command = defineCommand({ run: handler })

    expect(await run(command, { argv: ['--help'] })).toMatchObject({ kind: 'help' })
    expect(await run(command, { argv: ['--unknown'] })).toMatchObject({ kind: 'invalid-input' })
    expect(handler).not.toHaveBeenCalled()
  })
})
