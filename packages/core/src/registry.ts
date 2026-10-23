import { CommandSpecError } from "./errors.ts";
import type { CommandNode, PreparedNode } from "./types.ts";

type PrepareAt = (argv: readonly string[], offset: number, path: readonly string[]) => PreparedNode;

const nodes = new WeakMap<CommandNode, PrepareAt>();

/** 将公开节点关联到内部路由入口 */
export function registerNode(node: CommandNode, prepare: PrepareAt): void {
  nodes.set(node, prepare);
}

export function isRegisteredNode(value: unknown): value is CommandNode {
  return typeof value === "object" && value !== null && nodes.has(value as CommandNode);
}

/** 通过节点入口沿用本次调用的 argv、偏移和路径 */
export function prepareNode(
  node: CommandNode,
  argv: readonly string[],
  offset: number,
  path: readonly string[],
): PreparedNode {
  const prepare = nodes.get(node);
  if (prepare === undefined) {
    throw new CommandSpecError(
      "Commands must be created by createCommand or createGroup.",
      "commands",
    );
  }
  return prepare(argv, offset, path);
}
