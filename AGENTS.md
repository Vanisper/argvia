# 项目约定

本分支是重新初始化的独立主线。历史分支与归档仅用于研究参考，能力迁移需要先明确行为契约和抽象边界。

## 组成与范围

- 当前仅建立 `@argvia/parser` 与 `@argvia/core`
- 宿主运行适配的职责需隔离，独立包或子入口形式待真实用例评估
- parser 提供独立解析与准备、完成流程；core 提供单命令输入与执行模型，命令树和宿主运行适配尚未实现
- 新接口形式复用统一模型与语义，避免重复解析实现

## 开发

使用 Vite+，统一通过 `vp` 完成安装、检查、测试与库构建。执行 `vp run ready` 验证工程。

parser 与 core 的普通源码入口保持宿主无关。Node 类型仅供工程配置使用；包的 `types: []` 约束需保留。

## 中文与注释

文档和协作说明优先使用中文。源码注释精炼，解释契约、边界与原因；公开 API 的 JSDoc 面向调用者。中文短摘要通常不加句号，Markdown 正文按正常文章使用标点。

不要从历史实现直接推导新的包划分或公共 API。

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
