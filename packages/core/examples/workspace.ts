import { values } from "@argvia/parser";

import { createCommand, createGroup, type NodeDescription } from "../src/index.ts";

export interface WorkspaceServices {
  build(input: {
    readonly entry: string;
    readonly mode: "fast" | "safe";
    readonly tags: readonly string[];
  }): string | Promise<string>;
  inspect(input: { readonly entry: string }): string;
}

export type WorkspaceResult =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "result"; readonly value: string };

/** 应用可用同一描述树生成终端帮助、文档或其他展示 */
export function renderDescription(definition: NodeDescription, path: readonly string[]): string {
  const positionals =
    definition.kind === "group"
      ? ["<command>"]
      : definition.arguments.map((argument) => {
          const name = `${argument.name}${argument.variadic ? "..." : ""}`;
          return argument.required ? `<${name}>` : `[${name}]`;
        });
  const lines = [`Usage: ${[...path, ...positionals, "[options]"].join(" ")}`];
  if (definition.description) lines.push("", definition.description);
  if (definition.kind === "group") {
    lines.push("", "Commands:");
    for (const command of definition.commands) {
      lines.push(`  ${command.name}${command.description ? `  ${command.description}` : ""}`);
    }
  } else if (definition.arguments.length > 0) {
    lines.push("", "Arguments:");
    for (const argument of definition.arguments) {
      lines.push(`  ${argument.name}${argument.description ? `  ${argument.description}` : ""}`);
    }
  }
  if (definition.options.length > 0) {
    lines.push("", "Options:");
    for (const option of definition.options) {
      const names = [
        option.short === undefined ? undefined : `-${option.short}`,
        `--${option.long}`,
      ]
        .filter((name) => name !== undefined)
        .join(", ");
      const value = Object.hasOwn(option, "defaultWhenBare")
        ? ""
        : ` <${option.valueName ?? option.long}>`;
      lines.push(`  ${names}${value}${option.description ? `  ${option.description}` : ""}`);
    }
  }
  return lines.join("\n");
}

/** 依赖通过应用工厂注入，输出与进程状态由宿主决定 */
export function createWorkspace(services: WorkspaceServices) {
  const controls = [
    {
      long: "help",
      short: "h",
      parse: values.boolean(),
      defaultWhenBare: true,
      description: "Show command information",
    },
    {
      long: "version",
      short: "V",
      parse: values.boolean(),
      defaultWhenBare: true,
      description: "Show application version",
    },
  ] as const;
  const build = createCommand({
    name: "build",
    description: "Build an asset entry",
    options: [
      ...controls,
      {
        long: "mode",
        parse: values.enumeration(["fast", "safe"]),
        defaultWhenAbsent: "fast",
        description: "Build mode",
      },
      { long: "tag", parse: values.string(), repeat: "append", description: "Attach a tag" },
    ],
    arguments: [
      { name: "entry", parse: values.string(), required: true, description: "Asset entry" },
    ],
    handler(input) {
      return services.build({
        entry: input.arguments.entry,
        mode: input.options.mode,
        tags: input.options.tag,
      });
    },
  });
  const inspect = createCommand({
    name: "inspect",
    description: "Inspect an asset entry",
    options: controls,
    arguments: [
      { name: "entry", parse: values.string(), required: true, description: "Asset entry" },
    ],
    handler: (input) => services.inspect({ entry: input.arguments.entry }),
  });
  const assets = createGroup({
    name: "assets",
    description: "Asset operations",
    options: controls,
    commands: [build, inspect],
  });
  const tree = createGroup({
    name: "tool",
    description: "Workspace tools",
    metadata: { version: "1.0.0" },
    options: controls,
    commands: [assets],
  });

  async function run(argv: readonly string[]): Promise<WorkspaceResult> {
    const prepared = tree.prepare(argv);
    if (prepared.options.help === true) {
      return { kind: "text", text: renderDescription(prepared.definition, prepared.path) };
    }
    if (prepared.options.version === true) {
      const version = tree.definition.metadata?.version;
      if (typeof version !== "string") throw new TypeError("Application version must be a string.");
      return { kind: "text", text: version };
    }
    const completed = prepared.complete();
    if (completed.kind === "group") {
      return { kind: "text", text: renderDescription(completed.definition, completed.path) };
    }
    const result = await completed.execute();
    return { kind: "result", value: result.value };
  }

  return { tree, run };
}
