# 历史参考

以下分支只提供研究依据，其代码与工程配置不作为新主线的默认实现。

| 分支                                                                                                          | 记录的提交                                 |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| [main](https://github.com/Vanisper/argvia/tree/d3dd2438219032cd37c975a2a3f3fb4d58593d05)                      | `d3dd2438219032cd37c975a2a3f3fb4d58593d05` |
| [explore/command-interface](https://github.com/Vanisper/argvia/tree/f7780e8683bfa477443f6cabb798067d8f203d6b) | `f7780e8683bfa477443f6cabb798067d8f203d6b` |
| [feat/core-foundation](https://github.com/Vanisper/argvia/tree/337a59340c558c746158fbdeed2cf75532ed4862)      | `337a59340c558c746158fbdeed2cf75532ed4862` |

相关归档包括《CLI 选项与参数解析规范》、`cli-kv-parser-source.zip` 和 `argvia-source.zip`。归档用于研究算法、边界和验证资产，后续采用的行为以新主线中明确的契约为准。

初始化使用 Vite+ 1.2.0 的官方 `vite:monorepo` 模板，随后移除示例 website/utils，整理为 parser/core 工作区。pnpm 锁文件固定实际依赖版本。
