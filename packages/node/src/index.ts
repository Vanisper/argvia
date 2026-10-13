// @env node
import type { Command } from '@argvia/core'
import process from 'node:process'
import { run } from '@argvia/core'

/** Node 进程入口的诊断选项 */
export interface RunMainOptions {
  /** 意外异常为 Error 时显示非空堆栈，缺失时回退消息；默认关闭 */
  readonly debug?: boolean
}

/**
 * 使用进程参数执行命令，并输出帮助或错误
 *
 * @description 设置 process.exitCode：成功或帮助为 0，输入错误为 2，显式退出或预期失败使用指定码，意外异常为 1；普通返回值不自动输出
 */
export async function runMain(command: Command, options: RunMainOptions = {}): Promise<void> {
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
      case 'failed':
        process.stderr.write(`${result.commandPath.join(' ')}: ${result.message}\n`)
        process.exitCode = result.exitCode
        break
    }
  }
  catch (error) {
    const message = error instanceof Error
      ? options.debug === true ? error.stack || error.message : error.message
      : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
