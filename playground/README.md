# Playground

通过 Argvia 的公开包接口构建独立应用，验证命令定义、输入处理与宿主集成。每个子目录都是私有工作区包，包含应用代码、运行入口与应用测试。

| 应用                             | 内容                                                       |
| -------------------------------- | ---------------------------------------------------------- |
| [Workspace](workspace/README.md) | 多级资源命令、普通帮助与版本选项、服务注入和 JSON 执行计划 |

在仓库根目录安装依赖后运行：

```sh
vp install --frozen-lockfile
vp run playground --help
vp run playground assets build app.ts --mode=safe --tag=ci
```

`vp run playground` 启动 Workspace 应用，后续参数原样传入。也可以进入对应应用目录执行 `vp run start`。示例通过 `@argvia/core`、`@argvia/parser` 包名导入，无需预先构建库。

应用逻辑接收显式输入和注入服务；宿主入口负责进程参数、输出和退出状态。应用测试随根目录 `vp run test` 执行，完整工程检查使用 `vp run ready`。
