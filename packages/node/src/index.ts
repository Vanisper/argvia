// @env node
import type { Command } from '@argvia/core'
import process from 'node:process'
import { run } from '@argvia/core'

/**
 * 使用进程参数执行命令，并输出帮助或错误
 *
 * @description 设置 process.exitCode：成功或帮助为 0，输入错误为 2，业务异常为 1；处理函数返回值不自动输出
 */
export async function runMain(command: Command): Promise<void> {
  try {
    const result = await run(command, { argv: process.argv.slice(2) })
    if (result.kind === 'help')
      process.stdout.write(`${result.text}\n`)
    if (result.kind === 'invalid-input') {
      process.stderr.write(`${result.diagnostic.message}\n使用 ${result.diagnostic.commandPath.join(' ')} --help 查看帮助\n`)
      process.exitCode = 2
    }
    else {
      process.exitCode = 0
    }
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
