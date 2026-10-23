# 接口模型

Argvia 提供独立选项解析与命令组合两个层次。包内契约定义运行行为，本文说明公共模型及其关系。

## 入口

| 入口                             | 结果与职责                                          |
| -------------------------------- | --------------------------------------------------- |
| `createParser(options, config?)` | 选项解析器，提供 `prepare/complete/parse`           |
| `values.*`、`ValueParser<T>`     | 同步值解析与归一化协议                              |
| `createCommand(definition)`      | 具有 handler 的叶子节点                             |
| `createGroup(definition)`        | 由已创建节点组成的分组                              |
| `node.definition`                | 可遍历的只读定义描述                                |
| `node.prepare(argv)`             | 路由并准备选中节点的选项输入                        |
| `prepared.complete()`            | 完成必填与位置参数校验，缓存成功或失败              |
| `node.parse(argv)`               | 等价于 `node.prepare(argv).complete()`              |
| `parsed.execute()`               | 已完成命令的执行入口，分组没有此方法                |
| `node.execute(argv)`             | 解析、完成并执行命令；选中分组时报 `MissingCommand` |

源码导出见 [parser/index.ts](../packages/parser/src/index.ts) 与 [core/index.ts](../packages/core/src/index.ts)。

## 定义与描述

叶子和分组共同接受 `name`、`description`、`metadata`、`options`、`parser`。叶子另有有序的 `arguments` 和必需的 `handler`；分组另有 `commands`，不声明 handler 或位置参数。

创建后公开的 `definition` 包含以下字段：

| 字段                  | 内容                                 |
| --------------------- | ------------------------------------ |
| `kind`                | `command` 或 `group`                 |
| `name`、`description` | 节点名称与可选说明                   |
| `metadata`            | 可选的普通只读元数据容器，由应用解释 |
| `options`             | 本节点的选项规格及展示元数据快照     |
| `parser`              | 本节点实际使用的解析配置             |
| `arguments`           | 叶子的有序位置参数规格               |
| `commands`            | 分组的子节点描述数组，可继续遍历     |

描述不包含 handler；定义中明确声明的值解析回调和默认值可以读取。元数据可以包含版本、示例或应用自定义信息，core 不赋予其特殊执行含义。结构化读取不会执行回调或生成文本。

选项采用 parser 的 `long/short/parse/required/repeat/defaultWhenBare/defaultWhenAbsent`，core 增加 `description/valueName`。位置参数采用 `name/parse/required/variadic/description`。业务输入的选项键就是 `long`，位置键就是 `name`；业务重命名由应用完成。

## 调用阶段

`prepare` 返回准备结果，包含：

- `kind`、`name`、`definition`：选中节点及其描述。
- `path`：从调用入口到选中节点的名称序列，包含入口名称。
- `options`：已经绑定、转换和归约的选项值，必填项仍可能缺席。
- `source`：选项解析的完整来源，包括未分配的位置元素。
- `complete()`：完成本次输入，重复调用返回同一结果或抛出同一失败。

完成结果保留节点、名称、定义和路径，并通过 `input` 提供选项、命名位置参数及来源。命令完成结果还提供 `execute()`；它每次调用一次 handler，异步返回 `{ kind: "executed", name, definition, path, input, value }`，`value` 的类型为 `Awaited<R>`。

分组完成结果包含本地选项和空的位置参数模型。它可供应用检查或响应；没有可以执行的 handler。`node.execute(argv)` 会先完成输入校验，再检查是否选中可执行命令。

同一个准备结果只完成一次，但两次独立的 `node.prepare/parse/execute(argv)` 是两次解析。需要检查并继续同一次输入时，应保留阶段对象，而不是重新传入 argv。

## 类型与复用

叶子 handler 根据字段声明推导完整输入；节点名称的字面量类型可以帮助收窄分组返回的联合。准备阶段不会承诺必填字段已经存在，动态数组与动态名称也不会虚构确定字段。

共享声明可使用元组保留名称、默认值存在性和重复策略：

```ts
import { createCommand, type CommandOption } from "@argvia/core";
import { values } from "@argvia/parser";

const shared = [
  { long: "verbose", parse: values.boolean(), defaultWhenBare: true },
] as const satisfies readonly CommandOption[];

const build = createCommand({
  name: "build",
  options: [...shared, { long: "target", parse: values.string(), required: true }],
  handler(input) {
    return { target: input.options.target, verbose: input.options.verbose === true };
  },
});
```

共享的是声明，每个节点仍有独立的作用域和解析状态。分组上的同名选项不会自动进入子命令。

## 值与错误

值协议使用 `success(value)` 或 `failure(expected, reason?)` 表达值域接受或拒绝。`values` 提供 string、integer、boolean、enumeration、union、normalized。`decodeValue` 与 `snapshotValueParser` 供其他字段模型复用同一协议。

| 错误                       | 含义                                       |
| -------------------------- | ------------------------------------------ |
| `ParseError`               | 选项输入未知、缺值、非法值、重复或必填缺席 |
| `ArgumentError`            | 位置参数缺席、超额或值域拒绝               |
| `RouteError`               | 未知子命令，或试图执行尚未选定命令的分组   |
| `OptionSpecError`          | 选项规格无效                               |
| `CommandSpecError`         | 命令、分组、字段元数据或组合无效           |
| `ValueParserContractError` | 值回调不满足返回协议                       |

输入错误通过 `code` 和结构化详情区分；消息供人阅读。值回调和 handler 自己抛出的异常保持原样，普通业务返回值不被解释为退出码。

详细错误顺序、路由规则与坐标见[命令组合与调用契约](../packages/core/docs/command-contract.md)。
