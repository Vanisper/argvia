# Argvia

用于 TypeScript CLI 的参数解析与命令组合库。

| 工作区                                      | 用途                           |
| ------------------------------------------- | ------------------------------ |
| [@argvia/parser](packages/parser/README.md) | 选项解析、值转换与来源记录     |
| [@argvia/core](packages/core/README.md)     | 命令树、结构化定义与分阶段调用 |
| [Playground](playground/README.md)          | 使用公开接口构建的应用示例     |

## 开发

安装 [Vite+ CLI](https://viteplus.dev/guide/global-cli) 后，在仓库根目录执行：

```sh
vp install --frozen-lockfile
vp run ready
```

`ready` 执行格式、lint、类型检查、测试和库构建。工具版本、工作区导出及产物验证见[工程约定](docs/toolchain.md)。

## 运行示例

```sh
vp run playground --help
```

命令用法和应用结构见 [Workspace 示例](playground/workspace/README.md)。

[架构](docs/architecture.md)说明包之间的依赖与职责，[参考资料](docs/references.md)保存研究来源。
