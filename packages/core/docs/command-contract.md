# 命令组合与调用契约

core 接收不含程序名的 `readonly string[]`，从命令树选择节点，完成输入约束并调用 handler。选项规则与值协议由依赖 `@argvia/parser` 的[解析契约](../../parser/docs/contract.md)定义。

## 节点与字段

`createCommand(definition)` 创建叶子命令，`createGroup(definition)` 创建分组。两者返回的节点均有 `definition`、`prepare(argv)`、`parse(argv)` 和 `execute(argv)`。

| 定义字段         | 约束                                                           |
| ---------------- | -------------------------------------------------------------- |
| `name`           | 必填名称，作为子节点时参与路由                                 |
| `description`    | 可选说明字符串                                                 |
| `metadata`       | 可选的 `Readonly<Record<string, unknown>>`，不附带执行语义     |
| `options`        | 本节点的 `readonly CommandOption[]`，默认空数组                |
| `parser`         | 本节点的解析配置，默认 `{ greedy: false }`                     |
| `arguments`      | 仅叶子接受，有序的 `readonly ArgumentSpec[]`，默认空数组       |
| `handler(input)` | 叶子必填，接收完整 `CommandInput`，返回同步值或 Promise        |
| `commands`       | 分组必填，数组成员必须由 `createCommand` 或 `createGroup` 创建 |

叶子不接受 `commands`；分组不接受 `arguments` 或 `handler`。同一分组内子节点名称唯一，同一节点可被多个分组复用。

`CommandOption<T>` 沿用选项规格，增加可选的 `description/valueName`。`ArgumentSpec<T>` 包含必填的 `name/parse`、可选的 `description/required/variadic`；required 与 variadic 默认 false。选项值键为 `long`，位置值键为 `name`。

节点名、字段名和值标签必须非空，不含空白、控制字符或尖括号、方括号；节点名不能以 `-` 开头。长短选项名称先按 parser 的名称规则检查，再应用上述展示约束，两类问题都在节点创建阶段报告。共享字段采用声明复用，每个节点独立保存规格与回调快照；分组选项只作用于该分组。

## 定义描述

`node.definition` 是冻结的 `CommandDescription` 或 `GroupDescription`：

- 共同字段为 `kind`、`name`、可选 `description/metadata`、`options` 和 `parser`。
- 叶子 kind 为 command，另有 `arguments`；分组 kind 为 group，另有递归的 `commands` 描述数组。
- 规格只保存支持的字段及值回调快照，parser 明示实际配置；handler 不进入描述。

读取描述不执行回调，也不反推值域。规格和元数据容器被复制并冻结，默认对象、元数据中的对象和解析值保留原引用，不深复制或深冻结。描述是程序内模型，不承诺 JSON 序列化。

路径属于调用结果，不属于定义。`path` 从本次入口节点的名称开始，包含沿途分组和最终选中节点的名称。

## 路由

当前节点为分组时，按顺序判断下一个元素：

1. 输入结束，选中当前分组。
2. 元素以 `-` 开头，包括 `-` 和 `--`，选中当前分组，余下输入交其解析器。
3. 元素匹配子节点名称，消费该名称并进入子节点。
4. 其他元素产生 `UnknownCommand`。

到达叶子立即停止路由，余下输入全部属于该叶子。路由不在选项之间继续寻找子命令，也不根据位置值或解析结果重新选择节点；停在分组时不自动选择子命令。

以根 tool、分组 project 和叶子 build 为例：

| argv                               | 结果                                                      |
| ---------------------------------- | --------------------------------------------------------- |
| `[]`                               | 选中 tool                                                 |
| `["project"]`                      | 选中 project                                              |
| `["project", "build", "src"]`      | 选中 build，src 为其输入                                  |
| `["project", "unknown"]`           | project 下的 `UnknownCommand`，下标为 1                   |
| `["--verbose", "project"]`         | 停在 tool；verbose 必须在 tool 声明，project 不再参与路由 |
| `["--", "project"]`                | 停在 tool；project 是位置元素，完成时报告超额位置参数     |
| `["project", "build", "--", "-x"]` | 选中 build，终止符后的 -x 是位置元素                      |

## 调用阶段

`node.prepare(argv)` 复制输入、完成路由并准备选中节点的选项。输入必须为字符串数组；准备阶段发生的路由、选项或回调错误立即抛出。

| 准备结果字段           | 内容                                                   |
| ---------------------- | ------------------------------------------------------ |
| `kind/name/definition` | 选中节点的种类、名称和描述                             |
| `path`                 | 本次调用路径                                           |
| `options`              | `PreparedValues<S>`，必填选项仍可能缺席                |
| `source`               | `PreparedArguments<S>`，包含选项来源和未分配的位置元素 |
| `complete()`           | 完成本次输入，返回命令或分组完成结果                   |

