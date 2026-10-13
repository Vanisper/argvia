import type {
  Argument,
  DefaultConfig,
  FieldRules,
  Option,
  OptionalConfig,
  OptionConfig,
  RequiredConfig,
  ValueConfig,
} from './types.js'
import { COMMAND_IDENTIFIER } from './constants.js'
import { DefinitionError } from './errors.js'

const descriptors = new WeakSet<object>()

function register<Field extends FieldRules>(field: Field): Field {
  Object.freeze(field)
  descriptors.add(field)
  return field
}

export function assertDescriptor(field: Option<unknown>): void {
  if (!descriptors.has(field))
    throw new DefinitionError('参数描述必须通过 argument 或 option 构造器创建')
}

function createField(
  kind: FieldRules['kind'],
  config: ValueConfig = {},
  choices?: readonly string[],
): FieldRules {
  const hasDefault = Object.hasOwn(config, 'default')
  if (config.required && hasDefault)
    throw new DefinitionError('required 与 default 不能同时使用')
  if (kind === 'boolean' && config.required)
    throw new DefinitionError('布尔开关不支持 required')

  if (kind === 'enum') {
    if (!choices?.length || choices.some(value => typeof value !== 'string'))
      throw new DefinitionError('枚举至少需要一个字符串候选值')
    if (new Set(choices).size !== choices.length)
      throw new DefinitionError('枚举候选值不能重复')
  }

  if (hasDefault) {
    const value = config.default
    const valid = kind === 'boolean'
      ? typeof value === 'boolean'
      : kind === 'number'
        ? typeof value === 'number' && Number.isFinite(value)
        : typeof value === 'string' && (kind !== 'enum' || choices!.includes(value))
    if (!valid)
      throw new DefinitionError(`无效的 ${kind} 默认值`)
  }

  return {
    kind,
    required: config.required === true,
    ...(config.description !== undefined ? { description: config.description } : {}),
    ...(hasDefault ? { default: config.default as string | number | boolean } : {}),
    ...(choices ? { choices: Object.freeze([...choices]) } : {}),
  }
}

function createOption(
  kind: FieldRules['kind'],
  config: ValueConfig & OptionConfig = {},
  choices?: readonly string[],
): Option<unknown> {
  const hasFlag = 'flag' in config
  const flag = config.flag
  if (hasFlag && (typeof flag !== 'string' || flag.trim() !== flag || !flag.startsWith('--') || !COMMAND_IDENTIFIER.test(flag.slice(2))))
    throw new DefinitionError('flag 必须以 -- 和字母开头，且只包含字母、数字、下划线或连字符')
  if (flag === '--help')
    throw new DefinitionError('--help 是保留选项名')
  return register({ ...createField(kind, config, choices), ...(flag !== undefined ? { flag } : {}) })
}

/**
 * 定义字符串选项
 *
 * @description 必填或提供默认值时得到 string，否则得到 string | undefined
 */
function stringOption(config: RequiredConfig & OptionConfig): Option<string>
function stringOption(config: DefaultConfig<string> & OptionConfig): Option<string>
function stringOption(config?: OptionalConfig & OptionConfig): Option<string | undefined>
function stringOption(config?: ValueConfig & OptionConfig): Option<unknown> {
  return createOption('string', config)
}

/**
 * 定义数值选项
 *
 * @description 输入按有限十进制数转换，默认值不会收窄成字面量类型
 */
function numberOption(config: RequiredConfig & OptionConfig): Option<number>
function numberOption(config: DefaultConfig<number> & OptionConfig): Option<number>
function numberOption(config?: OptionalConfig & OptionConfig): Option<number | undefined>
function numberOption(config?: ValueConfig & OptionConfig): Option<unknown> {
  return createOption('number', config)
}

/**
 * 定义布尔开关
 *
 * @description 不接受取值；显式输入为 true，省略时采用默认值或得到 undefined
 */
function booleanOption(config: DefaultConfig<boolean> & OptionConfig): Option<boolean>
function booleanOption(config?: OptionalConfig & OptionConfig): Option<boolean | undefined>
function booleanOption(config?: ValueConfig & OptionConfig): Option<unknown> {
  return createOption('boolean', config)
}

/**
 * 定义枚举选项
 *
 * @description 候选集合决定取值类型，默认值必须属于该集合
 */
function enumOption<const Choices extends readonly string[]>(choices: Choices, config: RequiredConfig & OptionConfig): Option<Choices[number]>
function enumOption<const Choices extends readonly string[]>(choices: Choices, config: DefaultConfig<NoInfer<Choices[number]>> & OptionConfig): Option<Choices[number]>
function enumOption<const Choices extends readonly string[]>(choices: Choices, config?: OptionalConfig & OptionConfig): Option<Choices[number] | undefined>
function enumOption(choices: readonly string[], config?: ValueConfig & OptionConfig): Option<unknown> {
  return createOption('enum', config, choices)
}

/** 定义字符串位置参数，数组顺序决定匹配顺序 */
function stringArgument<const Name extends string>(name: Name, config: RequiredConfig & { readonly flag?: never }): Argument<Name, string>
function stringArgument<const Name extends string>(name: Name, config?: OptionalConfig & { readonly flag?: never }): Argument<Name, string | undefined>
function stringArgument(name: string, config: (RequiredConfig | OptionalConfig) & { readonly flag?: never } = {}): Argument<string, unknown> {
  if ('flag' in config)
    throw new DefinitionError('位置参数不支持 flag')
  return register({ ...createField('string', config), name })
}

/** 用字段规则声明选项的解析值类型 */
export const option = {
  string: stringOption,
  number: numberOption,
  boolean: booleanOption,
  enum: enumOption,
}

/** 用有序描述声明位置参数的名称和必填规则 */
export const argument = {
  string: stringArgument,
}
