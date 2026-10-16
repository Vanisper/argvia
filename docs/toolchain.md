# Vite+ 模板对照与工程约定

2026-10-16 使用 Vite+ 1.2.0 重新生成 monorepo，对照实际生成文件与库模板，而非手工模拟模板：

```sh
vp create vite:monorepo --directory vp-monorepo-reference --package-manager pnpm --no-interactive --git
```

该模板还会调用远程应用、库模板；同一 CLI 版本在不同日期生成的依赖版本和文件可能不同。

## 对齐模板的约定

| 范围       | 工程约定                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| 工作区     | 保留 `apps/*`、`packages/*`、`tools/*` 三类匹配；目前仅有 parser/core 两个包                                   |
| 包管理     | 使用 `devEngines.packageManager` 管理 pnpm；保留 catalog、Vite override 与 peer dependency 规则                |
| 根命令     | `ready` 依次执行 `vp check`、递归 `test`、递归 `build`                                                         |
| 提交检查   | `prepare: vp config` 安装 hooks；`.vite-hooks/pre-commit` 执行 `vp staged`，暂存规则使用 `vp check --fix`      |
| 根配置     | `vite.config.ts` 管理格式、lint、类型检查与任务缓存；根 `tsconfig.json` 使用模板的简洁配置                     |
| 库配置     | 每个包声明自己的开发依赖、TypeScript 配置和 build/dev/test/check 脚本；构建使用 `vp pack`，声明生成器使用 tsgo |
| Agent 指引 | 保留项目约定，并加入 Vite+ 管理标记内的官方工具使用指引                                                        |

根目录另外提供 `check`、`test`、`build` 快捷脚本。其中测试和构建会进入各包执行，使用包自己的配置。根目录没有默认应用，因此不保留模板的 `website#dev` 脚本；库的监听构建在对应包内执行 `vp run dev`。

## 按项目需要保留的差异

| 差异                                                     | 原因                                                                                                   |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 用 parser/core 替代 website/utils 示例                   | 当前研究方向是 CLI 基础库；不增加示例应用或工具包占位                                                  |
| 包内 `types: []`，仅使用 ECMAScript lib                  | 避免普通源码隐式依赖 Node 或浏览器全局；开发依赖中的 Node 类型供工具配置使用，不决定产品的宿主适配形式 |
| catalog 使用精确版本，保留 `.node-version` 与 CI         | 固定当前可复现的工程基线；Node engines 与 Vite+ 1.2.0 的支持范围一致                                   |
| 包保持 private，不复制模板的作者、仓库、许可证和发布工具 | 尚未确定发布契约，不沿用示例元数据                                                                     |

这些差异不预设后续 API 风格、运行时兼容范围或宿主适配包的划分。

两个包的 TypeScript `include` 同时覆盖 `src` 与 `tests`，让测试中的类型断言也进入检查；源码仍保留 `types: []`。实现能力后均已移除空测试豁免。

## 工作区源码与构建入口

core 通过公开包名依赖 parser，检查与测试在库构建之前执行。两包使用 Vite+ 内置的 `pack.exports.devExports: true`，工作区的 `exports` 直接指向源码，自动生成的 `publishConfig.exports` 指向 dist。

工作区检查、测试和普通包名导入都读取源码，不需要额外的 TypeScript 或 Vite 解析条件。pnpm 打包时应用 `publishConfig.exports`，包消费者读取构建产物。

core 的构建产物保持对 `@argvia/parser` 的外部依赖，不内联一份解析实现。源码验证不依赖旧 dist，产物验证使用实际打包文件的独立消费者检查 JS 和声明。
