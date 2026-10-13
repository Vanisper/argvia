import type {
  Argument,
  DefaultConfig,
  FieldRules,
  MultipleConfig,
  Option,
  OptionalConfig,
  OptionConfig,
  RequiredConfig,
  ValueConfig,
  ValueNameConfig,
} from './types.js'
import { COMMAND_IDENTIFIER } from './constants.js'
import { DefinitionError } from './errors.js'

const descriptors = new WeakSet<object>()

interface SingleOptionConfig extends OptionConfig {
  readonly multiple?: false
}

interface ValueOptionConfig extends SingleOptionConfig, ValueNameConfig {}

interface BooleanOptionConfig extends SingleOptionConfig {
  readonly valueName?: never
}

interface ArgumentConfig extends ValueNameConfig {
  readonly flag?: never
  readonly multiple?: never
}

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
  config: ValueConfig & ValueNameConfig = {},
  choices?: readonly string[],
): FieldRules {
  const hasDefault = Object.hasOwn(config, 'default')
  if (config.required && hasDefault)
    throw new DefinitionError('required 与 default 不能同时使用')
  if (kind === 'boolean' && config.required)
    throw new DefinitionError('布尔开关不支持 required')
  const hasValueName = 'valueName' in config
  if (hasValueName && kind === 'boolean')
    throw new DefinitionError('布尔开关不支持 valueName')
  if (hasValueName && (typeof config.valueName !== 'string' || !config.valueName || config.valueName.trim() !== config.valueName || /[<>\r\n\u2028\u2029]/u.test(config.valueName)))
    throw new DefinitionError('valueName 必须是非空白单行文本，且不包含尖括号或首尾空白')

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
    ...(config.valueName !== undefined ? { valueName: config.valueName } : {}),
    ...(hasDefault ? { default: config.default as string | number | boolean } : {}),
    ...(choices ? { choices: Object.freeze([...choices]) } : {}),
  }
}

function createOption(
  kind: FieldRules['kind'],
  config: ValueConfig & OptionConfig & ValueNameConfig & { readonly multiple?: boolean } = {},
  choices?: readonly string[],
): Option<unknown> {
  const hasFlag = 'flag' in config
  const flag = config.flag
  if (hasFlag && (typeof flag !== 'string' || flag.trim() !== flag || !flag.startsWith('--') || !COMMAND_IDENTIFIER.test(flag.slice(2))))
    throw new DefinitionError('flag 必须以 -- 和字母开头，且只包含字母、数字、下划线或连字符')
  if (flag === '--help')
    throw new DefinitionError('--help 是保留选项名')
  const hasMultiple = 'multiple' in config
  const multiple = config.multiple
  if (hasMultiple && typeof multiple !== 'boolean')
    throw new DefinitionError('multiple 必须是布尔值')
  if (multiple) {
    if (kind !== 'string')
      throw new DefinitionError('只有字符串选项支持 multiple')
    if ('required' in config || 'default' in config)
      throw new DefinitionError('重复字符串选项不支持 required 或 default')
  }
  return register({
    ...createField(kind, config, choices),
    ...(flag !== undefined ? { flag } : {}),
    ...(multiple !== undefined ? { multiple } : {}),
  })
}

/**
 * 定义字符串选项
 *
 * @description
 * - multiple 为 true 时按输入顺序得到 string[]，省略输入时得到空数组
 * - 单值必填或提供默认值时得到 string，否则得到 string | undefined
 */
function stringOption(config: MultipleConfig): Option<string[]>
function stringOption(config: RequiredConfig & ValueOptionConfig): Option<string>
function stringOption(config: DefaultConfig<string> & ValueOptionConfig): Option<string>
function stringOption(config?: OptionalConfig & ValueOptionConfig): Option<string | undefined>
function stringOption(config?: (ValueConfig & ValueOptionConfig) | MultipleConfig): Option<unknown> {
  return createOption('string', config)
}

/**
 * 定义数值选项
 *
 * @description 输入按有限十进制数转换，默认值不会收窄成字面量类型
 */
function numberOption(config: RequiredConfig & ValueOptionConfig): Option<number>
function numberOption(config: DefaultConfig<number> & ValueOptionConfig): Option<number>
function numberOption(config?: OptionalConfig & ValueOptionConfig): Option<number | undefined>
function numberOption(config?: ValueConfig & ValueOptionConfig): Option<unknown> {
  return createOption('number', config)
}

/**
 * 定义布尔开关
 *
 * @description
 * - 裸开关为 true，仅通过等号接受精确的小写 true 或 false，不消费下一项
 * - 省略时采用默认值或得到 undefined
 */
function booleanOption(config: DefaultConfig<boolean> & BooleanOptionConfig): Option<boolean>
function booleanOption(config?: OptionalConfig & BooleanOptionConfig): Option<boolean | undefined>
function booleanOption(config?: ValueConfig & BooleanOptionConfig): Option<unknown> {
  return createOption('boolean', config)
}

/**
 * 定义枚举选项
 *
 * @description 候选集合决定取值类型，默认值必须属于该集合
 */
function enumOption<const Choices extends readonly string[]>(choices: Choices, config: RequiredConfig & ValueOptionConfig): Option<Choices[number]>
function enumOption<const Choices extends readonly string[]>(choices: Choices, config: DefaultConfig<NoInfer<Choices[number]>> & ValueOptionConfig): Option<Choices[number]>
function enumOption<const Choices extends readonly string[]>(choices: Choices, config?: OptionalConfig & ValueOptionConfig): Option<Choices[number] | undefined>
function enumOption(choices: readonly string[], config?: ValueConfig & ValueOptionConfig): Option<unknown> {
  return createOption('enum', config, choices)
}

/** 定义字符串位置参数，数组顺序决定匹配顺序 */
function stringArgument<const Name extends string>(name: Name, config: RequiredConfig & ArgumentConfig): Argument<Name, string>
function stringArgument<const Name extends string>(name: Name, config?: OptionalConfig & ArgumentConfig): Argument<Name, string | undefined>
function stringArgument(name: string, config: (RequiredConfig | OptionalConfig) & ArgumentConfig = {}): Argument<string, unknown> {
  if ('flag' in config)
    throw new DefinitionError('位置参数不支持 flag')
  if ('multiple' in config)
    throw new DefinitionError('位置参数不支持 multiple')
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
