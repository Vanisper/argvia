import type {
  Argument,
  Command,
  GroupDefinition,
  LeafDefinition,
  Option,
  ResolvedCommand,
  RuntimeContext,
} from './types'
import { COMMAND_IDENTIFIER } from './constants'
import { DefinitionError } from './errors'
import { assertDescriptor } from './fields'

const definitions = new WeakMap<Command, ResolvedCommand>()

function validateName(name: string, label: string): void {
  if (typeof name !== 'string' || !COMMAND_IDENTIFIER.test(name))
    throw new DefinitionError(`${label}「${name}」必须以字母开头，且只包含字母、数字、下划线或连字符`)
}

/**
 * 创建经过校验的命令，并推导处理函数的参数类型
 *
 * @description 分组与叶子定义互斥；位置参数和选项规则在定义时保存，之后修改原对象不会改变命令
 * @throws {DefinitionError} 参数顺序、命名或命令结构不成立时抛出
 */
export function defineCommand(definition: GroupDefinition): Command
export function defineCommand<
  const Args extends readonly Argument<string, unknown>[] = readonly [],
  const Options extends Readonly<Record<string, Option<unknown>>> = Record<never, never>,
>(definition: LeafDefinition<Args, Options>): Command
export function defineCommand(
  definition: GroupDefinition | LeafDefinition<readonly Argument<string, unknown>[], Readonly<Record<string, Option<unknown>>>>,
): Command {
  if (definition.name !== undefined)
    validateName(definition.name, '程序名')

  const meta = {
    ...(definition.name !== undefined ? { name: definition.name } : {}),
    ...(definition.description !== undefined ? { description: definition.description } : {}),
  }
  let resolved: ResolvedCommand

  if (Object.hasOwn(definition, 'commands')) {
    if (!definition.commands || typeof definition.commands !== 'object')
      throw new DefinitionError('分组必须提供 commands 对象')
    if (['args', 'options', 'run'].some(key => Object.hasOwn(definition, key)))
      throw new DefinitionError('分组不能同时声明 args、options 或 run')
    for (const [name, command] of Object.entries(definition.commands)) {
      validateName(name, '子命令名')
      getDefinition(command)
    }
    resolved = { ...meta, kind: 'group', commands: Object.freeze({ ...definition.commands }) }
  }
  else {
    if (typeof definition.run !== 'function')
      throw new DefinitionError('叶子命令必须提供 run 处理函数')
    for (const key of ['args', 'options'] as const) {
      if (Object.hasOwn(definition, key) && definition[key] === undefined)
        throw new DefinitionError(`${key} 需省略或提供有效定义，不能显式传入 undefined`)
    }
    const args = definition.args ?? []
    const options = definition.options ?? {}
    const names = new Set<string>()
    let optionalSeen = false
    for (const field of args) {
      assertDescriptor(field)
      validateName(field.name, '位置参数名')
      if (names.has(field.name))
        throw new DefinitionError(`重复的位置参数「${field.name}」`)
      if (optionalSeen && field.required)
        throw new DefinitionError('可选位置参数之后不能出现必填位置参数')
      names.add(field.name)
      optionalSeen ||= !field.required
    }
    for (const [name, field] of Object.entries(options)) {
      assertDescriptor(field)
      validateName(name, '选项名')
      if (name === 'help')
        throw new DefinitionError('help 是保留选项名')
    }

    // 解析和校验保证该边界的值符合描述器；用户处理函数保留更精确的输入类型
    const invoke = definition.run as (context: RuntimeContext) => unknown
    resolved = {
      ...meta,
      kind: 'leaf',
      args: Object.freeze([...args]),
      options: Object.freeze({ ...options }),
      invoke,
    }
  }

  const command = Object.freeze(meta) as Command
  definitions.set(command, Object.freeze(resolved))
  return command
}

export function getDefinition(command: Command): ResolvedCommand {
  const definition = definitions.get(command)
  if (!definition)
    throw new DefinitionError('请使用 defineCommand 创建命令')
  return definition
}
