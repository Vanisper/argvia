import type { NodeDescription } from "@argvia/core";

/** 按当前节点和调用路径生成帮助文本 */
export function renderHelp(definition: NodeDescription, path: readonly string[]): string {
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