`complete()` 依次完成选项必填检查、按声明顺序检查缺少的位置参数、检查超额位置参数，再分配并解析位置值。同一准备结果缓存成功或失败，重复调用返回同一结果或抛出同一失败，不重复解析。

完成结果包含 `kind/name/definition/path/input`。其中 input 为：

| 字段               | 内容                                 |
| ------------------ | ------------------------------------ |
| `options`          | 完整选项值                           |
| `arguments`        | 命名位置值                           |
| `source.options`   | 完整选项解析来源                     |
| `source.arguments` | 位置参数的 `values/provided/records` |

分组按空位置声明完成校验，结果中只有本地选项及空位置模型；准备时留下的位置元素不会被忽略。仅命令完成结果提供 `execute()`，每次调用一次 handler 并等待其返回，不重新解析，也不缓存执行结果或异常。

执行异步返回 `{ kind: "executed", name, definition, path, input, value }`，value 的类型为 `Awaited<R>`。返回值保留业务含义；core 不输出或设置退出状态。

`node.parse(argv)` 等价于 `node.prepare(argv).complete()`。`node.execute(argv)` 先完成输入再执行；若完成结果为分组，产生 `MissingCommand`，输入错误优先报告。独立的 prepare/parse/execute 调用各自解析，继续同一次输入需保留阶段对象。

## 位置参数与来源

位置名称必须唯一，必填参数位于可选参数之前；最多一个 variadic 参数且必须位于末尾。必填 variadic 至少取得一个值，可选 variadic 缺席时得到本次调用独立的空数组。普通可选参数缺席时省略值键，保留 `provided=false` 与空记录。位置规格不接受默认值。

位置参数按声明顺序消费已确定的 `positionalTokens`，不会根据值域重新分配或从选项输入中预留值。每个被分配的元素只执行一次归一化与解析，记录包含 `value/raw/normalized/index`。合法 undefined 仍有自有值键、记录和 `provided=true`。

名称容器使用无原型对象，`__proto__`、`constructor` 按普通键处理。`input.options/arguments` 分别与对应来源中的 values 共用引用；容器和记录浅冻结，值对象保持原引用。

## 坐标

路由消费不改变外部坐标。选项出现下标、显式值下标、位置元素下标、终止符下标，以及输入错误的 `index/nextIndex`，均相对本次入口收到的完整 argv。默认值下标保持 null，短簇 `clusterPosition` 保持簇内码点位置，记录与出现历史保留同一贡献的关联。

直接调用叶子时，坐标相对传给叶子的数组；从根分组调用时，相对传给根的数组。同一节点可以在不同调用中具有不同路径和坐标，共用只读定义。

## 类型与声明复用

handler 的输入从字段声明推导，返回类型保留到执行结果。准备态保留必填选项缺席的可能，完成后才取得完整输入。节点名称字面量保留在阶段结果中，可结合 kind/name 收窄分组返回的联合；动态数组和名称保持保守推导。

共享声明可用元组保留字段名称与规格字面量，再放入各节点的 options：

```ts
import type { CommandOption } from "@argvia/core";
import { values } from "@argvia/parser";

const shared = [
  { long: "verbose", parse: values.boolean(), defaultWhenBare: true },
] as const satisfies readonly CommandOption[];
```

`PreparedOf<C>`、`ParsedOf<C>`、`ExecutedOf<C>` 分别提取节点各阶段的结果类型。完整导出见 [index.ts](../src/index.ts)，字段类型见 [types.ts](../src/types.ts)。

## 错误

| 错误               | 类别与详情                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `CommandSpecError` | 节点、组合或字段声明无效，包括选项规格；field 指向适用的定义字段                                                      |
| `RouteError`       | `UnknownCommand` 或 `MissingCommand`；包含 path、可选子命令 commands 及适用的 token/index                             |
| `ArgumentError`    | `MissingArgument`、`UnexpectedArgument` 或 `InvalidArgument`；包含适用的 argument、token、index、raw、expected/reason |

路由和位置错误以 code 区分类别，详情同时保存在冻结的 details 中。选项相关的错误按发生阶段分开：

- 规格错误在节点创建时由 core 检查，统一报告为 `CommandSpecError`，`field` 指向 `options[i]` 及其子字段
- 用法错误在运行阶段产生，沿用 parser 的 `ParseError`，坐标按上述规则映射

值回调和 handler 自己抛出的异常原样传播，包括它们主动抛出的输入错误对象；core 只映射自己调用解析器所产生的输入诊断。
