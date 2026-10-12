# 第一轮可运行接口实验

状态：候选验证。实验延续 [设计草案](design.md)，没有冻结公开 API，也没有确定发布方式。

## 要回答的问题

这一轮检查声明式命令对象与类型化参数描述是否能覆盖常见命令，并在拆分、复用后保持处理函数类型；同时检验同一份定义能否贯通运行时值与帮助信息。

实验代码位于 [experiments/command-api](../experiments/command-api/)。根目录的 TypeScript、ESLint、Vitest 与 pnpm 配置让实验可以重复运行。当前工具链使用 TypeScript 5.9.3，在 Node.js 22.22.2 下验证；这些版本暂不构成未来发布库的兼容性承诺。

## 看哪些文件

| 文件 | 用途 |
| --- | --- |
| [deploy.ts](../experiments/command-api/deploy.ts) | 独立叶子命令，展示调用方的实际写法 |
| [shared-options.ts](../experiments/command-api/shared-options.ts) | 抽出的共享选项，保留默认值与枚举推导 |
| [example.ts](../experiments/command-api/example.ts) | 将叶子组合成根命令并接入终端 |
| [typecheck.ts](../experiments/command-api/typecheck.ts) | 类型断言与应在编译期报错的调用 |
| [run.test.ts](../experiments/command-api/run.test.ts) | 通过公共入口验证实际解析、帮助与失败行为 |
| [main.test.ts](../experiments/command-api/main.test.ts) | 在独立进程中验证输出与退出码 |

原有 [typing.ts](prototypes/typing.ts) 保留为最初的声明实验。新的验证直接导入运行时实现，避免声明与实现分别维护。

## 实验接口

```ts
const deploy = defineCommand({
  args: [argument.string('entry', { required: true })],
  options: {
    port: option.number({ default: 3000 }),
    mode: option.enum(['dev', 'prod'], { default: 'dev' }),
    token: option.string(),
    verbose: option.boolean(),
  },
  run({ args, options }) {
    return { entry: args.entry, ...options }
  },
})

const app = defineCommand({ name: 'tool', commands: { deploy } })
const result = await run(app, { argv: ['deploy', 'app.ts'] })
```

叶子和分组共用 `defineCommand`，通过两个互斥定义区分。叶子的 `args`、`options` 可以省略；分组只有 `commands`，不能同时提供处理函数或参数。子命令名由挂载对象的键决定，子命令自身的 `name` 不改变命令路径。

处理函数的输入保持以下类型：

| 字段 | 类型 | 省略输入时的值 |
| --- | --- | --- |
| `args.entry` | `string` | 输入错误 |
| `options.port` | `number` | `3000` |
| `options.mode` | `'dev' \| 'prod'` | `'dev'` |
| `options.token` | `string \| undefined` | `undefined` |
| `options.verbose` | `boolean` | `false` |

本轮位置参数仅提供 `argument.string`，选项提供 `string`、`number`、`enum`、`boolean`。描述器构造时保存默认值与枚举集合，命令定义时保存参数顺序、选项表和子命令表；之后修改原数组或共享对象不会改变已经创建的命令。

字段描述器需要直接由构造器创建；可以复用它们，并展开选项表，但不能展开单个描述器后改写规则。定义阶段会验证描述器来源，避免复制对象仍携带旧的静态类型、实际规则却已经改变。

## 本轮采用的行为规则

以下规则是为了运行实验选定的默认方案，仍可调整：

