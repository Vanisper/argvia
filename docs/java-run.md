# java-run 配置组合场景

[`playground/java-run`](../playground/java-run/) 用真实 Java 启动工具的需求验证命令定义与配置覆盖。样本依赖 `@argvia/core`，通过显式 argv、内存配置和业务替身运行；配置读取、启动、计划与初始化由调用方提供。

## 当前覆盖

`run`、`plan` 和 `init` 复用项目目录、构建工具、构建策略、模块、主类、测试产物与工具路径的标量选项。`force` 只属于 `init`，显式声明 `{ default: false }`，因此类型、解析和帮助具有相同作用域。

启动选项不提供库默认值。`run` 与 `plan` 的处理函数先加载项目配置，再按显式 CLI、项目配置、应用默认值的顺序组合请求。省略 `includeTests` 时保留文件配置中的 `true`；配置中的 `false` 也会被保留，显式开关输入可覆盖为 `true`。

`init` 跳过旧配置读取，只按本次 CLI 输入和应用默认值创建初始化请求。帮助或无效输入不会调用业务处理函数，因此也不会读取配置。类型检查同时验证共享字段、合并后必有值及局部 `force`。

三个命令共享 `--jvm-arg`、`--arg`、`--build-arg` 重复字符串选项，分别得到 `jvmArgs`、`applicationArgs`、`buildArgs`。`run` 与 `plan` 将 CLI 数组追加到配置数组后；`init` 只保存 CLI 数组。合并保留各字段的输入顺序，并创建新数组，避免修改配置或污染后续执行。

`run`、`plan`、`init` 均开启原样透传。应用参数按配置数组、CLI `--arg` 数组、`--` 后的尾部顺序组合；`init` 只组合后两部分。尾部中的 `--help`、未知选项和第二个 `--` 不再由 Argvia 解释，空字符串与空白保持原样。分隔符前的帮助和输入错误仍会阻止配置读取及业务执行。

选项通过 `flag` 提供 `--tool`、`--main`、`--include-tests`、`--java`、`--build-command` 等终端拼写，处理函数仍读取 `buildTool`、`mainClass` 等领域字段。帮助与诊断使用终端拼写，对象字段名不作为隐式别名。

根分组通过 `defaultCommand: 'run'` 提供默认启动。无参数、启动选项或 `--` 开头的输入与显式 `run` 使用同一套配置组合；`plan` 和 `init` 通过首个命令词选择。根 `--help` 展示分组与默认入口，`run --help` 展示启动选项。

```sh
java-run --tool=maven --jvm-arg=-Xmx1g --arg=first -- --help
java-run plan --tool=maven --jvm-arg=-Xmx1g --arg=first -- --help
java-run init --force --arg=first -- second
```

前两条将 `--help` 作为应用参数，第三条将 `first`、`second` 交给初始化服务保存。未知命令词直接报错；`--force init` 不会重新选择初始化命令。`--cwd plan` 中的 `plan` 作为项目目录值，选定目录之后才读取配置。

## 后续需求

| 需求 | 所需能力与规则 |
| --- | --- |
| 业务退出与取消 | 保留外部进程退出码及 `130` / `143` |

输入组合按[命令输入契约](input-contract.md)验证。领域校验、Java 构建、子进程调度与终端呈现仍由应用组合。

## 参考依据

场景依据 java-run 提交 `6946b32a77203185755dbe88f40722b9058ebabd` 的 `src/cli/args.ts`、`src/cli.ts` 与 `tests/parse-argvs.test.ts`：标量仅由显式 CLI 输入覆盖，`init` 在读取旧配置前返回，`plan` 同样展示应用参数与透传结果。

参考项目已有非 `init` 的 `force` 拒绝规则。这里通过命令定义让这个限制同时体现在处理函数类型和帮助中。样本只读取需求证据，不执行参考应用的构建或配置写入。
