/** 在命令定义阶段发现不成立的规则 */
export class DefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DefinitionError'
  }
}

/** 预期命令失败的进程状态 */
export interface CommandErrorOptions {
  /** 非零退出码，范围为 1..255，省略时为 1 */
  readonly exitCode?: number
}

/**
 * 应用可直接展示给用户的预期命令失败
 *
 * @description 需要在处理函数中抛出；同步抛出或异步拒绝均由 run 转换为 failed 结果，不自动附加帮助
 */
export class CommandError extends Error {
  /** 交给进程适配器的非零退出码 */
  readonly exitCode: number

  /**
   * 使用消息和可选退出码创建预期失败
   *
   * @throws {TypeError} 消息不包含非空白内容时抛出
   * @throws {RangeError} exitCode 不是 1..255 的整数时抛出
   */
  constructor(message: string, options: CommandErrorOptions = {}) {
    if (typeof message !== 'string' || !message.trim())
      throw new TypeError('预期失败消息必须包含非空白内容')
    const exitCode = 'exitCode' in options ? options.exitCode : 1
    if (typeof exitCode !== 'number' || !Number.isInteger(exitCode) || exitCode < 1 || exitCode > 255)
      throw new RangeError('预期失败退出码必须是 1..255 的整数')
    super(message)
    this.name = 'CommandError'
    this.exitCode = exitCode
  }
}
