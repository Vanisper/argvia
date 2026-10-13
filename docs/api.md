# 命令定义 API

`@argvia/core` 与 `@argvia/node` 均为 ESM 包，并提供类型声明，目前保持 `private`。`@argvia/core` 导出命令定义、显式 argv 执行与公开类型；`@argvia/node` 导出 `runMain`。

## 参数与选项

`argument.string(name, config?)` 定义位置参数，顺序由 `args` 数组决定。可选参数后不能出现必填参数，名称不能重复。

| 构造器 | 无默认值的可选类型 | 必填或默认值类型 |
| --- | --- | --- |
| `argument.string` | `string \| undefined` | `required: true` 得到 `string`，不支持默认值 |
| `option.string` | `string \| undefined` | `string` |
| `option.number` | `number \| undefined` | `number` |
| `option.enum` | 候选字符串联合与 `undefined` | 候选字符串联合 |
| `option.boolean` | `boolean \| undefined` | 提供布尔默认值得到 `boolean`，不支持必填 |

`description` 用于帮助说明。`required: true` 要求显式输入，与 `default` 互斥。默认值在构造描述器时校验；数值默认值不会收窄成字面量类型，枚举默认值必须属于集合，并保留整个联合类型。

选项支持 `flag` 指定唯一长拼写，例如 `mainClass: option.string({ flag: '--main' })` 接受 `--main=value`，结果仍为 `options.mainClass`。省略 `flag` 时使用 `--` 加对象键；显式拼写替换默认拼写，不添加别名。`flag` 不适用于位置参数。

取值选项与字符串位置参数支持 `valueName` 指定静态帮助标签，例如 `option.string({ flag: '--main', valueName: '类全名' })` 显示 `--main <类全名>`。位置参数用该标签展示用法及参数列表，处理函数仍按原字段名取值。标签必须是非空白单行字符串，不含尖括号或首尾空白；非法值在构造时抛出 `DefinitionError`。布尔开关不接受标签，其他输入类型、校验与默认值均保持原规则。可用 `ValueNameConfig` 标注共享标签配置，完整规则见[帮助与诊断契约](help-contract.md)。

`option.string({ multiple: true })` 得到 `string[]`：每次出现消费一个字符串，按该字段输入顺序收集，省略时得到独立的空数组。支持 `flag`、`description` 与 `valueName`，不接受 `required`、`default` 或显式 `undefined`；其他值类型与位置参数不支持重复集合。单值选项仍拒绝重复输入。集合保留普通字符串的空值、空白和取值规则，不拆分逗号或空白。

布尔选项的裸开关得到 `true`，也可以通过等号显式传入精确的小写 `true` 或 `false`，例如 `--include-tests=false`。布尔选项不消费下一项：`--include-tests false` 中的 `false` 仍作为位置参数处理。其他大小写、数值缩写、空值及带空白的值均被拒绝；裸开关与等号形式的任意重复组合都返回重复选项错误。

`option.boolean()` 省略时得到 `undefined`；提供默认值时省略输入采用该值。显式 `false` 可以通过 `??` 覆盖项目配置中的 `true`。帮助显示 `[=true|false]`；`--no-include-tests` 等拼写需要单独声明，不会自动生成。

## 命令结构

叶子命令提供 `run`，可以声明 `args` 和 `options`。分组命令提供 `commands`，不能同时声明处理函数或参数；子命令名由 `commands` 的对象键决定。根 `name` 用于帮助路径，省略时为 `argvia`。

分组与叶子均支持 `examples: readonly string[]`，在当前命令的帮助末尾按顺序展示完整调用示例。每项必须是非空白单行字符串，数组在定义时复制并冻结；空数组不显示示例段落，非法配置抛出 `DefinitionError`。示例不继承、不执行，也不随挂载路径改写，完整规则见[帮助与诊断契约](help-contract.md)。

```ts
import { defineCommand, option, run } from '@argvia/core'

const sharedOptions = {
  mode: option.enum(['dev', 'prod']),
  verbose: option.boolean(),
}

const inspect = defineCommand({
  options: sharedOptions,
  run({ options }) {
    return options
  },
})

const app = defineCommand({ name: 'tool', commands: { inspect } })
const result = await run(app, { argv: ['inspect', '--mode=prod'] })
```

字段键与子命令名以字母开头，只包含字母、数字、下划线和连字符。显式 `flag` 由 `--` 加同样规则的名称组成。同一命令的有效长拼写不能重复，`--help` 保留给内置帮助；结果字段键可以通过映射与终端名称分离。组内选项不向子命令继承，共享选项通过对象组合复用。

定义不合法时同步抛出 `DefinitionError`。显式 `args: undefined` 或 `options: undefined` 也会被拒绝，请省略字段或提供有效定义。

叶子命令可以声明 `passthrough: true`，处理函数额外获得 `passthrough: readonly string[]`。首个独立 `--` 后的 token 原样进入该数组，包括空字符串、空白、第二个 `--`、帮助标记和选项拼写；分隔符之前的位置参数与选项仍正常校验。没有分隔符时得到独立的空数组。

