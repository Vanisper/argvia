import {
  longNameProblem,
  shortNameProblem,
  snapshotValueParser,
  ValueParserContractError,
} from "@argvia/parser";
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

/**
 * 校验并快照选项规格，以自有属性保留默认值的存在性
 *
 * 名称先按 parser 的语法规则检查，再应用本包的展示约束，
 * 两类问题都在此处报告为带字段位置的 CommandSpecError
 */
export function snapshotOptions<const S extends readonly CommandOption[]>(
  options: S,
): OptionDescriptions<S> {
  if (!Array.isArray(options)) {
    throw new CommandSpecError("options must be an array.", "options");
  }
  const longNames = new Set<string>();
  const shortNames = new Set<string>();
  const snapshots = options.map((option, index) => {
    const field = `options[${index}]`;
    if (typeof option !== "object" || option === null || Array.isArray(option)) {
      throw new CommandSpecError("Each option definition must be an object.", field);
    }
    const { long, short, description, valueName, required, repeat } = option;
    const longProblem = longNameProblem(long);
    if (longProblem !== undefined) {
      throw new CommandSpecError(`${field}.long ${longProblem}.`, `${field}.long`);
    }
    validateName(long, `${field}.long`);
    if (short !== undefined) {
      const shortProblem = shortNameProblem(short);
      if (shortProblem !== undefined) {
        throw new CommandSpecError(`${field}.short ${shortProblem}.`, `${field}.short`);
      }
      validateName(short, `${field}.short`);
    }
    validateDescription(description, `${field}.description`);
    if (valueName !== undefined) validateName(valueName, `${field}.valueName`);
    if (longNames.has(long)) {
      throw new CommandSpecError(`Duplicate long name ${JSON.stringify(long)}.`, `${field}.long`);
    }
    if (short !== undefined && shortNames.has(short)) {
      throw new CommandSpecError(
        `Duplicate short name ${JSON.stringify(short)}.`,
        `${field}.short`,
      );
    }
    if (required !== undefined && typeof required !== "boolean") {
      throw new CommandSpecError("required must be a boolean.", `${field}.required`);
    }
    if (repeat !== undefined && repeat !== "last" && repeat !== "append" && repeat !== "error") {
      throw new CommandSpecError("repeat must be 'last', 'append', or 'error'.", `${field}.repeat`);
    }
    const hasBare = Object.hasOwn(option, "defaultWhenBare");
    const hasAbsent = Object.hasOwn(option, "defaultWhenAbsent");
    if (
      (!hasBare && "defaultWhenBare" in option) ||
      (!hasAbsent && "defaultWhenAbsent" in option)
    ) {
      throw new CommandSpecError(
        "Default values must be own properties of the option definition.",
        field,
      );
    }
    if (hasAbsent && required === true) {
      throw new CommandSpecError(
        "required cannot be combined with defaultWhenAbsent.",
        `${field}.defaultWhenAbsent`,
      );
    }
    if (hasAbsent && repeat === "append") {
      throw new CommandSpecError(
        "append cannot be combined with defaultWhenAbsent.",
        `${field}.defaultWhenAbsent`,
      );
    }
    let parse: ValueParser<unknown>;
    try {
      parse = snapshotValueParser(option.parse);
    } catch (error) {
      if (!(error instanceof ValueParserContractError)) throw error;
      throw new CommandSpecError(
        "An option needs a value parser with parse() and optional normalize().",
        `${field}.parse`,
      );
    }
    longNames.add(long);
    if (short !== undefined) shortNames.add(short);
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
