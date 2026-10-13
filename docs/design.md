# Argvia 架构与开发边界

Argvia 用声明式命令对象与类型化参数描述器，让一份定义驱动解析、校验、帮助和处理函数上下文。`packages/core` 提供命令核心，`packages/node` 提供 Node.js 进程入口；调用方通过普通对象复用选项，通过闭包接入业务依赖。当前接口见 [API 文档](api.md)。

## 包与入口

每个包拥有独立入口、构建产物和消费验证。定义、类型推导、解析和帮助共同依赖参数规则，由 `@argvia/core` 内的模块协作完成。`@argvia/node` 负责 Node.js 进程适配，通过 core 的公共入口执行命令。

| 包 | 职责 | 依赖 |
| --- | --- | --- |
| `@argvia/core` | `defineCommand`、`argument`、`option`、`run`、`DefinitionError` 与公开类型；生成帮助文本 | 运行时使用 ECMAScript 标准能力 |
| `@argvia/node` | `runMain`，读取进程参数、输出帮助与错误、设置退出码 | `@argvia/core`、`node:process` |

包依赖方向为 `@argvia/node` → `@argvia/core`。Node 包将 core 声明为 `workspace:^` 的 peer dependency，并通过 `workspace:*` 的开发依赖完成本地构建和测试。命令创建与执行使用同一份 core 实例，命令定义存储由 core 管理。

两个包分别使用 TypeScript 的 NodeNext 模式，通过 `tsc` 输出 ESM 和 `.d.ts`。编译保留模块结构，Node 产物保留对 `@argvia/core` 公共入口的引用；包内相对模块引用使用 `.js` 后缀。根工作区与全部包保持 `private`。

`playground/basic` 显式依赖两个包，验证命令定义与进程入口的组合；`playground/java-run` 依赖 core，通过显式 argv 验证业务配置组合。终端、日志、交互等配套能力在有独立职责和实际使用者后再形成包。

配置读取与合并、领域转换、构建、日志和交互由调用方组合。`run` 本身只接收显式 argv；处理函数可以有自己的业务副作用。

## 定义与类型的一致性

参数描述器由构造器创建并冻结，命令定义保存位置参数顺序、选项表和子命令表的快照。修改共享对象或枚举数组不会改变已有命令。

运行时通过私有 WeakSet 校验描述器来源，通过 WeakMap 保存已校验命令。描述器可以复用，选项表可以展开；复制并修改单个描述器会在定义阶段被拒绝。处理函数类型依赖构造器携带的值类型，内部调用边界由解析与校验保证。

必填字段、默认值、枚举集合和可选规则决定上下文类型。`NoInfer` 避免显式收窄的处理函数参数反向影响字段推导。严格检查启用 `exactOptionalPropertyTypes` 和 `noUncheckedIndexedAccess`。

有几个使用边界需要保留在接口设计中：

- 内联定义或直接导出 `defineCommand(...)` 可以给处理函数提供上下文类型；先存成未标注的原始对象，再调用构造器无法追溯这个上下文
- 抽出的枚举集合与固定位置参数列表用 `as const` 保留字面量或元组信息
- 宽泛的 `Record<string, Option<unknown>>` 注解会丢失字段和值类型
- 动态选项键、动态参数名、普通数组或条件性缺失的成员不能保证存在，读取值保留 `undefined`

## 配置覆盖

无默认值的可选单值选项省略时保留 `undefined`，布尔选项遵循同一规则。应用按显式 CLI、项目配置、最终默认值的顺序选择标量：

```ts
const includeTests = cli.includeTests ?? project.includeTests ?? false
```

不参与配置覆盖的独立开关可以声明 `option.boolean({ default: false })`，处理函数中得到 `boolean`。命令定义中的默认值会直接进入处理函数输入，因此配置覆盖字段通常不在定义中提供默认值。

## 开发检查

每个包拥有自己的构建、类型和测试脚本，根脚本通过 Turborepo 调度。`build` 先执行依赖包的构建；`typecheck` 与 `test` 在本包及依赖包的构建完成后执行。缓存存于当前 worktree 的 `.turbo/cache`。

`pnpm build` 构建全部包。按需构建 core 或 Node 包时，分别运行 `pnpm exec turbo run build --filter=@argvia/core` 或 `pnpm exec turbo run build --filter=@argvia/node`；Turborepo 按包依赖图完成所需构建。

运行时测试通过公共包入口覆盖解析、定义校验、帮助和业务失败。类型验证检查推导及编译期负例。隔离消费者只获得待测包的 `package.json` 与 `dist`，由普通 Node 执行，并在没有环境类型的 NodeNext 与 Bundler 配置下检查声明。

core 的隔离消费者验证独立导入、命令执行与类型声明，检查完整依赖图不加载 Node 内建模块。跨包消费者同时装入 core 和 Node 产物，验证 core 创建的命令可以交给 `runMain`，并检查两个公开入口的类型声明。

## 实施顺序

字段映射、重复字符串、原样透传和默认命令按[命令输入契约](input-contract.md)逐项实现。每步同时更新运行时、类型、帮助和 java-run 场景，并形成可独立验证的提交。

| 顺序 | 能力 | 验收重点 | 状态 |
| --- | --- | --- | --- |
| 1 | `flag` | 有效拼写唯一，结果字段稳定，帮助与诊断一致 | 已实现 |
| 2 | 字符串 `multiple` | 有序收集、缺省空数组、执行间隔离、配置追加 | 已实现 |
| 3 | `passthrough` | `run`、`plan`、`init` 接收原始尾部，保留 token 边界 | 待实现 |
| 4 | `defaultCommand` | 默认与显式执行一致，未知命令报错，帮助和 `--` 路由明确 | 待实现 |

解析、帮助和校验共用定义阶段保存的选项映射及统一的取值边界。`@argvia/node` 继续通过 core 的公共执行入口处理结果。

布尔否定、领域转换与校验、业务退出与取消、返回值推导、Node 与 Bun 的支持范围是后续独立设计事项。短别名、前置选项后的命令识别和集合替换策略不包含在上述四项能力中。
