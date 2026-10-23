import type { CheckedOptions } from "@argvia/parser";
import { snapshotMetadata } from "./definition.ts";
import { compileInput } from "./input.ts";
import { CommandSpecError, RouteError } from "./errors.ts";
import { once, snapshotArgv } from "./lifecycle.ts";
import { isRegisteredNode, prepareNode, registerNode } from "./registry.ts";
import type {
  CommandGroup,
  CommandNode,
  CommandOption,
  ExecutedOf,
  GroupDefinition,
  GroupDescription,
  ParsedGroup,
  ParsedOf,
  PreparedGroup,
  PreparedNode,
  PreparedOf,
} from "./types.ts";

/** 创建显式命令分组；分组本地输入与子命令输入使用各自的声明 */
export function createGroup<
  const S extends readonly CommandOption[] = readonly [],
  const C extends readonly CommandNode[] = readonly [],
  const N extends string = string,
>(
  definition: GroupDefinition<S, C, N> & { readonly options?: S & NoInfer<CheckedOptions<S>> },
): NoInfer<CommandGroup<S, C, N>> {
  if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
    throw new CommandSpecError("A group definition must be an object.");
  }
  if ("arguments" in definition || "handler" in definition) {
    throw new CommandSpecError(
      "A group contains commands and local options, not arguments or a handler.",
    );
  }
  const metadata = snapshotMetadata(definition);
  if (metadata.name.startsWith("-")) {
    throw new CommandSpecError("A command name must not start with '-'.", "name");
  }
  const children = definition.commands;
  if (!Array.isArray(children)) {
    throw new CommandSpecError("commands must be an array of command nodes.", "commands");
  }
  const registered = new Map<string, CommandNode>();
  for (const [index, child] of children.entries()) {
    if (!isRegisteredNode(child)) {
      throw new CommandSpecError(
        "Commands must be created by createCommand or createGroup.",
        `commands[${index}]`,
      );
    }
    const name = child.definition.name;
    if (registered.has(name)) {
      throw new CommandSpecError(
        `Duplicate command name ${JSON.stringify(name)}.`,
        `commands[${index}]`,
      );
    }
    registered.set(name, child);
  }
  const compiled = compileInput(
    (definition.options === undefined ? [] : definition.options) as S,
    [] as const,
    definition.parser,
  );
  const description = Object.freeze({
    ...metadata,
    kind: "group" as const,
    options: compiled.options,
    commands: Object.freeze([...registered.values()].map((child) => child.definition)),
    parser: compiled.parser,
  }) as GroupDescription<S, N>;
  const candidates = Object.freeze([...registered.keys()]);

  function prepareAt(
    argv: readonly string[],
    offset: number,
    path: readonly string[],
  ): PreparedNode {
    const token = argv[offset];
    if (token !== undefined && !token.startsWith("-")) {
      const selected = registered.get(token);
      if (selected === undefined) {
        throw new RouteError("UnknownCommand", `Unknown command ${JSON.stringify(token)}.`, {
          path,
          token,
          index: offset,
          commands: candidates,
        });
      }
      return prepareNode(selected, argv, offset + 1, Object.freeze([...path, token]));
    }

    const prepared = compiled.prepare(argv, offset);
    const source = prepared.source;
    const complete = once((): ParsedGroup<S, N> => {
      const input = prepared.complete();
      return Object.freeze({
        kind: "group",
        name: description.name,
        definition: description,
        path,
        input,
      });
    });
    return Object.freeze({
      kind: "group",
      name: description.name,
      definition: description,
      path,
      options: source.values,
      source,
      complete,
    }) as PreparedGroup<S, N>;
  }

  function prepare(argv: readonly string[]): PreparedGroup<S, N> | PreparedOf<C[number]> {
    return prepareAt(snapshotArgv(argv), 0, Object.freeze([description.name])) as
      | PreparedGroup<S, N>
      | PreparedOf<C[number]>;
  }
  function parse(argv: readonly string[]): ParsedGroup<S, N> | ParsedOf<C[number]> {
    return prepare(argv).complete() as ParsedGroup<S, N> | ParsedOf<C[number]>;
  }
  async function execute(argv: readonly string[]): Promise<ExecutedOf<C[number]>> {
    const result = parse(argv);
    if (result.kind === "group") {
      throw new RouteError("MissingCommand", "Choose a command before execution.", {
        path: result.path,
        commands: result.definition.commands.map((child) => child.name),
      });
    }
    return (await result.execute()) as ExecutedOf<C[number]>;
  }
  const group = Object.freeze({ definition: description, prepare, parse, execute });
  registerNode(group, prepareAt);
  return group;
}
