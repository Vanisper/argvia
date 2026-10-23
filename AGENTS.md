# 项目约定

Argvia 用统一定义连接参数解析、命令组合、结构化读取与类型化执行。新增能力先明确行为契约和抽象边界。

## 组成与范围

- 核心库为 `@argvia/parser` 与 `@argvia/core`；`playground/*` 存放独立的私有应用示例
- parser 提供独立选项解析、值协议、来源及准备与完成流程
- core 提供命令树、显式路由、只读定义与分阶段调用；节点选项各自独立，共享采用声明复用
- 应用通过普通选项与元数据实现帮助、版本等逻辑；核心不赋予这些名称特殊含义
- playground 通过公开包名消费核心库，应用逻辑与宿主入口分开，应用测试放在对应示例包内
- 宿主职责隔离，发布位置依据实际消费需求确定
- 新语法入口共用定义模型和解析语义，业务配置及领域规则归应用

## 开发

使用 Vite+，统一通过 `vp` 完成安装、检查、测试与库构建。执行 `vp run ready` 验证工程；在仓库根目录用 `vp run playground` 运行 Workspace 示例。

parser 与 core 的普通源码入口保持宿主无关，库包的 `types: []` 约束需保留。工程配置和 playground 的 Node 宿主可以使用 Node 类型。

## 中文与注释

文档和协作说明优先使用中文。源码注释精炼，解释契约、边界与原因；公开 API 的 JSDoc 面向调用者。中文短摘要通常不加句号，Markdown 正文按正常文章使用标点。

文档围绕当前模型组织。迁移时更新引用并删除旧文件，不保留兼容跳转或占位页。归档资料作为研究来源，不直接决定包划分或公共 API。

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
