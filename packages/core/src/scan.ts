import type { ResolvedLeaf, ResolvedOption } from './types.js'

type InputToken
  = | { readonly kind: 'argument', readonly value: string }
    | { readonly kind: 'unknown-option', readonly flag: string }
    | { readonly kind: 'option', readonly option: ResolvedOption, readonly value: string | undefined }

export interface ScannedInput {
  readonly tokens: readonly InputToken[]
  readonly helpRequested: boolean
  readonly passthrough: readonly string[]
}

export function isHelp(token: string): boolean {
  return token === '--help' || token === '-h'
}

/** 先确定取值与分隔符的归属，保留帮助优先于输入校验的规则 */
export function scanInput(command: ResolvedLeaf, argv: readonly string[]): ScannedInput {
  const tokens: InputToken[] = []
  let helpRequested = false
  let optionsEnabled = true

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!
    if (optionsEnabled && token === '--') {
      if (command.passthrough)
        return { tokens, helpRequested, passthrough: argv.slice(index + 1) }
      optionsEnabled = false
      continue
    }
    if (!optionsEnabled || !token.startsWith('-') || token === '-') {
      tokens.push({ kind: 'argument', value: token })
      continue
    }
    if (isHelp(token)) {
      helpRequested = true
      continue
    }

    const separator = token.startsWith('--') ? token.indexOf('=') : -1
    const flag = separator < 0 ? token : token.slice(0, separator)
    const option = Object.hasOwn(command.options, flag) ? command.options[flag] : undefined
    if (!option) {
      tokens.push({ kind: 'unknown-option', flag })
      continue
    }

    let value = separator < 0 ? undefined : token.slice(separator + 1)
    if (value === undefined && option.field.kind !== 'boolean') {
      const next = argv[index + 1]
      if (next !== undefined && next !== '--' && (option.field.kind === 'string' || (!next.startsWith('--') && next !== '-h'))) {
        value = next
        index++
      }
    }
    tokens.push({ kind: 'option', option, value })
  }

  return { tokens, helpRequested, passthrough: [] }
}
