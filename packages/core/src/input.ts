import { createParser } from "@argvia/parser";
import type { OptionSpec, ParseConfig, ParsedArguments, PreparedArguments } from "@argvia/parser";
import { compileArguments } from "./arguments.ts";
import { guardValueParser, relocateArguments, withParseOffset } from "./coordinates.ts";
import { snapshotOptions, snapshotParseConfig } from "./definition.ts";
import type { ArgumentSpec, CommandInput, CommandOption } from "./types.ts";

/** 编译节点的本地输入；公开描述与运行使用同一份规格快照 */
export function compileInput<S extends readonly CommandOption[], A extends readonly ArgumentSpec[]>(
  options: S,
  arguments_: A,
  config?: ParseConfig,
) {
  const optionDefinitions = snapshotOptions(options);
  const parserConfig = snapshotParseConfig(config);
  const parser = createParser<readonly OptionSpec[]>(
    optionDefinitions.map((option) => ({ ...option, parse: guardValueParser(option.parse) })),
    parserConfig,
  );
  const positional = compileArguments(arguments_);
  return {
    options: optionDefinitions,
    arguments: positional.definitions,
    parser: parserConfig,
    prepare(argv: readonly string[], offset: number) {
      const local = withParseOffset(offset, () => parser.prepare(argv.slice(offset)));
      const source = relocateArguments(local, offset) as PreparedArguments<S>;
      return {
        source,
        complete(): CommandInput<S, A> {
          const optionSource = relocateArguments(
            withParseOffset(offset, () => parser.complete(local)),
            offset,
          ) as ParsedArguments<S>;
          const argumentSource = positional.parse(optionSource.positionalTokens);
          return Object.freeze({
            options: optionSource.values,
            arguments: argumentSource.values,
            source: Object.freeze({ options: optionSource, arguments: argumentSource }),
          });
        },
      };
    },
  };
}
