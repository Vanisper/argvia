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

布尔开关不接受取值，显式输入得到 `true`。`option.boolean()` 省略时得到 `undefined`；`option.boolean({ default: false })` 省略时得到 `false`。当前不支持布尔否定或显式传入 `false`。

## 命令结构

叶子命令提供 `run`，可以声明 `args` 和 `options`。分组命令提供 `commands`，不能同时声明处理函数或参数；子命令名由 `commands` 的对象键决定。根 `name` 用于帮助路径，省略时为 `argvia`。

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

## 输入行为

- 长选项支持 `--port 3000` 和 `--port=3000`，可出现在位置参数前后
- 数值接受有限的十进制与指数形式，拒绝空值、空白、十六进制、后缀与非有限值
- 枚举输入精确匹配集合，字符串允许空字符串
- 未知选项、重复选项、多余位置参数返回结构化输入错误
- `--` 结束选项识别，后续 token 按普通位置参数匹配
- 命令路径从 argv 开头选择；停在分组时显示该组帮助
- `-h` 和 `--help` 在合法命令路径上优先于输入校验，跳过必填检查并且不调用处理函数；未知子命令仍返回错误
- 字符串选项消费紧接的取值，包括 `--help`；`--token --help` 与 `--token=--help` 都将标记作为字符串值

当前不提供短选项别名、重复值集合、可变长位置参数、独立透传上下文或默认子命令。

## 执行结果与进程入口

`run(command, { argv })` 接收已去掉运行时与脚本路径的参数，等待同步或异步处理函数完成，不读取进程参数、输出文本或设置退出码。

| `kind` | 内容 |
| --- | --- |
| `executed` | `value: unknown` 保存业务返回值 |
| `help` | `text: string` 保存帮助 |
| `invalid-input` | `diagnostic` 保存 `code`、`message` 和包含根程序名的 `commandPath` |

处理函数的异常或异步拒绝原样传播，不转成输入错误。业务返回值暂不进行泛型推导。

`runMain(command)` 从 `@argvia/node` 导入，接收 `@argvia/core` 创建的命令，读取 `process.argv.slice(2)` 并设置 `process.exitCode`：

| 结果 | 输出 | 退出码 |
| --- | --- | --- |
| 成功 | 不自动打印返回值 | `0` |
| 帮助 | stdout | `0` |
| 输入错误 | stderr，并附帮助提示 | `2` |
| 业务异常 | stderr | `1` |

普通数值返回值不会自动当作退出码。业务退出结果、取消信号与 Bun 入口兼容性仍待设计和验证。
