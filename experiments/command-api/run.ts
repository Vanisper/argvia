import type {
  Command,
  FieldRules,
  InputDiagnostic,
  InputFailure,
  ParsedInput,
  ParsedValue,
  ResolvedLeaf,
  RunConfig,
  RunResult,
  SplitOption,
} from './types'
import { getDefinition } from './command'
import { DECIMAL_NUMBER } from './constants'
import { renderHelp } from './help'

function invalidInput(
  path: readonly string[],
  code: InputDiagnostic['code'],
  message: string,
): InputFailure {
  return { kind: 'invalid-input', diagnostic: { code, message, commandPath: [...path] } }
}

function splitOption(token: string): SplitOption {
  const separator = token.indexOf('=')
  return separator < 0
    ? { name: token.slice(2), value: undefined }
    : { name: token.slice(2, separator), value: token.slice(separator + 1) }
}

function isHelp(token: string): boolean {
  return token === '--help' || token === '-h'
}

function requestsHelp(command: ResolvedLeaf, argv: readonly string[]): boolean {
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!
    if (token === '--')
      return false
    if (isHelp(token))
      return true
    if (token.startsWith('--')) {
      const { name, value } = splitOption(token)
      const field = Object.hasOwn(command.options, name) ? command.options[name] : undefined
      // 字符串选项的下一项属于取值，允许它恰好是帮助标记
      if (field?.kind === 'string' && value === undefined && argv[index + 1] !== '--')
        index++
    }
  }
  return false
}

function parseValue(field: FieldRules, raw: string): ParsedValue {
  switch (field.kind) {
    case 'string':
      return { ok: true, value: raw }
    case 'number': {
      const value = Number(raw)
      return DECIMAL_NUMBER.test(raw) && Number.isFinite(value)
        ? { ok: true, value }
        : { ok: false, message: `需要有限的十进制数值，收到「${raw}」` }
    }
    case 'enum':
      return field.choices?.includes(raw)
        ? { ok: true, value: raw }
        : { ok: false, message: `需为 ${field.choices?.join(' | ')}，收到「${raw}」` }
    case 'boolean':
      return raw === 'true' || raw === 'false'
        ? { ok: true, value: raw === 'true' }
        : { ok: false, message: `需要 true 或 false，收到「${raw}」` }
  }
}

function parseInput(
  command: ResolvedLeaf,
  argv: readonly string[],
  path: readonly string[],
  optionsEnabled: boolean,
): ParsedInput {
  const options = new Map<string, unknown>()
  for (const [name, field] of Object.entries(command.options))
    options.set(name, field.default ?? (field.kind === 'boolean' ? false : undefined))

  const suppliedOptions = new Set<string>()
  const positional: string[] = []

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!
    if (optionsEnabled && token === '--') {
      optionsEnabled = false
      continue
    }
    if (!optionsEnabled || !token.startsWith('-') || token === '-') {
      positional.push(token)
      continue
    }
    if (!token.startsWith('--'))
      return invalidInput(path, 'unknown-option', `未知选项「${token}」`)

    const { name, value: inlineValue } = splitOption(token)
    const field = Object.hasOwn(command.options, name) ? command.options[name] : undefined
    if (!field)
      return invalidInput(path, 'unknown-option', `未知选项「--${name}」`)
    if (suppliedOptions.has(name))
      return invalidInput(path, 'duplicate-option', `选项「--${name}」不能重复输入`)
    suppliedOptions.add(name)

    if (field.kind === 'boolean') {
      if (inlineValue !== undefined)
        return invalidInput(path, 'invalid-value', `开关选项「--${name}」不接受取值`)
      options.set(name, true)
      continue
    }

    let raw = inlineValue
    if (raw === undefined) {
      const next = argv[index + 1]
      if (next === undefined || next === '--' || (field.kind !== 'string' && (next.startsWith('--') || next === '-h')))
        return invalidInput(path, 'missing-value', `选项「--${name}」缺少取值`)
      raw = next
      index++
    }
    const parsed = parseValue(field, raw)
    if (!parsed.ok)
      return invalidInput(path, 'invalid-value', `选项「--${name}」${parsed.message}`)
    options.set(name, parsed.value)
  }

  if (positional.length > command.args.length)
    return invalidInput(path, 'extra-argument', `多余的位置参数「${positional[command.args.length]}」`)

  const args: [string, unknown][] = []
  for (const [index, field] of command.args.entries()) {
    const raw = positional[index]
    if (raw === undefined) {
      if (field.required)
        return invalidInput(path, 'missing-required', `缺少必填位置参数「${field.name}」`)
      args.push([field.name, field.default])
      continue
    }
    const parsed = parseValue(field, raw)
    if (!parsed.ok)
      return invalidInput(path, 'invalid-value', `位置参数「${field.name}」${parsed.message}`)
    args.push([field.name, parsed.value])
  }

  for (const [name, field] of Object.entries(command.options)) {
    if (field.required && !suppliedOptions.has(name))
      return invalidInput(path, 'missing-required', `缺少必填选项「--${name}」`)
  }

  return { kind: 'parsed', context: { args: Object.fromEntries(args), options: Object.fromEntries(options) } }
}

/**
 * 选择命令、解析参数并等待处理函数完成
 *
 * @description 输入错误以结果返回，业务异常原样传播；不读取进程参数、不输出文本、不设置退出码
 */
export async function run(command: Command, { argv }: RunConfig): Promise<RunResult> {
  let selected = getDefinition(command)
  const path = [selected.name ?? 'argvia']
  let offset = 0
  let optionsEnabled = true

  while (selected.kind === 'group') {
    const token = argv[offset]
    if (token === undefined || (optionsEnabled && isHelp(token)))
      return { kind: 'help', text: renderHelp(selected, path) }
    if (optionsEnabled && token === '--') {
      optionsEnabled = false
      offset++
      continue
    }
    if (optionsEnabled && token.startsWith('-'))
      return invalidInput(path, 'unknown-option', `未知选项「${token}」`)
    const child = Object.hasOwn(selected.commands, token) ? selected.commands[token] : undefined
    if (!child)
      return invalidInput(path, 'unknown-command', `「${path.join(' ')}」没有子命令「${token}」`)
    selected = getDefinition(child)
    path.push(token)
    offset++
  }

  const remaining = argv.slice(offset)
  if (optionsEnabled && requestsHelp(selected, remaining))
    return { kind: 'help', text: renderHelp(selected, path) }

  const parsed = parseInput(selected, remaining, path, optionsEnabled)
  if (parsed.kind === 'invalid-input')
    return parsed
  const value = await selected.invoke(parsed.context)
  return { kind: 'executed', value }
}
