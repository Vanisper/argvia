# 用 java-run 检验 Argvia 的接口

状态：需求分析与候选设计。本文补充真实应用场景，不改变第一轮运行时契约。

## 已确认的工作约定

- 当前探索在 `explore/command-interface` 分支进行，允许按需提交阶段成果。
- 已具备条件的部分可以创建独立 worktree 与正式开发分支，逐步转入选定的设计与实现。
- Argvia 与配套包后续采用 monorepo；包划分在需求验证后确定。
- `java-run` 是真实使用场景的参考，`--force` 应归属于初始化命令。
- 无默认值的单值选项省略时保持 `undefined`，布尔选项同样适用；应用负责合并配置后设置最终默认值。

2026-10-13，用户授权探索提交，并要求移交到 Argvia 项目下的新会话。此前保留工作区、不创建提交的约定由本次授权更新；接手顺序见 [会话交接](handoff.md)。

## 参考项目与观察

阅读基于本地 `java-run` 工作树，提交为 `6946b32a77203185755dbe88f40722b9058ebabd`：

`/Users/vanisper/.codex/worktrees/terminal-experience/java-run`

该应用提供默认 `run` 与显式 `run`、`init`、`plan`、`help`、`version`。它还包含构建、JVM、应用参数、项目配置和终端呈现等不同职责。

`--force` 的使用限制已经存在：[args.ts](/Users/vanisper/.codex/worktrees/terminal-experience/java-run/src/cli/args.ts:158) 会拒绝非 `init` 的使用，[测试](/Users/vanisper/.codex/worktrees/terminal-experience/java-run/tests/parse-argvs.test.ts:194)覆盖了作用域、重复、带值与透传。当前问题主要在定义组织：`force` 放在全局 `CliConfig` 中，经过统一解析后再检查 `action`；帮助也在全局高级选项中列出它。

本轮将“领域内的子参数”理解为**命令局部选项**：`force` 只进入 `init` 的定义、处理函数类型和帮助。构建、JVM、终端等领域的数据组织可以由调用方在获得参数后完成；领域分组不自动等于全局选项或嵌套命令。

## 命令定义应承担的约束

以下片段使用当前实验已经具备的能力，展示局部选项的归属。业务函数由调用方提供。

```ts
const launchOptions = {
  tool: option.enum(['auto', 'maven', 'gradle']),
  module: option.string(),
  main: option.string(),
}

const runCommand = defineCommand({
  options: launchOptions,
  run({ options }) {
    return launchApplication(options)
  },
})

const initCommand = defineCommand({
  options: { ...launchOptions, force: option.boolean() },
  run({ options }) {
    return initializeProject(options)
  },
})

const app = defineCommand({
  name: 'java-run',
  commands: { run: runCommand, init: initCommand },
})
```

在这种定义下，`run` 的输入与帮助不包含 `force`，`run --force` 在进入业务处理前报输入错误。共享选项通过普通对象复用，初始化约束由命令结构表达。

这段代码只覆盖命令作用域。默认命令、重复数组、CLI 名称映射等还需要下一轮实验。

## 真实需求与当前缺口

| 场景 | 参考项目的规则 | 当前 Argvia 实验 | 下一轮需要验证的接口 |
| --- | --- | --- | --- |
| 局部选项 | `--force` 仅用于 `init` | 已可通过叶子命令定义表达 | 帮助与 handler 类型同步限制 |
| 默认命令 | 无参数或只传启动选项时执行 `run` | 分组缺少子命令时显示帮助 | 显式 `defaultCommand` 与未知命令的处理 |
| 字段与 CLI 拼写 | `--jvm-arg` 对应 `jvmArgs`，`--tool` 对应 `buildTool` | 选项键直接决定长选项名 | 显式 `flag`，以及缺省命名规则 |
| 重复值 | JVM、构建、应用参数可重复，保留顺序 | 所有重复选项均报错 | `multiple: true` 推导数组值 |
| 原样透传 | `--` 后全部传给应用，保留空字符串、空白、等号和 token 边界 | 后缀进入有限的位置参数 | 独立 `passthrough` 输入 |
| 配置覆盖 | 显式 CLI 标量覆盖文件，CLI 数组追加到文件数组之后 | 默认值直接填入处理函数输入 | 保留缺省信息，或提供显式输入来源 |
| 领域校验 | 模块选择器、Java 类名、工具路径各有规则 | 只有通用字符串、枚举和数值规则 | 调用方转换与校验，错误仍能定位到字段 |
| 终端偏好 | 颜色、输入、重绘和动画分别判断 | 终端入口只处理帮助和错误 | 命令定义与终端能力独立组合 |
| 业务退出 | 保留外部进程退出码、取消的 `130` / `143` | 通用业务异常映射为 `1`，数值返回不当退出码 | 区分业务退出结果与普通返回值 |

配置合并见 [args.ts](/Users/vanisper/.codex/worktrees/terminal-experience/java-run/src/cli/args.ts:164)；重复值与透传见 [测试](/Users/vanisper/.codex/worktrees/terminal-experience/java-run/tests/parse-argvs.test.ts:114)；终端能力见 [policy.ts](/Users/vanisper/.codex/worktrees/terminal-experience/java-run/src/terminal/policy.ts:29)；业务退出与清理见 [cli.ts](/Users/vanisper/.codex/worktrees/terminal-experience/java-run/src/cli.ts:98)。

## 需要明确选择的兼容点

参考项目提供需求证据，不意味着每项现有行为都成为 Argvia 的默认规则。

