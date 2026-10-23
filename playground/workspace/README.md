# Workspace 应用示例

`@argvia/playground-workspace` 是使用 `@argvia/core` 与 `@argvia/parser` 公开接口构建的私有 CLI 应用。命令树为 `tool → assets → build/inspect`，展示普通声明复用、结构化定义读取、分阶段调用和服务注入。

演示服务将输入整理成 JSON 执行计划。`build` 不实际编译文件，`inspect` 不读取或检查文件内容；entry 是传给服务的字符串。

## 运行

在仓库根目录安装依赖后执行：

```sh
vp run playground --help
vp run playground --version
vp run playground assets
vp run playground assets build --help
vp run playground assets build app.ts --mode=safe --tag=ci --tag=release
vp run playground assets inspect app.ts
```

build 示例输出：

```json
{ "operation": "build", "entry": "app.ts", "mode": "safe", "tags": ["ci", "release"] }
```

在本应用目录也可以运行：

```sh
vp run start assets build app.ts --mode=safe --tag=ci
vp run test
vp run check
```

参数直接跟在 `playground` 或 `start` 后；命令路径不包含根名称 `tool`。应用中的 `--` 保留终止选项解析的含义，例如：

```sh
vp run playground assets inspect -- --help
```

此时 entry 为字符串 `--help`，输出 inspect 执行计划。

## 输入与响应

| 输入                     | 行为                                                                  |
| ------------------------ | --------------------------------------------------------------------- |
| `assets build <entry>`   | 必填 entry；mode 为 fast 或 safe，默认 fast；tag 可以重复，按顺序收集 |
| `assets inspect <entry>` | 将必填 entry 交给 inspect 服务                                        |
| `--help`、`-h`           | 显示当前节点的定义描述                                                |
| `--version`、`-V`        | 显示应用元数据中的版本                                                |
| 无参数或只有 `assets`    | 显示当前分组及其子命令                                                |

命令路径必须连续，选项属于选中的节点。help/version 在每个节点显式复用同一份普通声明；应用先读取准备结果，按帮助、版本的顺序决定是否响应，再完成输入并调用服务。帮助与版本可以在未提供 entry 时使用，准备阶段的未知选项或非法值仍会报错。

成功响应写入标准输出。Node 入口将选项、位置参数和路由用法错误写入标准错误，并设置退出码 2；其他异常直接传播。

## 结构

| 文件                                   | 职责                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| [src/app.ts](src/app.ts)               | `createWorkspace(services)` 定义命令树与调用流程；`renderDescription` 读取节点描述生成文本 |
| [src/main.ts](src/main.ts)             | 注入演示服务，读取 argv，处理输出和退出状态                                                |
| [tests/app.test.ts](tests/app.test.ts) | 验证帮助、版本、默认值、来源归属及业务服务调用                                             |

`createWorkspace` 返回 `tree` 与 `run(argv)`。tree 保留 core 的定义读取和各阶段入口；run 返回应用的文本或业务结果，不直接访问终端。替换注入的 build/inspect 服务即可接入业务行为，命令定义与应用控制逻辑可以保持独立测试。
