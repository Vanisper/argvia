import { createParser, OptionSpecError, values } from "@argvia/parser";
import type { CheckedOptions, OptionSpec, ParsedArguments } from "@argvia/parser";
import { compileArguments } from "./arguments.ts";
import { CommandSpecError } from "./errors.ts";
import { buildHelpDocument } from "./help.ts";
import type {
  ArgumentSpec,
  Command,
  CommandDefinition,
  CommandExecuteResult,
  CommandInput,
  CommandOption,
  CommandParseResult,
  HelpOption,
} from "./types.ts";

function singleLine(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    /[\r\n\u2028\u2029]/u.test(value)
  ) {
    throw new CommandSpecError(
      `${field} must be nonempty single-line text without surrounding whitespace.`,
      field,
    );
  }
}

function description(value: unknown, field: string): asserts value is string | undefined {
  if (value !== undefined && typeof value !== "string") {
    throw new CommandSpecError(`${field} must be a string.`, field);
  }
}

function optionHelp(option: CommandOption, index: number): HelpOption {
  const field = `options[${index}]`;
  if (typeof option !== "object" || option === null || Array.isArray(option)) {
    throw new OptionSpecError("Each option definition must be an object.");
  }
  const summary = option.description;
  description(summary, `${field}.description`);
  const valueName = option.valueName;
  if (valueName !== undefined) {
    singleLine(valueName, `${field}.valueName`);
    if (/[<>]/u.test(valueName)) {
      throw new CommandSpecError(
        "valueName must not contain angle brackets.",
        `${field}.valueName`,
      );
    }
  }
  return Object.freeze({
    long: option.long,
    ...(option.short === undefined ? {} : { short: option.short }),
    ...(summary === undefined ? {} : { description: summary }),
    ...(valueName === undefined ? {} : { valueName }),
    required: option.required === true,
    repeat: option.repeat ?? "last",
    bare: Object.hasOwn(option, "defaultWhenBare"),
  });
}

function businessSource<const S extends readonly CommandOption[]>(
  source: ParsedArguments<readonly OptionSpec[]>,
  names: ReadonlySet<string>,
): ParsedArguments<S> {
  const projectedValues: Record<string, unknown> = Object.create(null);
  const projectedProvided: Record<string, boolean> = Object.create(null);
  const projectedRecords: Record<string, unknown> = Object.create(null);
  for (const name of names) {
    if (Object.hasOwn(source.values, name)) projectedValues[name] = source.values[name];
    projectedProvided[name] = source.provided[name]!;
    projectedRecords[name] = source.records[name];
  }
  return Object.freeze({
    values: Object.freeze(projectedValues),
    provided: Object.freeze(projectedProvided),
    records: Object.freeze(projectedRecords),
    occurrences: Object.freeze(
      source.occurrences.filter((occurrence) => names.has(occurrence.option)),
    ),
    positionals: source.positionals,
    positionalTokens: source.positionalTokens,
    terminatorIndex: source.terminatorIndex,
  }) as unknown as ParsedArguments<S>;
}

/**
 * 创建接收显式 argv 的单命令，保留业务输入与原始来源
 *
 * @description 解析成功的帮助与版本请求跳过必填和位置参数检查；execute 等待处理函数完成，不输出或设置进程状态
 */
export function createCommand<
  const S extends readonly CommandOption[] = readonly [],
  const A extends readonly ArgumentSpec[] = readonly [],
  R = unknown,
>(
  definition: CommandDefinition<S, A, R> & {
    readonly options?: S & NoInfer<CheckedOptions<S>>;
  },
): Command<S, A, R> {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
    throw new CommandSpecError("A command definition must be an object.");
  }
  const name = definition.name;
  singleLine(name, "name");
  const summary = definition.description;
  description(summary, "description");
  const handler = definition.handler;
  if (typeof handler !== "function") {
    throw new CommandSpecError("A command needs a handler function.", "handler");
  }
  const helpEnabled = definition.help;
  if (helpEnabled !== undefined && typeof helpEnabled !== "boolean") {
    throw new CommandSpecError("help must be a boolean.", "help");
  }
  const version = definition.version;
  if (version !== undefined) singleLine(version, "version");

  const options = definition.options === undefined ? [] : definition.options;
  if (!Array.isArray(options)) throw new OptionSpecError("Option definitions must be an array.");
  const userOptions = [...options];
  const helpOptions = userOptions.map(optionHelp);
  const names = new Set(helpOptions.map((option) => option.long));
  const builtins: CommandOption<boolean>[] = [];
  if (helpEnabled !== false) {
    builtins.push({
      long: "help",
      short: "h",
      parse: values.boolean(),
      defaultWhenBare: true,
      description: "Show help",
    });
  }
  if (version !== undefined) {
    builtins.push({
      long: "version",
      short: "V",
      parse: values.boolean(),
      defaultWhenBare: true,
      description: "Show version",
    });
  }
  for (const [index, option] of helpOptions.entries()) {
    for (const builtin of builtins) {
      if (option.long === builtin.long || option.short === builtin.short) {
        throw new CommandSpecError(
          `Option ${JSON.stringify(option.long)} conflicts with the built-in --${builtin.long}/-${builtin.short} request.`,
          `options[${index}]`,
        );
      }
    }
  }

  // parser 在创建时保存规则、回调与配置；调用后不再读取原定义
  const parser = createParser<readonly OptionSpec[]>(
    [...userOptions, ...builtins],
    definition.parser,
  );
  const positional = compileArguments(
    (definition.arguments === undefined ? [] : definition.arguments) as unknown as A,
  );
  const help = buildHelpDocument({
    name,
    ...(summary === undefined ? {} : { description: summary }),
    options: [
      ...helpOptions,
      ...builtins.map((option, index) => optionHelp(option, userOptions.length + index)),
    ],
    arguments: positional.helpArguments,
  });

  function parse(argv: readonly string[]): CommandParseResult<S, A> {
    const prepared = parser.prepare(argv);
    if (helpEnabled !== false && prepared.provided.help === true && prepared.values.help === true) {
      return Object.freeze({ kind: "help", document: help });
    }
    if (
      version !== undefined &&
      prepared.provided.version === true &&
      prepared.values.version === true
    ) {
      return Object.freeze({ kind: "version", version });
    }
    const optionSource = businessSource<S>(parser.complete(prepared), names);
    const argumentSource = positional.parse(optionSource.positionalTokens);
    const input: CommandInput<S, A> = Object.freeze({
      options: optionSource.values,
      arguments: argumentSource.values,
      source: Object.freeze({ options: optionSource, arguments: argumentSource }),
    });
    return Object.freeze({ kind: "input", input });
  }

  async function execute(argv: readonly string[]): Promise<CommandExecuteResult<S, A, R>> {
    const result = parse(argv);
    if (result.kind !== "input") return result;
    const value = await handler(result.input);
    return Object.freeze({ kind: "executed", input: result.input, value });
  }

  return Object.freeze({ help, parse, execute });
}
