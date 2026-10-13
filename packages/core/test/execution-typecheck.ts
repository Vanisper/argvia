import type { CommandErrorOptions, ExitResult, RunResult } from '@argvia/core'
import { CommandError, defineCommand, exit, run } from '@argvia/core'
import { expectTypeOf } from 'vitest'

/** 检查执行协议的公共类型，负例只参与编译检查 */
export async function verifyExecutionTypes(): Promise<void> {
  const result = exit(7)
  expectTypeOf(result).toEqualTypeOf<ExitResult>()
  expectTypeOf(result.exitCode).toEqualTypeOf<number>()
  // @ts-expect-error 退出结果不接受字段修改
  result.exitCode = 1
  // @ts-expect-error 普通对象不能声明为退出结果
  expectTypeOf<ExitResult>({ exitCode: 7 })
  // @ts-expect-error 退出码必须是数值
  exit('7')
  // @ts-expect-error 退出码不可省略
  exit()

  const syncCommand = defineCommand({ run: () => result })
  const asyncCommand = defineCommand({ run: async () => exit(0) })
  expectTypeOf(run(syncCommand, { argv: [] })).toEqualTypeOf<Promise<RunResult>>()
  const executed = await run(asyncCommand, { argv: [] })
  if (executed.kind === 'exit') {
    expectTypeOf(executed.exitCode).toEqualTypeOf<number>()
    expectTypeOf(executed.commandPath).toEqualTypeOf<readonly string[]>()
    // @ts-expect-error 命令路径是只读数组
    executed.commandPath.push('other')
    // @ts-expect-error 显式退出分支不包含业务值
    expectTypeOf(executed.value)
  }
  if (executed.kind === 'executed') {
    expectTypeOf(executed.value).toEqualTypeOf<unknown>()
    // @ts-expect-error 普通业务分支不包含退出码
    expectTypeOf(executed.exitCode)
  }

  const options: CommandErrorOptions = { exitCode: 2 }
  const failure = new CommandError('项目无效', options)
  expectTypeOf(failure).toEqualTypeOf<CommandError>()
  expectTypeOf<Error>(failure)
  expectTypeOf(failure.exitCode).toEqualTypeOf<number>()
  // @ts-expect-error 错误退出码是只读属性
  failure.exitCode = 1
  // @ts-expect-error 消息必须是字符串
  expectTypeOf(new CommandError(7))
  // @ts-expect-error 退出码必须是数值
  expectTypeOf(new CommandError('项目无效', { exitCode: '2' }))
  // @ts-expect-error 可省略退出码，但不能显式传入 undefined
  expectTypeOf(new CommandError('项目无效', { exitCode: undefined }))

  class ProjectError extends CommandError {}
  const failedCommand = defineCommand({
    run: () => { throw new ProjectError('项目无效') },
  })
  const failed = await run(failedCommand, { argv: [] })
  if (failed.kind === 'failed') {
    expectTypeOf(failed.message).toEqualTypeOf<string>()
    expectTypeOf(failed.exitCode).toEqualTypeOf<number>()
    expectTypeOf(failed.commandPath).toEqualTypeOf<readonly string[]>()
    // @ts-expect-error 预期业务失败不是解析诊断
    expectTypeOf(failed.diagnostic)
    // @ts-expect-error 预期业务失败不包含业务值
    expectTypeOf(failed.value)
  }
}
