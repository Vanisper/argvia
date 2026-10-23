# 工程约定

项目使用 Vite+ 统一安装、检查、测试与库构建。Node.js 24.19.0、Vite+ 1.2.0、pnpm 12.11.2 构成当前开发基线；锁文件与 catalog 固定依赖版本。

## 工作区与命令

| 范围     | 约定                                                                                               |
| -------- | -------------------------------------------------------------------------------------------------- |
| 工作区   | `apps/*`、`packages/*`、`tools/*`、`playground/*`；核心库位于 `packages/parser` 与 `packages/core` |
| 包管理   | `devEngines.packageManager` 管理 pnpm，版本通过 catalog 统一                                       |
| 检查     | 根 `vp check` 检查格式、lint 与类型                                                                |
| 测试     | 根 `vp run test` 进入各包执行测试                                                                  |
| 构建     | 根 `vp run build` 通过 `vp pack` 构建 ESM 与声明                                                   |
| 示例     | 根 `vp run playground` 运行 Workspace 应用；在应用目录用 `vp run start`                            |
| 完整验证 | `vp run ready` 依次检查、测试和构建                                                                |
| 提交检查 | `prepare: vp config` 安装 hooks，提交前对暂存文件执行 `vp check --fix`                             |

根 `vite.config.ts` 管理格式、lint、类型检查及任务缓存；包内配置管理库构建和测试。监听库构建时，在对应包运行 `vp run dev`。

`playground/*` 中的应用直接通过公开包名使用工作区源码，无需先构建 dist。`vp run playground` 后的参数直接传给 Workspace 应用，示例用法见其 [README](../playground/workspace/README.md)。应用测试纳入根目录的递归测试任务。

## 类型与运行环境

parser 与 core 的 `types: []` 和 ECMAScript lib 约束普通源码的可用全局。Node 类型用于工程配置及 playground 的 Node 宿主，不决定核心库的运行平台。包内 `include` 覆盖实现与测试，使类型断言进入工程检查。

核心库与 playground 应用保持 private。库的发布元数据、许可证、消费者运行时范围及发布流程需要在公开发布前明确。

## 工作区入口与构建产物

core 通过公开包名依赖 parser。两包使用 `pack.exports.devExports: true`：工作区 `exports` 指向源码，自动生成的 `publishConfig.exports` 指向 dist。

工作区检查、测试和包名导入读取源码；pnpm 打包时应用发布导出，独立消费者读取构建产物。core 的构建产物保留对 parser 的外部依赖，不内联第二份解析实现。

源码验证不依赖预先存在的 dist。验证发布产物时，应安装实际打包文件并检查 JS 与声明；当前 CI 执行安装和 `ready`，不将它等同于独立消费者验证。
