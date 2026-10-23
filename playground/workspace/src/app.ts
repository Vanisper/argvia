import { values } from "@argvia/parser";

import { createCommand, createGroup } from "@argvia/core";
import { renderHelp } from "./help.ts";

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

/** 创建命令树并将处理函数连接到注入的服务 */
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
      return { kind: "text", text: renderHelp(prepared.definition, prepared.path) };
    }
    if (prepared.options.version === true) {
      const version = tree.definition.metadata?.version;
      if (typeof version !== "string") throw new TypeError("Application version must be a string.");
      return { kind: "text", text: version };
    }
    const completed = prepared.complete();
    if (completed.kind === "group") {
      return { kind: "text", text: renderHelp(completed.definition, completed.path) };
    }
    const result = await completed.execute();
    return { kind: "result", value: result.value };
  }

  return { tree, run };
}
