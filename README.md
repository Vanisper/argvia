# Argvia

面向 TypeScript 的 CLI 命令定义基础库，用一份定义贯通参数解析、校验、帮助信息和处理函数类型。

项目采用 pnpm monorepo。核心包、根工作区和使用样本均为 `private`，目前尚未发布，API 会随实际使用继续完善。

## 使用

```ts
import { argument, defineCommand, option } from 'argvia'
import { runMain } from 'argvia/node'

const deploy = defineCommand({
  args: [argument.string('entry', { required: true })],
  options: {
    port: option.number({ default: 3000 }),
    mode: option.enum(['dev', 'prod'], { default: 'dev' }),
    verbose: option.boolean({ default: false }),
  },
  run({ args, options }) {
    console.log(args.entry, options.port, options.mode, options.verbose)
  },
})

const app = defineCommand({ name: 'tool', commands: { deploy } })
await runMain(app)
```

`argvia` 提供命令定义和显式 argv 执行；`argvia/node` 接入当前进程的参数、输出和退出码。无默认值的可选单值选项省略时得到 `undefined`，包括布尔选项，方便应用在配置合并后设置最终默认值。

## 本地开发

工具链使用 Node.js 22.22.2、pnpm 10.33.2、TypeScript 5.9.3。安装后运行样本或完整检查：

```sh
pnpm install --frozen-lockfile
pnpm dev deploy app.ts --port 8080 --mode prod --verbose
pnpm dev deploy --help
pnpm check
```

`pnpm check` 包含构建、代码风格、严格类型检查、运行时测试和隔离的产物消费验证。`pnpm build` 生成核心包的 ESM 与类型声明；`pnpm test` 会先构建依赖。

## 目录

| 路径 | 职责 |
| --- | --- |
| [`packages/argvia`](packages/argvia/) | 命令定义、类型推导、解析、校验、帮助和执行入口 |
| [`playground/basic`](playground/basic/) | 拆分叶子命令、共享选项和进程入口的使用示例 |
| [`playground/java-run`](playground/java-run/) | 内存配置覆盖与命令局部选项的业务组合示例 |
| [`docs/api.md`](docs/api.md) | 当前 API 与输入行为 |
| [`docs/design.md`](docs/design.md) | 模块边界、类型约束与后续设计问题 |
| [`docs/java-run.md`](docs/java-run.md) | 配置组合场景与后续参数转发需求 |

字段拼写映射、重复值集合、原样透传和默认子命令尚未实现。Node 进程入口已验证，Bun 的兼容性仍待验证。
