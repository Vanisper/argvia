# java-run 命令开发示例

从仓库根目录运行，先查看帮助，再组合选项与应用参数：

```sh
pnpm exec turbo run dev --filter=@argvia/playground-java-run -- --help
pnpm exec turbo run dev --filter=@argvia/playground-java-run -- --tool=gradle --jvm-arg=-Xmx1g --arg=cli --arg=next -- --help
```

Turborepo 会先构建 `@argvia/core` 和 `@argvia/node`，再启动样本。入口使用固定的内存配置，输出带有 `demo: true` 的 JSON 请求；它演示命令处理与配置组合，不启动 Java，也不写入配置文件。

## 从输出看命令定义

内存配置使用 Maven、主类 `example.Main`，并开启测试产物；JVM、应用和构建参数分别预设为 `['-Xms256m']`、`['--profile=demo']`、`['--offline']`。不同 `--cwd` 都使用这份演示配置，目录值仍会进入最终请求。

第二条命令省略了 `run`，输出的关键字段如下：

```json
{
  "demo": true,
  "action": "run",
  "request": {
    "buildTool": "gradle",
    "mainClass": "example.Main",
    "includeTests": true,
    "jvmArgs": ["-Xms256m", "-Xmx1g"],
    "applicationArgs": ["--profile=demo", "cli", "next", "--help"],
    "buildArgs": ["--offline"]
  }
}
```

这份结果对应几处可以直接验证的声明：

- `defaultCommand: 'run'` 让省略命令词的输入进入启动命令
- `flag: '--tool'` 将终端拼写映射到 `options.buildTool`
- `multiple: true` 按出现顺序收集 `--jvm-arg`、`--arg` 和 `--build-arg`
- `passthrough: true` 将分隔符后的 `--help` 作为应用参数保留
- 可选布尔值省略时为 `undefined`，配置中的 `includeTests: true` 因而得到保留；`--include-tests=false` 可以显式关闭它

`plan` 使用相同选项与配置组合，`init` 在自己的命令定义中增加 `force`：

```sh
pnpm exec turbo run dev --filter=@argvia/playground-java-run -- plan --main=example.Other
pnpm exec turbo run dev --filter=@argvia/playground-java-run -- init --force --arg=cli -- tail
```

第一条输出 `action: "plan"`，请求的 `mainClass` 为 `example.Other`。第二条输出 `action: "init"`，`force` 为 `true`，应用参数为 `['cli', 'tail']`；初始化跳过旧配置，构建工具采用最终默认值 `auto`，测试产物开关为 `false`。

## 按命令开发的顺序读代码

| 文件 | 关注点 |
| --- | --- |
| [`src/app.ts`](../playground/java-run/src/app.ts) | `run`、`plan`、`init` 的命令树；默认命令、透传声明、局部 `force` 和业务服务调用 |
| [`src/options.ts`](../playground/java-run/src/options.ts) | 共享选项、终端拼写、重复字符串，以及 `InferOptions<typeof launchOptions>` 推导的输入类型 |
| [`src/config.ts`](../playground/java-run/src/config.ts) | 项目配置与业务请求的类型，配置组合及领域校验 |
| [`src/main.ts`](../playground/java-run/src/main.ts) | 固定内存配置、演示服务与 `runMain` 进程入口 |

先看 `app.ts` 中的处理函数：`options.buildTool`、`options.applicationArgs` 和 `passthrough` 的类型由命令定义推导，函数参数无需手写注解。`run` 与 `plan` 直接复用 `launchOptions`，`init` 通过对象展开增加 `force`；因此这个字段只出现在初始化命令的类型、解析和帮助中。

`options.ts` 中的一份描述同时提供取值类型、输入校验和帮助说明。抽出的 `LaunchInput` 供配置合并函数使用，仍由描述器推导。项目配置与最终业务请求则在 `config.ts` 中显式声明，表达配置允许缺项、业务请求已经补齐默认值的区别。

`valueName` 让帮助显示 `--cwd <目录>`、`--main <类全名>` 和 `--java <路径>`，字段名与解析值保持原样。枚举候选值和重复参数说明继续由描述器生成；布尔开关仍显示 `[=true|false]`。

`app.ts` 通过 `JavaRunServices` 接收配置读取和业务执行函数。处理函数拿到已校验的输入后完成配置组合，再调用对应服务。`main.ts` 接入当前进程，测试则注入业务替身；两者使用相同的命令定义。启动服务返回数字退出码，`run` 处理函数通过 `exit(await services.launch(request))` 显式传给执行器。计划与初始化可以继续返回普通业务数据；它们的数字返回值不会自动成为退出码。

## 领域校验与业务状态

目录是读取配置的前置条件，`resolveProjectDirectory` 先拒绝空白目录；其余规则在配置合并后执行，因此有效 CLI 标量可以覆盖旧配置中的无效标量。主类需要符合点分标识符规则，支持 Unicode 和内部类名；模块选择器移除首尾空白，只接受单个模块。Java/构建工具路径、JVM 参数和构建参数拒绝空白项，应用参数及透传尾部保持原样。

领域校验通过 `CommandError` 表达预期失败，退出码为 `2`，不会调用启动、计划或初始化服务。消息保留配置字段名并指出修正入口；JVM/build 数组错误标注合并后的零基下标，参数内容不回显。Node 入口输出命令路径和消息，不自动附加参数解析帮助；未知选项等解析错误仍带帮助提示。领域校验与执行结果的职责见[命令执行契约](execution-contract.md)。

```sh
pnpm exec turbo run dev --filter=@argvia/playground-java-run -- --include-tests=false
pnpm exec turbo run dev --filter=@argvia/playground-java-run -- --main=invalid-name
```

第一条请求中的 `includeTests` 为 `false`；第二条由入口输出 `java-run run: mainClass 必须是有效的 Java 类全名；请通过 --main 或项目配置 mainClass 修正`，入口退出码为 `2`。演示服务只打印请求，启动返回 `0`；非零启动状态由测试注入，并通过真实 Node 子进程验证为 `7`。

## 配置组合与验证

项目配置中的标量按 **显式 CLI → 项目配置 → 应用默认值** 选择。`run` 与 `plan` 先校验 CLI 目录或当前目录，再读取配置并生成请求；`init` 直接用本次输入生成初始化请求。`javaCommand` 和 `buildCommand` 只接受本次 CLI 输入，未纳入 `ProjectConfig`。

数组采用追加语义：JVM 和构建参数先放配置值，再放 CLI 重复值；应用参数最后追加透传数组。合并创建新数组，保留顺序及 token 边界。空的 CLI 数组表示没有追加项。

根 `--help` 展示分组与默认入口，`run --help` 展示启动选项。分隔符前的帮助或无效输入不会触发配置读取和业务服务；选择 `plan`、`init` 时将命令词放在选项之前。完整边界见[命令输入契约](input-contract.md)。

[`test/app.test.ts`](../playground/java-run/test/app.test.ts) 验证配置覆盖与服务调用，[`test/config.test.ts`](../playground/java-run/test/config.test.ts) 检查领域规则及合并结果与输入数组隔离；[`test/main.test.ts`](../playground/java-run/test/main.test.ts) 通过真实 Node 子进程验证输出、领域失败与非零退出码，[`test/typecheck.ts`](../playground/java-run/test/typecheck.ts) 验证推导结果及不合法用法。运行本样本的检查：

```sh
pnpm exec turbo run lint typecheck test --filter=@argvia/playground-java-run
```

实际 Java 构建、子进程调度与配置持久化可通过 `JavaRunServices` 接入。
