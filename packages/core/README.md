# @argvia/core

定义命令树，读取节点描述，分阶段解析和执行输入。选项解析与值协议依赖 `@argvia/parser`，规则见其[解析契约](../parser/docs/contract.md)。

## 定义节点

`createCommand` 创建带 handler 的叶子命令，`createGroup` 组合已创建的节点：

```ts
import { createCommand, createGroup } from "@argvia/core";
import { values } from "@argvia/parser";

const greet = createCommand({
  name: "greet",
  description: "生成问候语",
  options: [{ long: "upper", parse: values.boolean(), defaultWhenBare: true }],
  arguments: [{ name: "name", parse: values.string(), required: true }],
  handler(input) {
    const message = `Hello, ${input.arguments.name}`;
    return input.options.upper ? message.toUpperCase() : message;
  },
});

const tool = createGroup({ name: "tool", commands: [greet] });
const result = await tool.execute(["greet", "Ada", "--upper"]);
// result.value === "HELLO, ADA"
// result.path: ["tool", "greet"]
```

输入不含程序名。路由只消费连续的子命令名前缀，余下输入属于选中节点。每个节点使用自己的选项声明，分组选项不向子节点继承。

`execute` 等待 handler 并将其返回值保存在 `result.value`，不读取进程参数或产生终端输出。

## 读取定义

每个节点的 `definition` 是只读描述。分组的 `commands` 保存子节点描述，可以递归遍历：

```ts
const commands = tool.definition.commands.map((node) => ({
  name: node.name,
  description: node.description,
  options: node.options.map((option) => option.long),
}));
```

描述包含声明的字段规则与普通元数据，不包含 handler。读取描述不会执行值回调；其中可以保留函数及对象值，不承诺 JSON 序列化。

## 分阶段调用

```ts
const prepared = tool.prepare(["greet", "Ada", "--upper"]);
// prepared 提供选中节点、路径、选项值和原始来源

const parsed = prepared.complete();
if (parsed.kind === "command") {
  const result = await parsed.execute();
  // result.value 的类型由 handler 推导
}
```

`prepare` 选择节点并解析选项，`complete` 检查选项必填、位置数量并解析位置值。完成结果通过 `input.options`、`input.arguments` 提供值，通过 `input.source` 保留来源。分组可以准备和完成，但完成结果没有 `execute()`。

同一准备结果缓存完成阶段的成功或失败；每次调用完成命令的 `execute()` 都独立执行 handler。`node.parse(argv)` 等价于准备后完成，`node.execute(argv)` 再继续执行；便捷入口每次接收 argv 都重新解析。

完整字段、路由、类型、坐标和错误规则见[命令组合与调用契约](docs/command-contract.md)。
