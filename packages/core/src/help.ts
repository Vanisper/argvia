import type { FieldRules, ResolvedCommand } from './types.js'
import { getDefinition } from './command.js'

function describeField(field: FieldRules): string {
  const details: string[] = []
  if (field.description)
    details.push(field.description)
  if (field.required)
    details.push('必填')
  if (field.kind === 'enum')
    details.push(`候选值：${field.choices?.join(' | ')}`)
  if (field.default !== undefined)
    details.push(`默认值：${JSON.stringify(field.default)}`)
  return details.join('；')
}

function optionValueLabel(field: FieldRules): string {
  switch (field.kind) {
    case 'string':
      return ' <字符串>'
    case 'number':
      return ' <数值>'
    case 'enum':
      return ' <值>'
    case 'boolean':
      return '[=true|false]'
  }
}

function defaultHelpPath(command: ResolvedCommand, path: readonly string[]): string {
  const names = [...path]
  while (command.kind === 'group' && command.defaultCommand !== undefined) {
    const name = command.defaultCommand
    names.push(name)
    command = getDefinition(command.commands[name]!)
  }
  return names.join(' ')
}

/** 根据同一份命令定义生成当前命令路径的帮助 */
export function renderHelp(command: ResolvedCommand, path: readonly string[]): string {
  const invocation = path.join(' ')
  const lines: string[] = []

  if (command.kind === 'group') {
    lines.push(`用法：${invocation} ${command.defaultCommand !== undefined ? '[命令]' : '<命令>'} [选项]`)
  }
  else {
    const args = command.args.map(field => field.required ? `<${field.name}>` : `[${field.name}]`)
    lines.push(`用法：${[invocation, ...args, '[选项]', ...(command.passthrough ? ['[-- 原始参数...]'] : [])].join(' ')}`)
  }

  if (command.description)
    lines.push('', command.description)

  if (command.kind === 'group') {
    lines.push('', '子命令：')
    for (const [name, child] of Object.entries(command.commands))
      lines.push(`  ${name}${name === command.defaultCommand ? '（默认）' : ''}${child.description ? `  ${child.description}` : ''}`)
    if (command.defaultCommand !== undefined)
      lines.push('', `默认命令可省略；使用 ${defaultHelpPath(command, path)} --help 查看默认命令帮助`)
  }
  else if (command.args.length > 0) {
    lines.push('', '位置参数：')
    for (const field of command.args) {
      const details = describeField(field)
      lines.push(`  ${field.name}${details ? `  ${details}` : ''}`)
    }
  }

  lines.push('', '选项：')
  if (command.kind === 'leaf') {
    for (const { flag, field } of Object.values(command.options)) {
      const details = [describeField(field), field.multiple ? '可重复' : ''].filter(Boolean).join('；')
      lines.push(`  ${flag}${optionValueLabel(field)}${details ? `  ${details}` : ''}`)
    }
  }
  lines.push('  -h, --help  显示帮助')
  if (command.kind === 'leaf' && command.passthrough)
    lines.push('', '透传：', '  -- 后的参数原样保留，不再解析选项或位置参数')
  return lines.join('\n')
}
