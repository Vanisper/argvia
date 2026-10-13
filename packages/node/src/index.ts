// @env node
import type { Command } from '@argvia/core'
import process from 'node:process'
import { run } from '@argvia/core'

/**
 * 使用进程参数执行命令，并输出帮助或错误
 *
 * @description 设置 process.exitCode：成功或帮助为 0，输入错误为 2，显式退出使用指定码，意外异常为 1；普通返回值不自动输出
 */
export async function runMain(command: Command): Promise<void> {
  try {
    const result = await run(command, { argv: process.argv.slice(2) })
    switch (result.kind) {
      case 'executed':
        process.exitCode = 0
        break
      case 'help':
        process.stdout.write(`${result.text}\n`)
        process.exitCode = 0
        break
      case 'invalid-input':
        process.stderr.write(`${result.diagnostic.message}\n使用 ${result.diagnostic.commandPath.join(' ')} --help 查看帮助\n`)
        process.exitCode = 2
        break
      case 'exit':
        process.exitCode = result.exitCode
        break
    }
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
