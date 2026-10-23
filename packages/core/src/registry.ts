import { CommandSpecError } from "./errors.ts";
import type { CommandNode, PreparedNode } from "./types.ts";

type PrepareAt = (argv: readonly string[], offset: number, path: readonly string[]) => PreparedNode;

const nodes = new WeakMap<CommandNode, PrepareAt>();

/** 节点只通过创建入口注册，组合时不接纳伪造的执行对象 */
export function registerNode(node: CommandNode, prepare: PrepareAt): void {
  nodes.set(node, prepare);
}

export function isRegisteredNode(value: unknown): value is CommandNode {
  return typeof value === "object" && value !== null && nodes.has(value as CommandNode);
}

/** 内部路由传递根 argv 与偏移，子节点不复制或重新解释路径前缀 */
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
