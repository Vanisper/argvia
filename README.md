# Argvia

面向 TypeScript CLI 的可组合基础能力。一份定义连接输入解析、命令组合、结构化读取与类型化执行。

## 工作区

| 路径              | 定位                                                   |
| ----------------- | ------------------------------------------------------ |
| `packages/parser` | `@argvia/parser`，选项识别、值绑定、值协议与来源记录   |
| `packages/core`   | `@argvia/core`，命令树、显式路由、定义快照与分阶段调用 |
| `docs`            | 架构、接口与工程约定                                   |

命令通过 `createCommand` 定义，通过 `createGroup` 组合。每个节点公开只读的 `definition`；调用者可以读取整棵定义树，也可以使用 `prepare → complete → execute` 处理一次输入。帮助、版本等能力由应用使用普通选项与元数据构建。

两个包的普通入口接收显式数据，保持宿主无关。配置合并、业务规则与进程操作由应用组织。当前包保持 private。

## 开发

开发基线为 Node.js 24.19.0、Vite+ 1.2.0、pnpm 12.11.2。Node 开发版本保存在 `.node-version`；包消费者的兼容范围需要单独验证。

安装 [Vite+ CLI](https://viteplus.dev/guide/global-cli) 后执行：

```sh
vp install --frozen-lockfile
vp run ready
```

`ready` 依次执行格式、lint、类型检查、各包测试及 ESM 与声明构建。也可单独运行 `vp run check`、`vp run test`、`vp run build`。安装时启用 Git hooks，提交前对暂存文件执行检查。

## 文档

- [Core 使用说明](packages/core/README.md)
- [命令组合与调用契约](packages/core/docs/command-contract.md)
- [Parser 使用说明](packages/parser/README.md)
- [Parser 文档索引](packages/parser/docs/README.md)
- [接口模型](docs/interfaces.md)
- [架构与职责](docs/architecture.md)
- [工程约定](docs/toolchain.md)
- [后续验收方向](docs/roadmap.md)
- [参考资料](docs/references.md)
