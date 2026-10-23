import type { CheckedOptions } from "@argvia/parser";
import { snapshotMetadata } from "./definition.ts";
import { compileInput } from "./input.ts";
import { CommandSpecError } from "./errors.ts";
import { once, snapshotArgv } from "./lifecycle.ts";
import { registerNode } from "./registry.ts";
import type {
  ArgumentSpec,
  Command,
  CommandDefinition,
  CommandDescription,
  CommandOption,
  ExecutedCommand,
  ParsedCommand,
  PreparedCommand,
} from "./types.ts";

/** 创建叶子命令；定义读取、输入准备、完整校验和执行可独立组合 */
export function createCommand<
  const S extends readonly CommandOption[] = readonly [],
  const A extends readonly ArgumentSpec[] = readonly [],
  R = unknown,
  const N extends string = string,
>(
  definition: CommandDefinition<S, A, R, N> & {
    readonly options?: S & NoInfer<CheckedOptions<S>>;
  },
): NoInfer<Command<S, A, R, N>> {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
    throw new CommandSpecError("A command definition must be an object.");
  }
  if ("commands" in definition) {
    throw new CommandSpecError(
      "A command has a handler; use a group to organize children.",
      "commands",
    );
  }
  const metadata = snapshotMetadata(definition);
  const handler = definition.handler;
  if (typeof handler !== "function") {
    throw new CommandSpecError("A command needs a handler function.", "handler");
  }
  const compiled = compileInput(
    (definition.options === undefined ? [] : definition.options) as S,
    (definition.arguments === undefined ? [] : definition.arguments) as unknown as A,
    definition.parser,
  );
  const description = Object.freeze({
    ...metadata,
    kind: "command" as const,
    options: compiled.options,
    arguments: compiled.arguments,
    parser: compiled.parser,
  }) as CommandDescription<S, A, N>;

  function prepareAt(
    argv: readonly string[],
    offset: number,
    path: readonly string[],
  ): PreparedCommand<S, A, R, N> {
    const prepared = compiled.prepare(argv, offset);
    const source = prepared.source;
    const complete = once((): ParsedCommand<S, A, R, N> => {
      const input = prepared.complete();
      return Object.freeze({
        kind: "command",
        name: description.name,
        definition: description,
        path,
        input,
        async execute(): Promise<ExecutedCommand<S, A, R, N>> {
          const value = await handler(input);
          return Object.freeze({
            kind: "executed",
            name: description.name,
            definition: description,
            path,
            input,
            value,
          });
        },
      });
    });
    return Object.freeze({
      kind: "command",
      name: description.name,
      definition: description,
      path,
      options: source.values,
      source,
      complete,
    });
  }

  function prepare(argv: readonly string[]): PreparedCommand<S, A, R, N> {
    return prepareAt(snapshotArgv(argv), 0, Object.freeze([description.name]));
  }
  function parse(argv: readonly string[]): ParsedCommand<S, A, R, N> {
    return prepare(argv).complete();
  }
  async function execute(argv: readonly string[]): Promise<ExecutedCommand<S, A, R, N>> {
    return parse(argv).execute();
  }
  const command = Object.freeze({ definition: description, prepare, parse, execute });
  registerNode(command, prepareAt);
  return command;
}
