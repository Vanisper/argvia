import type { ExitResult } from './types.js'

const exitResults = new WeakSet<object>()

/**
 * 创建需要由处理函数返回的退出结果
 *
 * @description 不终止进程；返回给 run 时采用指定退出码，对象副本不具有退出语义
 * @throws {RangeError} code 不是 0..255 的整数时抛出
 */
export function exit(code: number): ExitResult {
  if (!Number.isInteger(code) || code < 0 || code > 255)
    throw new RangeError('退出码必须是 0..255 的整数')

  const result = Object.freeze({ exitCode: code }) as ExitResult
  exitResults.add(result)
  return result
}

export function isExitResult(value: unknown): value is ExitResult {
  return typeof value === 'object' && value !== null && exitResults.has(value)
}
