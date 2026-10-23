# @argvia/core

用统一定义组织命令树、读取 CLI 结构，并分阶段解析与执行输入。选项规则和值协议由 `@argvia/parser` 提供。

## 定义与执行

```ts
import { createCommand, createGroup, type CommandOption } from "@argvia/core";
import { values } from "@argvia/parser";

const common = [
  { long: "help", short: "h", parse: values.boolean(), defaultWhenBare: true },
] as const satisfies readonly CommandOption[];

const build = createCommand({
  name: "build",
  description: "构建项目",
  options: [
    ...common,
    { long: "target", parse: values.enumeration(["web", "server"]), defaultWhenAbsent: "web" },
  ],
  arguments: [{ name: "entry", parse: values.string(), required: true }],
  handler(input) {
    return { entry: input.arguments.entry, target: input.options.target };
  },
});

const app = createGroup({
  name: "tool",
  description: "项目工具",
  metadata: { version: "1.0.0" },
  options: common,
  commands: [build],
});

const result = await app.execute(["build", "src/index.ts", "--target=server"]);
// result.kind: "executed"
// result.value: { entry: string; target: "web" | "server" }
// result.path: ["tool", "build"]
```

输入不包含程序名。分组通过连续的子命令名前缀选择节点，选项和位置输入属于选中的节点。`common` 是声明复用；分组上的选项不会自动进入子命令。

`execute` 等待同步或异步 handler，返回原始业务值。它不读取进程参数、写入终端或设置退出码。

## 结构化读取

`app.definition` 是可遍历的只读定义树。它包含节点种类、名称、描述、普通元数据、选项、位置参数、解析配置和子节点描述；不包含 handler。

```ts
for (const child of app.definition.commands) {
  const names = child.options.map((option) => `--${option.long}`);
  // 调用方可以生成帮助、文档或其他展示内容
  void names;
}
```

读取定义不执行值回调。定义中的默认值与解析器可能包含对象和函数，因此这个模型不承诺 JSON 序列化。容器与回调引用固定，对象值本身保持调用方提供的引用。

## 分阶段处理

帮助只是上例声明的普通选项。调用方可以在完成必填检查之前消费它：

```ts
import type { NodeDescription } from "@argvia/core";

function summary(definition: NodeDescription, path: readonly string[]): string {
  const lines = [path.join(" "), definition.description ?? ""];
  if (definition.kind === "group") {
    lines.push(...definition.commands.map((child) => `${child.name}  ${child.description ?? ""}`));
  }
  lines.push(
    ...definition.options.map((option) => `--${option.long}  ${option.description ?? ""}`),
  );
  return lines.filter(Boolean).join("\n");
}

async function run(argv: readonly string[]) {
  const prepared = app.prepare(argv);
  if (prepared.options.help === true) {
    return { text: summary(prepared.definition, prepared.path) };
  }

  const parsed = prepared.complete();
  if (parsed.kind === "group") {
    return {
      text: `请选择命令：${parsed.definition.commands.map((child) => child.name).join(", ")}`,
    };
  }
  return parsed.execute();
}

await run(["build", "--help"]); // entry 未提供也可以展示定义
```

`prepare` 已完成选项绑定、值转换、默认值和重复处理；输入错误仍会即时报告。`complete` 再检查选项必填、位置数量并解码位置值；重复完成同一准备结果不会重复解析，失败也会保留。完成后的命令可执行，每次执行独立调用 handler。

`node.parse(argv)` 是准备并完成的便捷入口。保留完成结果再调用其 `execute()` 可以继续同一次解析；再次调用 `node.execute(argv)` 则会重新解析。

## 来源与错误

`input.options` 与 `input.arguments` 提供值，`input.source` 保留显式提供状态、原文、归一化值和出现记录。所有下标相对本次入口收到的完整 argv，包括嵌套路由后的选项、位置参数和输入错误。

选项输入错误为 parser 的 `ParseError`，位置错误为 `ArgumentError`，路由错误为 `RouteError`。定义错误与程序异常分别处理，handler 和值回调抛出的异常原样传播。

完整规则见 [命令组合与调用契约](docs/command-contract.md)，公共模型见 [接口说明](../../docs/interfaces.md)。

## 可运行示例

[Workspace 应用示例](../../playground/workspace/README.md) 作为独立工作区包，通过公开包名使用 core 与 parser，组合 `tool → assets → build/inspect`。应用工厂注入业务服务，普通选项与定义描述实现帮助及版本响应，Node 入口负责参数、输出和退出状态。

在仓库根目录运行：

```sh
vp run playground --help
vp run playground assets build --help
vp run playground assets build app.ts --mode=safe --tag=ci
vp run playground assets inspect app.ts
```

示例服务输出 JSON 执行计划，不实际编译或检查文件；应用包内的测试覆盖输入解析、控制逻辑与服务调用。将服务替换为实际业务即可复用同一命令定义。

## 开发

在本包运行 `vp run check`、`vp run test`、`vp run build`；仓库根目录使用 `vp run ready`。源码保持宿主无关，包目前为 private。