| 输入 | java-run 当前行为 | Argvia 当前实验行为 |
| --- | --- | --- |
| `--force init` | 允许，解析全部输入后判断所属命令 | 根分组不接受该选项 |
| 选项后出现命令词 | 统一扫描，可在选项之后识别命令 | 从参数开头选择命令路径 |
| `--help --unknown` | 仍报未知参数 | 帮助优先返回 |
| `--main --help` | 缺少取值，要求负号值使用等号形式 | 字符串选项将 `--help` 作为取值 |
| `--arg=` | 拒绝空值 | 普通字符串选项接受空字符串 |
| `-- --help ''` | 两个原始 token 传给应用 | 匹配普通位置参数，可能报多余参数 |

命令词在前能让选项作用域更明确，也能避免先收集所有选项再判断合法性的全局解析结构。是否保留前置选项写法，仍需选择；跨域转发可先采用等号形式表达以负号开头的值。

帮助至少应跳过业务配置读取、项目准备和必填检查。它是否同时跳过未知选项与取值错误，需要单独确定，不能笼统地用“帮助优先”概括。

## 第二轮类型候选

[java-run-definition.ts](prototypes/java-run-definition.ts) 是独立的声明实验，验证以下形状。`flag`、`multiple`、`passthrough` 和 `defaultCommand` 尚未加入当前运行时。

```ts
const launchOptions = {
  buildTool: option.enum(['auto', 'maven', 'gradle'], { flag: '--tool' }),
  jvmArgs: option.string({ flag: '--jvm-arg', multiple: true }),
  applicationArgs: option.string({ flag: '--arg', multiple: true }),
  includeTests: option.boolean({ flag: '--include-tests' }),
}

const runCommand = defineCommand({
  options: launchOptions,
  passthrough: true,
  run({ options, passthrough }) {
    return createRunRequest(options, passthrough)
  },
})

const app = defineCommand({
  name: 'java-run',
  defaultCommand: 'run',
  commands: { run: runCommand, init: initCommand },
})
```

重复字符串选项省略时得到 `[]`，只收集本次 CLI 输入；数组合并顺序由业务处理函数决定。原样透传单独提供 `readonly string[]`，不复用普通位置参数，也不自动合并到业务字段。参考实现的 `plan` 同样接收透传并在预览中展示应用参数，因此本轮也保留它的透传候选。

### 缺省值与配置合并

参考项目只让显式 CLI 输入覆盖文件配置。如果库提前给 `buildTool` 填入 `'auto'`，调用方无法从该值判断用户是否显式要求自动检测。

| 路线 | 调用体验 | 需要付出的成本 |
| --- | --- | --- |
| 省略时保持 `undefined`，应用合并后设置最终默认值 | `cli.buildTool ?? project.buildTool ?? 'auto'` | 可选布尔规则需与当前缺省 `false` 的约定协调 |
| 保留便利默认值，同时提供显式输入信息 | 从 `provided` 或来源信息判断是否覆盖配置 | 需要额外上下文，普通值之外还需读取元信息 |

已选定第一条路线：无默认值的布尔选项得到 `boolean | undefined`，`force` 显式提供 `{ default: false }` 得到 `boolean`。声明实验按这条契约验证类型。第一轮可运行实验暂时保留 `option.boolean()` 缺省为 `false` 的旧行为，尚未同步这项接口选择。

重复选项继续作为集合规则单独讨论：本轮候选在省略时提供 `[]`，便于按顺序追加，尚未将“没有输入”与“显式空集合”区分为不同状态。

该实验验证了字段名与 CLI 拼写分离、数组类型、局部 `force`、条件透传上下文、默认命令键约束，以及配置合并后消除 `undefined`。启动字段覆盖构建工具、构建策略、模块、主类、三类转发参数和工具路径；终端偏好与领域校验留待单独验证。它没有验证解析、命令选择或来源信息的运行时行为。

## Monorepo 的职责候选

已确认未来采用 monorepo。推荐先从一个公开命令定义包和使用样本开始，包名与入口名称仍是候选：

```text
packages/
  argvia/                  # 定义、推导、解析、校验、命令选择、帮助和执行结果
    src/
      index.ts             # 显式 argv 的核心入口
      node.ts              # 进程参数、终端输出和退出码适配
playground/
  java-run/                # 真实场景的接口与类型验证
docs/
```

`argvia` 与 `argvia/node` 可以是同一发布包的不同入口。类型、解析、帮助是同一份定义驱动的能力，先在包内按模块维护。独立入口可让核心调用者按需接入进程环境；Node 与 Bun 的入口行为需要分别验证。

`java-run` 的终端代码提供了配套能力的真实线索：能力检测、日志记录、有序输出、活动、交互和子进程输出协调。不过 `createCliPresentation` 还含有 Maven / Gradle 阶段文案、诊断去重和 Java 启动交接等应用知识，不能直接成为通用包接口。

可以在出现第二个真实使用者后验证 `packages/terminal/`：它负责输入、输出和活动生命周期，命令解析通过调用方组合接入。只有确认日志、交互等能力有独立使用者、稳定契约或不同依赖需求时，再拆成更多发布包。

另一条布局路线是从一开始拆 `core`、运行时入口和 `terminal`。它便于独立依赖与发布，但会提前增加跨包类型、版本与适配契约。当前优先验证命令定义体验，推荐先采用单发布包、多入口的路线。

当前目录仍为实验布局，尚未迁移到上述结构。

## 下一轮验证顺序

1. 用 `run`、`init`、`plan` 的共享定义验证局部作用域与按命令生成帮助。
2. 按已选定的缺省契约更新运行实验，验证显式输入、配置覆盖和最终默认值的顺序。
3. 加入重复选项、字段命名与原样透传，检查 JVM 和应用参数的边界。
4. 验证默认命令、帮助错误优先级和业务退出结果，再确定执行接口。
5. 在接口收敛后建立 monorepo 的正式包布局，并开始 Node / Bun 与真实业务集成验证。
