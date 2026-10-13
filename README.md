# Argvia

面向 TypeScript 的 CLI 命令定义基础库，用一份定义贯通参数解析、校验、帮助信息和处理函数类型。

项目采用 pnpm monorepo，由 `@argvia/core` 提供命令核心，`@argvia/node` 接入 Node.js 进程。根工作区、全部包和使用样本均为 `private`，目前尚未发布，API 会随实际使用继续完善。

## 使用

```ts
import { argument, defineCommand, option } from '@argvia/core'
import { runMain } from '@argvia/node'

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

`@argvia/core` 提供命令定义、显式 argv 执行和帮助生成；`@argvia/node` 提供 `runMain`，接入当前进程的参数、输出和退出码。无默认值的可选单值选项省略时得到 `undefined`，包括布尔选项，方便应用在配置合并后设置最终默认值。

## 本地开发

工具链使用 Node.js 22.22.2、pnpm 10.33.2、TypeScript 5.9.3。安装后运行样本或完整检查：

```sh
pnpm install --frozen-lockfile
pnpm dev deploy app.ts --port 8080 --mode prod --verbose
pnpm dev deploy --help
pnpm check
```

`pnpm check` 包含构建、代码风格、严格类型检查、运行时测试和隔离的产物消费验证。两个包分别生成 ESM 与类型声明，Turborepo 按依赖关系调度构建：

```sh
pnpm build
pnpm exec turbo run build --filter=@argvia/core
pnpm exec turbo run build --filter=@argvia/node
```

构建 `@argvia/node` 时会先构建它依赖的 `@argvia/core`。`pnpm test` 和 `pnpm typecheck` 会先完成各包及其依赖的构建。消费验证分别检查 core 的独立产物，以及两个包组合后的运行行为和类型声明。

## 目录

| 路径 | 职责 |
| --- | --- |
| [`packages/core`](packages/core/) | `@argvia/core`：命令定义、类型推导、解析、校验、帮助和显式 argv 执行 |
| [`packages/node`](packages/node/) | `@argvia/node`：Node.js 进程入口 |
| [`playground/basic`](playground/basic/) | 组合 core 与 Node 包，展示叶子命令、共享选项和进程入口 |
| [`playground/java-run`](playground/java-run/) | 使用 core 验证配置覆盖、命令局部选项与参数转发 |
| [`docs/api.md`](docs/api.md) | 当前 API 与输入行为 |
| [`docs/design.md`](docs/design.md) | 模块边界、类型约束与后续设计问题 |
| [`docs/input-contract.md`](docs/input-contract.md) | 字段拼写、重复字符串、透传和默认命令的组合契约 |
| [`docs/java-run.md`](docs/java-run.md) | run、plan、init 的配置组合与参数转发场景 |

当前支持字段拼写映射、重复字符串与原样透传；默认子命令按输入契约继续实现。Node 进程入口已验证，Bun 的兼容性仍待验证。
