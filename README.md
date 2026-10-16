# Argvia

面向 TypeScript CLI 的可组合基础能力。

本分支从 Vite+ 官方 monorepo 模板重新初始化，拥有独立提交历史。历史分支和归档继续作为研究参考，见 [参考资料](docs/references.md)。

当前只完成工程骨架，包入口尚无运行时 API。

## 工作区

| 路径              | 定位                                                     |
| ----------------- | -------------------------------------------------------- |
| `packages/parser` | `@argvia/parser`，研究 argv 识别、绑定、值解析与来源记录 |
| `packages/core`   | `@argvia/core`，组织命令定义、路由、帮助和调用流程       |
| `docs`            | 抽象边界、后续步骤与历史参考                             |

宿主运行适配需要独立的职责边界；它最终采用 core 子入口、独立包还是其他组合方式，待实际需求验证。目前不创建 `@argvia/node`。

## 开发

开发基线为 Node.js 24.19.0、Vite+ 1.2.0、pnpm 12.11.2。Node 开发版本保存在 `.node-version`；包消费者的兼容范围随实现单独验证。

安装 [Vite+ CLI](https://viteplus.dev/guide/global-cli) 后执行：

```sh
vp install --frozen-lockfile
vp run ready
```

常用命令：

```sh
vp run check
vp run build
vp run test
```

`check` 包含格式、lint 和类型检查；`test` 递归执行各包的测试；`build` 通过 `vp pack` 构建各库的 ESM 与声明。`ready` 按检查、测试、构建的顺序执行。当前尚无业务测试，各包配置暂时允许空测试集；实际能力实现时补充对应验证。

安装时的 `prepare` 脚本通过 `vp config` 启用 Git hooks，提交前运行 `vp staged`，对暂存文件执行 `vp check --fix`。

全部包保持 private。库构建和工具链使用 [Vite+](https://github.com/voidzero-dev/vite-plus)，不额外引入独立任务调度器。

## 设计与分支

- [组成与抽象边界](docs/architecture.md)
- [Vite+ 模板对照与工程约定](docs/toolchain.md)
- [开发顺序](docs/roadmap.md)
- [历史参考](docs/references.md)
- [默认分支切换](docs/branch-transition.md)
