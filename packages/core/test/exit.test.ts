import { defineCommand, exit, run } from '@argvia/core'
import { describe, expect, it, vi } from 'vitest'

describe('显式退出协议', () => {
  it.each([0, 1, 2, 130, 143, 255])('同步与异步处理函数保留退出码 %s', async (exitCode) => {
    const result = exit(exitCode)

    expect(Object.isFrozen(result)).toBe(true)
    expect(Reflect.set(result, 'exitCode', 42)).toBe(false)
    for (const handler of [() => result, async () => result]) {
      const command = defineCommand({ name: 'tool', run: handler })
      expect(await run(command, { argv: [] })).toEqual({
        kind: 'exit',
        exitCode,
        commandPath: ['tool'],
      })
    }
  })

  it.each([-1, 256, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '1', true, null, undefined, {}, 1n])(
    '非法退出码立即抛出 RangeError，不转换输入：%s',
    (code) => {
      expect(() => Reflect.apply(exit, undefined, [code])).toThrow(RangeError)
    },
  )

  it('普通数字、同形对象和退出结果的副本仍是业务数据', async () => {
    const result = exit(7)
    const values: unknown[] = [0, 7, null, undefined, { exitCode: 7 }, { ...result }, JSON.parse(JSON.stringify(result))]

    for (const value of values) {
      const command = defineCommand({ run: () => value })
      expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value })
    }
  })

  it('创建退出结果不会中断处理函数，必须显式返回', async () => {
    const command = defineCommand({
      run() {
        exit(7)
        return 'continued'
      },
    })

    expect(await run(command, { argv: [] })).toEqual({ kind: 'executed', value: 'continued' })
  })

  it('默认和显式选择保留相同的嵌套命令路径', async () => {
    const leaf = defineCommand({ name: 'ignored', run: () => exit(7) })
    const command = defineCommand({
      name: 'tool',
      commands: {
        project: defineCommand({ commands: { launch: leaf }, defaultCommand: 'launch' }),
      },
      defaultCommand: 'project',
    })

    for (const argv of [[], ['project'], ['project', 'launch']]) {
      expect(await run(command, { argv })).toEqual({
        kind: 'exit',
        exitCode: 7,
        commandPath: ['tool', 'project', 'launch'],
      })
    }
  })

  it('帮助和无效输入不调用返回退出结果的处理函数', async () => {
    const handler = vi.fn(() => exit(7))
    const command = defineCommand({ run: handler })

    expect(await run(command, { argv: ['--help'] })).toMatchObject({ kind: 'help' })
    expect(await run(command, { argv: ['--unknown'] })).toMatchObject({ kind: 'invalid-input' })
    expect(handler).not.toHaveBeenCalled()
  })

  it('抛出或异步拒绝退出结果时原样传播', async () => {
    const result = exit(7)
    const handlers = [
      () => { throw result },
      async () => { throw result },
    ]

    for (const handler of handlers)
      await expect(run(defineCommand({ run: handler }), { argv: [] })).rejects.toBe(result)
  })
})
