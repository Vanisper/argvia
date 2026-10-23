import { decodeValue, snapshotValueParser, ValueParserContractError } from "@argvia/parser";
import type { PositionalToken, ValueParser } from "@argvia/parser";
import { validateName } from "./definition.ts";
import { ArgumentError, CommandSpecError } from "./errors.ts";
import type {
  ArgumentDescriptions,
  ArgumentSpec,
  ArgumentValueRecord,
  ParsedPositionals,
} from "./types.ts";

interface RegisteredArgument {
  readonly name: string;
  readonly parse: ValueParser<unknown>;
  readonly description?: string;
  readonly required: boolean;
  readonly variadic: boolean;
}

interface CompiledArguments<A extends readonly ArgumentSpec[]> {
  readonly definitions: ArgumentDescriptions<A>;
  readonly parse: (tokens: readonly PositionalToken[]) => ParsedPositionals<A>;
}

/** 固定位置归属与回调快照；值域结果不参与参数分配 */
export function compileArguments<const A extends readonly ArgumentSpec[]>(
  definitions: A,
): CompiledArguments<A> {
  if (!Array.isArray(definitions)) {
    throw new CommandSpecError("Argument definitions must be an array.", "arguments");
  }

  const names = new Set<string>();
  const registered: RegisteredArgument[] = [];
  let optionalSeen = false;

  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index]!;
    const field = `arguments[${index}]`;
    const invalid = (message: string): never => {
      throw new CommandSpecError(message, field);
    };
    if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
      invalid("Each argument definition must be an object.");
    }

    const { name, description, required, variadic } = definition;
    validateName(name, `${field}.name`);
    if (names.has(name)) invalid(`Duplicate argument name ${JSON.stringify(name)}.`);
    if (description !== undefined && typeof description !== "string") {
      invalid("An argument description must be a string.");
    }
    if (required !== undefined && typeof required !== "boolean") {
      invalid("required must be a boolean.");
    }
    if (variadic !== undefined && typeof variadic !== "boolean") {
      invalid("variadic must be a boolean.");
    }
    if (
      "default" in definition ||
      "defaultWhenAbsent" in definition ||
      "defaultWhenBare" in definition
    ) {
      invalid("Positional argument defaults are not supported.");
    }
    if (required === true && optionalSeen) {
      invalid("Required arguments must precede optional arguments.");
    }
    if (variadic === true && index !== definitions.length - 1) {
      invalid("Only the last argument may be variadic.");
    }

    let parse: ValueParser<unknown>;
    try {
      parse = snapshotValueParser(definition.parse);
    } catch (error) {
      if (error instanceof ValueParserContractError) {
        invalid("An argument needs a value parser with parse() and optional normalize().");
      }
      throw error;
    }

    names.add(name);
    if (required !== true) optionalSeen = true;
    registered.push(
      Object.freeze({
        name,
        ...(description === undefined ? {} : { description }),
        parse,
        required: required ?? false,
        variadic: variadic ?? false,
      }),
    );
  }

  const arguments_ = Object.freeze(registered);

  function parse(tokens: readonly PositionalToken[]): ParsedPositionals<A> {
    for (let index = 0; index < arguments_.length; index += 1) {
      const argument = arguments_[index]!;
      if (argument.required && tokens[index] === undefined) {
        throw new ArgumentError(
          "MissingArgument",
          `Missing required argument ${JSON.stringify(argument.name)}.`,
          { argument: argument.name },
        );
      }
    }

    if (!arguments_.at(-1)?.variadic && tokens.length > arguments_.length) {
      const token = tokens[arguments_.length]!;
      throw new ArgumentError(
        "UnexpectedArgument",
        `Unexpected positional argument ${JSON.stringify(token.raw)}.`,
        { token: token.raw, raw: token.raw, index: token.index },
      );
    }

    const values: Record<string, unknown> = Object.create(null);
    const provided: Record<string, boolean> = Object.create(null);
    const records: Record<string, readonly ArgumentValueRecord[]> = Object.create(null);

    for (let index = 0; index < arguments_.length; index += 1) {
      const argument = arguments_[index]!;
      const assigned = argument.variadic
        ? tokens.slice(index)
        : tokens[index] === undefined
          ? []
          : [tokens[index]!];
      const argumentRecords: ArgumentValueRecord[] = [];

      for (const token of assigned) {
        const { normalized, result } = decodeValue(argument.parse, token.raw);
        if (!result.ok) {
          throw new ArgumentError(
            "InvalidArgument",
            `Invalid value ${JSON.stringify(token.raw)} for argument ${JSON.stringify(argument.name)}; expected ${JSON.stringify(result.expected)}.`,
            {
              argument: argument.name,
              token: token.raw,
              index: token.index,
              raw: token.raw,
              expected: result.expected,
              ...(result.reason === undefined ? {} : { reason: result.reason }),
            },
          );
        }
        argumentRecords.push(
          Object.freeze({
            value: result.value,
            raw: token.raw,
            normalized,
            index: token.index,
          }),
        );
      }

      provided[argument.name] = assigned.length > 0;
      records[argument.name] = Object.freeze(argumentRecords);
      if (argument.variadic) {
        values[argument.name] = Object.freeze(argumentRecords.map((record) => record.value));
      } else if (argumentRecords.length > 0) {
        values[argument.name] = argumentRecords[0]!.value;
      }
    }

    return Object.freeze({
      values: Object.freeze(values),
      provided: Object.freeze(provided),
      records: Object.freeze(records),
    }) as ParsedPositionals<A>;
  }

  return Object.freeze({
    definitions: arguments_ as unknown as ArgumentDescriptions<A>,
    parse,
  });
}
