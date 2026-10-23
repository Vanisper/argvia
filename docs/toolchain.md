# 工程约定

项目使用 Vite+ 完成依赖安装、检查、测试和库构建。当前开发版本为 Node.js 24.19.0、Vite+ 1.2.0、pnpm 12.11.2，分别由 `.node-version`、workspace catalog 和 `devEngines.packageManager` 管理。

## 工作区与命令

`pnpm-workspace.yaml` 注册 `packages/*` 和 `playground/*`。以下命令在仓库根目录运行：

| 命令                           | 用途                             |
| ------------------------------ | -------------------------------- |
| `vp install --frozen-lockfile` | 按锁文件安装依赖并配置 Git hooks |
| `vp check`                     | 检查格式、lint 和类型            |
| `vp run test`                  | 运行各包测试                     |
| `vp run build`                 | 构建库的 ESM 与类型声明          |
| `vp run ready`                 | 依次执行检查、测试和构建         |
| `vp run playground`            | 启动应用示例                     |

根 `vite.config.ts` 管理格式、lint 和任务缓存。库配置管理 `vp pack`，在库目录运行 `vp run dev` 可监听构建。应用启动任务关闭缓存，每次运行都会执行入口。

`prepare: vp config` 安装 Git hooks；提交时对暂存文件执行 `vp check --fix`。

## 类型检查

库的 tsconfig 使用 `types: []` 和 ECMAScript lib，约束普通源码可用的全局。应用的 Node 入口启用 Node 类型。各包 `include` 覆盖源码与测试，使测试中的类型断言参与检查。

## 包导出与验证

库使用 `pack.exports.devExports: true`：工作区 `exports` 指向源码，构建生成的 `publishConfig.exports` 指向 dist。pnpm 打包时采用发布导出。构建保留包间依赖，通过包名引用其他库。

工作区检查和测试直接使用源码。验证产物时，将实际打包文件安装到独立项目，分别检查 JavaScript 导入与类型声明。

CI 执行锁文件安装和 `vp run ready`。当前工作区包均为 private。
