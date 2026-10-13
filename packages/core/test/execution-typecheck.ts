import type { ExitResult, RunResult } from '@argvia/core'
import { defineCommand, exit, run } from '@argvia/core'
import { expectTypeOf } from 'vitest'

/** 检查退出协议的公共类型，负例只参与编译检查 */
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
}
