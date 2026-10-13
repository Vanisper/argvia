# 帮助与诊断契约

命令定义提供静态帮助信息，领域组合负责给出可修正的错误提示，Node 入口按错误类型选择简洁消息或调试堆栈。查看帮助时不读取项目配置，也不调用业务处理函数。

## 值标签

`valueName` 为字符串、数值、枚举选项及字符串位置参数指定帮助中的值标签。标签是非空白单行字符串，不含 `<`、`>` 或首尾空白；调用方只提供标签，括号由帮助生成器添加。

```ts
const options = {
  mainClass: option.string({ flag: '--main', valueName: '类全名' }),
  jvmArgs: option.string({ flag: '--jvm-arg', multiple: true, valueName: '参数' }),
}
const args = [argument.string('entry', { required: true, valueName: '文件' })]
```

选项帮助分别显示 `--main <类全名>` 和 `--jvm-arg <参数>`。位置参数在用法与参数列表中使用自定义标签，必填显示 `<文件>`，可选显示 `[文件]`；处理函数仍通过 `args.entry` 访问值。

省略标签时，选项沿用当前的类型提示，位置参数沿用字段名。标签不改变字段名、终端拼写、解析、校验、默认值或类型推导。布尔开关保持 `[=true|false]`，不接受 `valueName`。非法标签在描述器构造时抛出 `DefinitionError`，包括显式传入 `undefined`。

## 命令示例

分组与叶子定义都可以提供 `examples: readonly string[]`。每项为非空白单行字符串，表达完整的命令调用；内容按原文与声明顺序在帮助末尾的“示例：”段落中展示。

```ts
const command = defineCommand({
  name: 'tool',
  examples: ['tool --main=example.App --include-tests=false'],
  run() {},
})
```

示例只属于当前命令，不向父级或子级继承。命令挂载到另一个路径时，示例文本保持原文；示例没有插值、解析或执行语义。

定义时先复制、校验并冻结示例数组。修改调用方数组不会影响已有命令，调用方数组本身不被冻结。省略或空数组不显示示例段落；非数组、空白项、非字符串项、换行及稀疏数组在定义时抛出 `DefinitionError`。单行规则同时排除 CR、LF、Unicode 行分隔符和段分隔符。

## java-run 的帮助与领域诊断

共享选项说明值的约束、布尔等号形式和可重复性。配置继承及数组顺序由 `run`、`plan` 的命令说明表达；`init` 明确仅使用本次输入与应用默认值。共享选项的文案不能暗示 `init` 会读取旧配置。

领域错误保留配置字段名并提示修正入口。主类和模块说明对应 CLI 拼写及项目配置字段；目录、Java 和构建工具路径仅提示 CLI 拼写。数组错误报告合并后的零基下标，同时提示 CLI 选项及配置字段，不回显参数内容，也不判断该项来自哪个输入源。校验顺序及退出码沿用[命令执行契约](execution-contract.md)。

## Node 调试诊断

`runMain(command, { debug?: boolean })` 的调试开关由应用显式传入，默认关闭。`RunMainOptions` 从 `@argvia/node` 导出。

| 情况 | 关闭调试 | 开启调试 | 退出码 |
| --- | --- | --- | --- |
| 意外的 `Error` | `message` | 非空的 `stack`，缺失或为空时回退 `message` | `1` |
| 其他拒绝值 | `String(value)` | `String(value)` | `1` |
| `failed` | 命令路径与消息 | 命令路径与消息 | 指定退出码 |

只有 `debug === true` 开启详细输出。帮助、输入诊断、普通业务值和显式退出沿用现有映射。入口追加一个换行，设置 `process.exitCode` 后返回；应用可以在等待入口后继续执行。

选项不隐式读取环境变量，也不注册 CLI 开关。异常捕获只覆盖进入 `runMain` 后的执行；调用前构造命令时抛出的定义错误由调用者处理。
