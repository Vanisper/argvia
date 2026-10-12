/** 在命令定义阶段发现不成立的规则 */
export class DefinitionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DefinitionError'
  }
}
