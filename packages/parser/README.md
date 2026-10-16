# @argvia/parser

独立解析已分词的 `argv`，保留参数归属、出现历史和输入来源。第一轮接口保持 private，不承诺历史原型兼容。完整行为见 [解析契约](../../docs/parser-contract.md)。

## 独立解析

```ts
import { createParser, values } from "@argvia/parser";

const parser = createParser([
  { long: "name", short: "n", parse: values.string(), required: true },
  { long: "count", short: "c", parse: values.integer({ min: 1 }), defaultWhenAbsent: 1 },
  { long: "tag", short: "t", parse: values.string(), repeat: "append" },
  { long: "help", short: "h", parse: values.boolean(), defaultWhenBare: true },
]);

const result = parser.parse(["--name", "alice", "-c2", "--tag=a", "--tag=b", "file.txt"]);
// result.values.name: string，值为 "alice"
// result.values.count: number，值为 2
// result.values.tag: readonly string[]，值为 ["a", "b"]
// result.positionals: ["file.txt"]
```

长名、短名、短簇与显式绑定共用同一份定义。有裸用默认值的选项默认不消费下一参数；`createParser(options, { greedy: true })` 可启用贪婪分离值。显式绑定始终只取得一个值。

## 准备与完成

```ts
const prepared = parser.prepare(["--help"]);
// prepared.values.name: string | undefined，尚未检查 required

if (prepared.provided.help && prepared.values.help === true) {
  // 由调用者显示帮助，不必调用 complete
} else {
  const result = parser.complete(prepared);
  // result.values.name: string，缺席时 complete 抛出 MissingRequired
}
```

`prepare` 已完成值解析、默认值与重复处理，只延期必填检查。`complete` 只接受本实例的准备结果，不重新扫描或调用值回调。未知选项、缺值、非法值和重复错误仍即时报告；该流程不保证帮助覆盖输入错误。

`--name=--help` 将字符串 `--help` 绑定给 name；`-- --help` 将它保留为位置参数。parser 不解释帮助或命令的产品含义。

## 值与错误

`values` 提供 string、integer、boolean、enumeration、union、normalized 工厂，也可直接提供 `ValueParser<T>`。正常的值域拒绝返回 `{ ok: false, expected }`；程序异常直接传播。类型化默认值不重新解析，调用者应将默认对象视为只读。

缺席且无默认值的非追加选项省略 `values` 中的键。合法 `undefined` 用 `Object.hasOwn(result.values, name)` 或对应 `records` 区分。`provided` 表示显式出现，不因默认值而变为 true。

用法错误为 `ParseError`，通过 `code` 读取类别与结构化上下文。`OptionSpecError` 与 `ValueParserContractError` 分别表示定义错误和值回调返回协议错误。

结果提供归约后的 `records`、完整 `occurrences`、`positionalTokens` 与 `terminatorIndex`；原始值不会被归一化覆盖。容器和记录浅冻结，不深复制解析值或默认对象。

## 开发

在本包目录运行 `vp run check`、`vp run test`、`vp run build`；`vp run dev` 监听库构建。在仓库根目录运行 `vp run ready` 完成全部检查。该包不读取 Node 全局，测试直接使用源码，构建产物为 ESM 与类型声明。
