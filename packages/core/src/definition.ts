import { OptionSpecError, snapshotValueParser, ValueParserContractError } from "@argvia/parser";
import type { ParseConfig, ValueParser } from "@argvia/parser";
import { CommandSpecError } from "./errors.ts";
import type { CommandOption, OptionDescriptions } from "./types.ts";

/** 名称参与路由或结构化展示，保持单个可识别的标签 */
export function validateName(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || /[\s\p{Cc}<>]|\[|\]/u.test(value)) {
    throw new CommandSpecError(
      `${field} must be nonempty text without whitespace, control characters or angle/square brackets.`,
      field,
    );
  }
}

function validateDescription(value: unknown, field: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new CommandSpecError(`${field} must be a string.`, field);
  }
}

interface MetadataInput {
  readonly name?: unknown;
  readonly description?: unknown;
  readonly metadata?: unknown;
}

/** 保存节点名称、说明和元数据的浅快照，对象值保留原引用 */
export function snapshotMetadata(definition: MetadataInput): {
  readonly name: string;
  readonly description?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
} {
  const { name, description, metadata } = definition;
  validateName(name, "name");
  validateDescription(description, "description");
  if (
    metadata !== undefined &&
    (typeof metadata !== "object" || metadata === null || Array.isArray(metadata))
  ) {
    throw new CommandSpecError("metadata must be an object.", "metadata");
  }
  const snapshot = Object.freeze({
    name,
    ...(description === undefined ? {} : { description }),
    ...(metadata === undefined
      ? {}
      : { metadata: Object.freeze(Object.assign(Object.create(null), metadata)) }),
  });
  if (name.startsWith("-")) {
    throw new CommandSpecError("A command name must not start with '-'.", "name");
  }
  return snapshot;
}

/** 校验并快照选项规格，以自有属性保留默认值的存在性 */
export function snapshotOptions<const S extends readonly CommandOption[]>(
  options: S,
): OptionDescriptions<S> {
  if (!Array.isArray(options)) {
    throw new OptionSpecError("Option definitions must be an array.");
  }
  const snapshots = options.map((option, index) => {
    if (typeof option !== "object" || option === null || Array.isArray(option)) {
      throw new OptionSpecError("Each option definition must be an object.");
    }
    const field = `options[${index}]`;
    const { long, short, description, valueName, required, repeat } = option;
    validateName(long, `${field}.long`);
    if (short !== undefined) validateName(short, `${field}.short`);
    validateDescription(description, `${field}.description`);
    if (valueName !== undefined) validateName(valueName, `${field}.valueName`);
    const hasBare = Object.hasOwn(option, "defaultWhenBare");
    const hasAbsent = Object.hasOwn(option, "defaultWhenAbsent");
    if (
      (!hasBare && "defaultWhenBare" in option) ||
      (!hasAbsent && "defaultWhenAbsent" in option)
    ) {
      throw new OptionSpecError(
        "Default values must be own properties of the option definition.",
        long,
      );
    }
    let parse: ValueParser<unknown>;
    try {
      parse = snapshotValueParser(option.parse);
    } catch (error) {
      if (error instanceof ValueParserContractError) {
        throw new OptionSpecError(
          "An option needs a value parser with parse() and optional normalize().",
          long,
        );
      }
      throw error;
    }
    return Object.freeze({
      long,
      ...(short === undefined ? {} : { short }),
      parse,
      ...(required === undefined ? {} : { required }),
      ...(repeat === undefined ? {} : { repeat }),
      ...(description === undefined ? {} : { description }),
      ...(valueName === undefined ? {} : { valueName }),
      ...(hasBare ? { defaultWhenBare: option.defaultWhenBare } : {}),
      ...(hasAbsent ? { defaultWhenAbsent: option.defaultWhenAbsent } : {}),
    });
  });
  return Object.freeze(snapshots) as unknown as OptionDescriptions<S>;
}

/** 明示运行时使用的配置默认值 */
export function snapshotParseConfig(
  config: ParseConfig | undefined,
): Readonly<Required<ParseConfig>> {
  if (config === undefined) return Object.freeze({ greedy: false });
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new TypeError("Parser configuration must be an object.");
  }
  const greedy = config.greedy;
  if (greedy !== undefined && typeof greedy !== "boolean") {
    throw new TypeError("greedy must be a boolean.");
  }
  return Object.freeze({ greedy: greedy ?? false });
}
