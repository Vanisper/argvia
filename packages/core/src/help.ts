import type { HelpArgument, HelpDocument, HelpOption } from "./types.ts";

interface HelpInput {
  readonly name: string;
  readonly description?: string;
  readonly options: readonly HelpOption[];
  readonly arguments: readonly HelpArgument[];
}

function argumentLabel(argument: HelpArgument): string {
  const label = `${argument.name}${argument.variadic ? "..." : ""}`;
  return argument.required ? `<${label}>` : `[${label}]`;
}

/** 从已校验的命令元数据生成冻结帮助文档，不执行值回调 */
export function buildHelpDocument(input: HelpInput): HelpDocument {
  const options = Object.freeze(
    input.options.map((option) =>
      Object.freeze({
        long: option.long,
        ...(option.short === undefined ? {} : { short: option.short }),
        ...(option.description === undefined ? {} : { description: option.description }),
        ...(option.valueName === undefined ? {} : { valueName: option.valueName }),
        required: option.required,
        repeat: option.repeat,
        bare: option.bare,
      }),
    ),
  );
  const arguments_ = Object.freeze(
    input.arguments.map((argument) =>
      Object.freeze({
        name: argument.name,
        ...(argument.description === undefined ? {} : { description: argument.description }),
        required: argument.required,
        variadic: argument.variadic,
      }),
    ),
  );
  const usage = [
    input.name,
    ...(options.length === 0 ? [] : ["[options]"]),
    ...arguments_.map(argumentLabel),
  ].join(" ");

  return Object.freeze({
    name: input.name,
    ...(input.description === undefined ? {} : { description: input.description }),
    usage,
    options,
    arguments: arguments_,
  });
}

function optionLabels(option: HelpOption): [string, string] {
  const valueName = option.valueName || option.long;
  const long = option.bare
    ? `--${option.long}[=<${valueName}>]`
    : `--${option.long} <${valueName}>`;
  const short =
    option.short === undefined
      ? ""
      : option.bare
        ? `-${option.short}`
        : `-${option.short} <${valueName}>`;
  return [short, long];
}

function annotations(required: boolean, repeat?: HelpOption["repeat"]): string {
  const labels = [
    ...(required ? ["required"] : []),
    ...(repeat === undefined || repeat === "last" ? [] : [`repeat: ${repeat}`]),
  ];
  return labels.length === 0 ? "" : `(${labels.join(", ")})`;
}

function renderRows(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>((columns, row) => {
    for (let index = 0; index < row.length - 1; index += 1) {
      columns[index] = Math.max(columns[index] ?? 0, row[index]!.length);
    }
    return columns;
  }, []);

  return rows.map(
    (row) =>
      `  ${row
        .map((column, index) => (index === row.length - 1 ? column : column.padEnd(widths[index]!)))
        .join("  ")
        .trimEnd()}`,
  );
}

/** 纯文本格式化；不输出、不退出，也不读取默认值或调用值解析器 */
export function renderHelp(document: HelpDocument): string {
  const lines = [`Usage: ${document.usage}`];
  if (document.description !== undefined && document.description.length > 0) {
    lines.push("", document.description);
  }
  if (document.arguments.length > 0) {
    lines.push(
      "",
      "Arguments:",
      ...renderRows(
        document.arguments.map((argument) => [
          argumentLabel(argument),
          [argument.description ?? "", annotations(argument.required)].filter(Boolean).join(" "),
        ]),
      ),
    );
  }
  if (document.options.length > 0) {
    lines.push(
      "",
      "Options:",
      ...renderRows(
        document.options.map((option) => [
          ...optionLabels(option),
          [option.description ?? "", annotations(option.required, option.repeat)]
            .filter(Boolean)
            .join(" "),
        ]),
      ),
    );
  }
  return lines.join("\n");
}
