# @argvia/core

组织一个已经选定的命令：复用 parser 解释选项，分配命名位置参数，响应帮助与版本，并调用类型化 handler。第二轮暂不包含命令树、路由或进程适配，接口保持 private。

## 定义与执行

```ts
import { createCommand, renderHelp } from "@argvia/core";
import { values } from "@argvia/parser";

const command = createCommand({
  name: "serve",
  description: "启动服务",
  version: "0.1.0",
  options: [
    {
      long: "port",
      short: "p",
      parse: values.integer({ min: 1, max: 65535 }),
      defaultWhenAbsent: 8080,
      description: "监听端口",
      valueName: "port",
    },
  ],
  arguments: [
    { name: "entry", parse: values.string(), required: true, description: "应用入口" },
    { name: "args", parse: values.string(), variadic: true, description: "应用参数" },
  ],
  handler({ options, arguments: args }) {
    // 业务依赖可通过闭包注入；返回值由调用者使用
    return { port: options.port, entry: args.entry, args: args.args };
  },
});

const result = await command.execute(["--port", "9000", "app.ts", "--", "--debug"]);
if (result.kind === "executed") {
  // result.value: { port: number; entry: string; args: readonly string[] }
}

const help = command.parse(["--help"]);
if (help.kind === "help") {
  const text = renderHelp(help.document);
  // 调用者决定如何显示 text
}
```

输入不包含程序名；core 不读取 `process.argv`，不输出、不退出进程。`execute` 等待同步或异步 handler，数字结果也只作为普通业务值保留。

`parse` 返回 `input`、`help` 或 `version` 请求，不调用 handler。`execute` 内部只解析一次；分别调用 parse 与 execute 是两次独立操作，需要检查完整输入时直接使用 parse 的结果。

## 内建请求与位置参数

默认注册 `--help/-h`，`help: false` 关闭；存在版本字符串时注册 `--version/-V`。名称冲突会被拒绝。`--help=false` 不触发帮助，两种请求同时为 true 时帮助优先。

内建请求依据真实绑定事实判定。帮助可以跳过选项必填、位置数量与位置值解析；未知选项、非法选项值等错误仍即时报告。终止符后的 `--help` 是位置参数，`--name=--help` 是 name 的值。

位置参数必须按声明顺序使用，必填在可选之前，唯一的 variadic 只能在末尾。不会根据值是否能解析而重新分配，也不会从选项已消费的输入中预留位置值。

`input.options` 与 `input.arguments` 提供便利值，`input.source` 保留原始值、归一化值、出现与位置记录。业务值和来源都不包含内部 help/version 字段；可选字段缺席省略，变长字段缺席为空数组。

## 契约与开发

详细规则见 [单命令契约](docs/command-contract.md)，底层算法见 [parser 文档](../parser/docs/README.md)。运行 `vp run check`、`vp run test`、`vp run build`；仓库根目录用 `vp run ready` 验证全部工程。普通源码入口保持宿主无关。
