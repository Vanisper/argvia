import type { ScannedInput } from './scan.js'
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
} from './types.js'
import { getDefinition } from './command.js'
import { DECIMAL_NUMBER } from './constants.js'
import { renderHelp } from './help.js'
import { isHelp, scanInput } from './scan.js'

function invalidInput(
  path: readonly string[],
  code: InputDiagnostic['code'],
  message: string,
): InputFailure {
  return { kind: 'invalid-input', diagnostic: { code, message, commandPath: [...path] } }
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
  input: ScannedInput,
  path: readonly string[],
): ParsedInput {
  const options = new Map<string, unknown>()
  for (const { name, field } of Object.values(command.options))
    options.set(name, field.multiple ? [] : field.default)

  const suppliedOptions = new Set<string>()
  const positional: string[] = []

  for (const token of input.tokens) {
    if (token.kind === 'argument') {
      positional.push(token.value)
      continue
    }
    if (token.kind === 'unknown-option')
      return invalidInput(path, 'unknown-option', `未知选项「${token.flag}」`)

    const { name, flag, field } = token.option
    if (!field.multiple && suppliedOptions.has(name))
      return invalidInput(path, 'duplicate-option', `选项「${flag}」不能重复输入`)
    suppliedOptions.add(name)

    if (field.kind === 'boolean') {
      if (token.value !== undefined)
        return invalidInput(path, 'invalid-value', `开关选项「${flag}」不接受取值`)
      options.set(name, true)
      continue
    }

    if (token.value === undefined)
      return invalidInput(path, 'missing-value', `选项「${flag}」缺少取值`)
    const parsed = parseValue(field, token.value)
    if (!parsed.ok)
      return invalidInput(path, 'invalid-value', `选项「${flag}」${parsed.message}`)
    if (field.multiple) {
      const values = options.get(name) as unknown[]
      values.push(parsed.value)
    }
    else {
      options.set(name, parsed.value)
    }
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

  for (const { name, flag, field } of Object.values(command.options)) {
    if (field.required && !suppliedOptions.has(name))
      return invalidInput(path, 'missing-required', `缺少必填选项「${flag}」`)
  }

  return {
    kind: 'parsed',
    context: {
      args: Object.fromEntries(args),
      options: Object.fromEntries(options),
      ...(command.passthrough ? { passthrough: input.passthrough } : {}),
    },
  }
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

  const input = scanInput(selected, argv.slice(offset), optionsEnabled)
  if (input.helpRequested)
    return { kind: 'help', text: renderHelp(selected, path) }

  const parsed = parseInput(selected, input, path)
  if (parsed.kind === 'invalid-input')
    return parsed
  const value = await selected.invoke(parsed.context)
  return { kind: 'executed', value }
}
