# Workspace

资源操作 CLI 示例，命令树为 `tool → assets → build/inspect`。演示服务将输入整理成 JSON 执行计划，便于观察参数如何传入业务服务；文件编译和内容检查需要接入实际服务。

## 运行

安装工作区依赖后，在仓库根目录执行：

```sh
vp run playground --help
vp run playground --version
vp run playground assets build --help
vp run playground assets build app.ts --mode=safe --tag=ci --tag=release
vp run playground assets inspect app.ts
```

build 示例输出：

```json
{ "operation": "build", "entry": "app.ts", "mode": "safe", "tags": ["ci", "release"] }
```

参数直接跟在 `playground` 后，命令路径从 `assets` 开始。`--` 结束选项解析，例如 `vp run playground assets inspect -- --help` 将字符串 `--help` 作为 entry。

## 命令与响应

| 输入                     | 行为                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `assets build <entry>`   | 必填 entry；mode 为 fast 或 safe，默认 fast；tag 按出现顺序收集 |
| `assets inspect <entry>` | 将必填 entry 交给 inspect 服务                                  |
| `--help`、`-h`           | 显示当前节点的帮助                                              |
| `--version`、`-V`        | 显示应用版本                                                    |
| 无参数或只有 `assets`    | 显示当前分组的命令列表                                          |

每个节点都支持 help/version；同时提供时优先显示帮助。这两个响应允许省略 entry，未知选项和非法选项值仍会报错。

正常响应写入标准输出。输入用法错误写入标准错误，退出码为 2；其他异常直接传播。

## 代码

| 文件                                   | 职责                                           |
| -------------------------------------- | ---------------------------------------------- |
| [src/app.ts](src/app.ts)               | 定义命令树、注入服务与应用响应流程             |
| [src/help.ts](src/help.ts)             | 将当前节点描述渲染为帮助文本                   |
| [src/main.ts](src/main.ts)             | 注入演示服务，读取进程参数，处理输出和退出状态 |
| [tests/app.test.ts](tests/app.test.ts) | 检查帮助、版本、输入和服务调用                 |

`createWorkspace(services)` 返回 `tree` 和 `run(argv)`。替换 build/inspect 服务即可接入业务实现；测试通过注入服务独立检查应用逻辑。

在本应用目录运行：

```sh
vp run start assets build app.ts --mode=safe --tag=ci
vp run test
vp run check
```
