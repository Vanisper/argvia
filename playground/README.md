# Playground

应用示例通过公开包接口使用 Argvia。每个子目录是一个私有工作区包，包含应用代码、运行入口和测试。

| 应用                             | 说明                               |
| -------------------------------- | ---------------------------------- |
| [Workspace](workspace/README.md) | 多级资源命令、帮助与版本、服务注入 |

在仓库根目录运行 `vp run playground --help` 启动 Workspace 示例。各应用目录也提供 `vp run start` 入口，测试随根目录的 `vp run test` 执行。