- `required: true` 要求显式输入，提供默认值时省略 `required`。
- 默认值在描述器构造时接受校验；非法定义同步抛出 `DefinitionError`。
- 位置参数按数组顺序匹配，名称不能重复，可选参数之后不能出现必填参数。
- 长选项支持 `--port 3000` 和 `--port=3000`，可出现在位置参数前后。
- 数值接受有限的十进制与指数形式，拒绝空字符串、空白、十六进制、后缀与非有限值。
- 布尔开关不接受取值；省略为 `false`，显式 `--verbose` 为 `true`。
- 未知选项、重复选项、多余位置参数返回输入错误。
- `--` 结束选项识别，其后的帮助标记也作为位置参数。
- `-h` 与 `--help` 在合法命令路径上优先于输入校验，不调用处理函数；未知子命令仍返回错误。
- 字符串选项会消费紧接的取值，包括 `--help`，因此 `--token --help` 不触发帮助；`--token=--help` 也可以表达该值。
- 停在分组时显示该组帮助；组内选项不向子命令继承，共享选项通过对象组合显式复用。

选项和子命令名以字母开头，只使用字母、数字、下划线和连字符。选项 `help` 保留给内置帮助。本轮没有别名、布尔否定、重复值集合、可变长位置参数、值转换扩展、懒加载或插件系统。

## 执行与失败

`run` 接收已去掉运行时和脚本路径的 `argv`，不读取进程参数，不输出帮助或错误，也不设置进程退出码。调用方自己的处理函数仍可产生业务副作用。

```ts
type RunResult
  = | { kind: 'executed', value: unknown }
    | { kind: 'help', text: string }
    | {
      kind: 'invalid-input'
      diagnostic: { code: string, message: string, commandPath: readonly string[] }
    }
```

输入错误返回诊断，处理函数的同步异常或异步拒绝原样传播。成功结果保存处理函数的返回值；返回值暂为 `unknown`，等待明确的程序内调用需求后再决定是否推导它的类型。

`runMain` 接入当前进程，等待处理函数完成，并采用以下终端行为：

| 结果 | 输出 | 退出码 |
| --- | --- | --- |
| 成功 | 不自动打印处理函数返回值 | `0` |
| 帮助 | stdout | `0` |
| 输入错误 | stderr，附帮助调用提示 | `2` |
| 业务异常 | stderr | `1` |

示例部署处理函数主动打印解析结果，没有执行实际部署。

## 验证结论与边界

当前实验支持常见输入在内联定义、独立叶子模块、共享选项、对象展开和覆盖、递归分组中保持类型。处理函数写在对象前面，也能从后面的参数定义获得上下文类型；缺省数值不收窄成字面量，枚举默认值保留完整联合。

有五个与调用体验直接相关的边界：

1. 枚举集合先赋给普通 `string[]` 变量后，字面量信息已经丢失。抽出集合时使用 `as const`，或直接内联传入构造器。
2. 共享选项若被注解成宽泛的 `Record<string, Option<unknown>>`，字段和值类型会丢失。保留推导，或使用能够保留原形状的约束方式。
3. 原始命令对象先存入变量，之后再调用 `defineCommand`，不能追溯为处理函数提供上下文类型。当前推荐在叶子模块中直接调用 `defineCommand` 后再导出。
4. 动态字段名、多个候选名称与宽泛索引选项表无法保证某个键存在，访问值会包含 `undefined`；只有确定的字面量键能保留必有值类型。
5. 普通位置参数数组不能保证某个描述器存在，字段值会包含 `undefined`。抽出固定顺序的参数列表时使用 `as const` 保留元组形状；内联数组通过 `defineCommand` 的 `const` 泛型保留形状。条件性缺失的元组成员同样不能推成必有值。

类型实验还发现方法签名的参数双向检查可能接受过窄的处理函数参数。接口类型采用函数属性与 `NoInfer` 约束上下文，调用方仍可使用 `run(...) { ... }` 的写法。

显式 `args: undefined` 或 `options: undefined` 会破坏泛型缺省推导。本实验启用 `exactOptionalPropertyTypes`，并在定义阶段同步拒绝这两种写法；未来仍需检查未启用该编译选项的使用体验。

这些结论说明候选接口可行，尚未证明它优于 Commander 或 citty。下一轮最有价值的对照是：用同一个真实命令，比较拆分复用、枚举变更和编辑器错误提示的成本，再决定是否增加共享定义辅助函数或转换能力。
