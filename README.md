# Argvia

面向 TypeScript 的 CLI 命令定义基础库。

Argvia 的设计目标是用一份命令定义贯通参数解析、运行时校验、帮助信息和处理函数类型，让 CLI 开发者减少重复声明，并在拆分、组合命令时保留类型信息。

项目目前处于定位与接口设计阶段。文档中的调用方式是候选方案，公开接口尚未冻结。

探索在 `explore/command-interface` 分支进行，允许按需提交阶段成果。已具备条件的部分可在独立 worktree 与正式开发分支中逐步实施。Argvia 与配套包后续采用 monorepo，当前仍保留实验布局。最新工作边界与接手顺序见 [会话交接](docs/handoff.md)。

## 运行接口实验

仓库已有一轮可运行的命令接口实验，代码位于 `experiments/command-api/`。它用拆分的部署命令验证参数描述、类型推导、解析、校验与帮助输出。

当前工具链在 Node.js 22.22.2、pnpm 10.33.2 下验证。首次运行：

```sh
pnpm install
pnpm dev deploy app.ts --port 8080 --mode prod --verbose
pnpm dev deploy --help
```

检查类型、代码风格与运行时契约：

```sh
pnpm check
```

包暂设为 `private`。实验入口与行为约定见 [接口实验记录](docs/command-api-experiment.md)，当前代码用于评估候选接口。

## 已确认的方向

- 优先改善命令定义的易用性与 TypeScript 类型推导
- 先设计定位与调用契约，再实现运行时行为
- 参考 oclif、Commander、citty 的命令定义与组织方式
- 用 java-run 的真实场景检验命令作用域、参数转发与配置覆盖
- 无默认值的可选单值参数省略时保留 `undefined`，由应用合并配置后设置最终默认值
- 后续以 monorepo 组织 Argvia 与配套包

## 设计资料

- [定位与接口草案](docs/design.md)：目标用户、候选接口、运行规则与待决问题
- [类型声明实验](docs/prototypes/typing.ts)：验证候选接口的部分类型推导，供编译检查使用
- [接口实验记录](docs/command-api-experiment.md)：可运行候选、验证结论与待决取舍
- [java-run 场景分析](docs/java-run-case-study.md)：真实需求、兼容点、第二轮类型候选与 monorepo 职责

类型声明实验包含 `declare` 定义，仅用于研究接口形状。它不是 Argvia 的运行时实现。