省略 `passthrough` 或显式设为 `false` 时，上下文没有该字段。分组不接受透传开关；配置需使用确定的 `true` 或 `false`，动态布尔值应在调用前缩窄，显式 `undefined` 会被拒绝。

分组可以通过 `defaultCommand` 指向 `commands` 的一个现有键。无输入或首项以 `-` 开头时选择默认命令，原样传递剩余 argv；首项 `-h`、`--help` 显示当前分组帮助。已注册的首个命令词优先显式选择，未知裸词返回错误。默认目标可为另一个分组，各层采用相同规则；诊断和叶子帮助包含完整命令路径。

```ts
const app = defineCommand({
  name: 'tool',
  commands: { run: launchCommand, plan: planCommand },
  defaultCommand: 'run',
})
```

未配置默认命令的分组无输入时显示帮助，其他选项及 `--` 返回输入错误，显式命令路径必须写在分隔符前。选中叶子后不再搜索命令词，例如 `--cwd plan` 中的 `plan` 是字符串值。默认叶子的首个裸位置参数可以用显式命令消歧；`--` 是否接收普通位置参数取决于该叶子是否开启透传。

## 输入行为

- 长选项支持 `--port 3000` 和 `--port=3000`，可出现在位置参数前后
- 数值接受有限的十进制与指数形式，拒绝空值、空白、十六进制、后缀与非有限值
- 枚举输入精确匹配集合，字符串允许空字符串
- 未知选项、重复单值选项、多余位置参数返回结构化输入错误
- `--` 结束选项识别，开启透传时后续 token 进入独立数组，否则按普通位置参数匹配
- 命令路径从 argv 开头选择；分组的缺省执行由 `defaultCommand` 决定
- `-h` 和 `--help` 在合法命令路径上优先于输入校验，跳过必填检查并且不调用处理函数；未知子命令仍返回错误
- 字符串选项消费紧接的取值，包括 `--help`；`--token --help` 与 `--token=--help` 都将标记作为字符串值

当前不提供短选项别名、可变长位置参数或选项之后的命令词识别。完整组合规则见[命令输入契约](input-contract.md)。

## 执行结果与进程入口

`run(command, { argv })` 接收已去掉运行时与脚本路径的参数，等待同步或异步处理函数完成，不读取进程参数、输出文本或设置退出码。

| `kind` | 内容 |
| --- | --- |
| `executed` | `value: unknown` 保存业务返回值 |
| `exit` | `exitCode` 保存指定退出码，`commandPath` 保存实际命令路径 |
| `failed` | `message`、`exitCode` 和实际 `commandPath` 保存预期业务失败 |
| `help` | `text: string` 保存帮助 |
| `invalid-input` | `diagnostic` 保存 `code`、`message` 和包含根程序名的 `commandPath` |

`exit(code)` 从 `@argvia/core` 导入，返回冻结且具有身份标记的 `ExitResult`。处理函数显式返回它时，执行器产生 `exit` 结果；同步返回与异步返回相同。退出码必须是 `0..255` 的整数，非法值抛出 `RangeError`。

普通数字、同形对象、对象展开和序列化副本仍保留为业务数据。`exit()` 不终止进程，也不抛出异常；抛出该结果不属于退出协议。命令与退出结果应来自同一 core 实例。

`CommandError(message, { exitCode? })` 从 core 导入，表达可直接展示给用户的预期命令失败。消息必须包含非空白内容，退出码默认 `1`，允许 `1..255` 的整数；空白消息抛出 `TypeError`，非法退出码抛出 `RangeError`。可用 `CommandErrorOptions` 标注其配置。

处理函数抛出或异步拒绝 `CommandError` 时，`run()` 返回独立的 `failed` 结果，不转换成参数解析错误。返回该错误对象仍属于普通业务数据；同名或同形对象不会被识别。其他异常和拒绝值原样传播。业务返回值暂不进行泛型推导。完整规则见[命令执行契约](execution-contract.md)。

`runMain(command)` 从 `@argvia/node` 导入，接收 `@argvia/core` 创建的命令，读取 `process.argv.slice(2)` 并设置 `process.exitCode`：

| 结果 | 输出 | 退出码 |
| --- | --- | --- |
| 成功 | 不自动打印返回值 | `0` |
| 帮助 | stdout | `0` |
| 输入错误 | stderr，并附帮助提示 | `2` |
| 显式退出 | 无附加输出 | 指定退出码 |
| 预期业务失败 | stderr 输出 `命令路径: 消息`，不附帮助 | 指定退出码 |
| 意外异常 | stderr | `1` |

普通数值返回值不会自动当作退出码。适配器设置 `process.exitCode`，不调用 `process.exit()`；处理函数自行修改进程状态不替代显式退出协议。取消状态可通过退出码传递，信号监听与子进程管理由应用负责。Bun 入口兼容性仍待验证。
