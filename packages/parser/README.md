# @argvia/parser

将已分词的 `argv` 解析为选项值和位置参数，保留参数归属、出现记录和输入来源。

## 独立解析

```ts
import { createParser, values } from "@argvia/parser";

const parser = createParser([
  { long: "name", short: "n", parse: values.string(), required: true },
  { long: "count", short: "c", parse: values.integer({ min: 1 }), defaultWhenAbsent: 1 },
  { long: "tag", short: "t", parse: values.string(), repeat: "append" },
  { long: "verbose", short: "v", parse: values.boolean(), defaultWhenBare: true },
]);

const result = parser.parse(["--name", "alice", "-c2", "--tag=a", "--tag=b", "file.txt"]);
// result.values.name: string，值为 "alice"
// result.values.count: number，值为 2
// result.values.tag: readonly string[]，值为 ["a", "b"]
// result.positionals: ["file.txt"]
```

长名、短名、短簇与显式绑定共用同一份定义。默认情况下，带有 `defaultWhenBare` 的选项裸用时采用该默认值；`createParser(options, { greedy: true })` 让它尝试消费下一个参数。显式绑定每次取得一个值。

## 准备与完成

```ts
const prepared = parser.prepare(["--name", "alice"]);
// prepared.values.name: string | undefined，尚未检查 required

const completed = parser.complete(prepared);
// completed.values.name: string，已经通过 required 检查
```

`prepare` 完成绑定、值解析、默认值与重复处理，返回可供检查的准备结果；未知选项、缺值、非法值和重复错误在这一阶段报告。`complete` 接受本实例的准备结果，检查必填选项并收窄结果类型，缺席时抛出 `MissingRequired`。完成阶段复用已有值与来源记录，成功结果会被缓存。

## 值与错误

`values` 提供 `string`、`integer`、`boolean`、`enumeration`、`union`、`normalized` 工厂，也可直接提供 `ValueParser<T>`。值域拒绝返回 `{ ok: false, expected }`；回调抛出的异常原样传播。默认值已经属于目标值域，调用者应将默认对象视为只读。

`snapshotValueParser` 用于固定回调引用，`decodeValue(parser, raw)` 按同一协议执行归一化与解析，返回 `normalized` 和解析结果。

缺席且无默认值的非追加选项省略 `values` 中的键。合法 `undefined` 用 `Object.hasOwn(result.values, name)` 或对应 `records` 区分。`provided` 专门记录选项是否显式出现。

用法错误为 `ParseError`，通过 `code` 读取类别与结构化上下文。`OptionSpecError` 与 `ValueParserContractError` 分别表示定义错误和值回调返回协议错误。

结果提供归约后的 `records`、完整 `occurrences`、`positionalTokens` 与 `terminatorIndex`，同时保留原始值和归一化值。容器和记录浅冻结，解析值与默认对象保持原引用。

## 文档

- [解析契约](docs/contract.md)：定义、消费规则、来源、分阶段调用与错误。
- [解析策略与算法](docs/evaluation.md)：执行结构、不变量、复杂度与验证资产。
- [原始算法规范](docs/algorithm.md)：归档研究资料。

## 开发

在本包目录运行 `vp run check`、`vp run test`、`vp run build`；`vp run dev` 监听库构建。测试直接使用源码，构建产物为 ESM 与类型声明。
