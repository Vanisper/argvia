# @argvia/parser 文档

- [归档算法规范](algorithm.md)：完整收录用户提供的算法规范，供研究与比较；开头注明它与当前实现的差异，正文保留归档原文。
- [解析契约](contract.md)：描述当前行为、准备与完成边界、错误和验收范围；使用当前实现时以此为准。
- [解析策略与算法评估](evaluation.md)：解释算法结构、复杂度和消费取舍；不替代行为契约。
- [使用说明](../README.md)：公开入口的使用示例与开发命令。

## 对应源码与验证

| 内容                                       | 源码                          | 测试                                                                                 |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------ |
| 选项识别、绑定、贪婪消费、默认值与重复归约 | [parser.ts](../src/parser.ts) | [parser.test.ts](../tests/parser.test.ts)                                            |
| 值解析协议与组合器                         | [values.ts](../src/values.ts) | [values.test.ts](../tests/values.test.ts)                                            |
| 准备、完成、必填检查与结果归属             | [parser.ts](../src/parser.ts) | [lifecycle.test.ts](../tests/lifecycle.test.ts)                                      |
| 准备态与完成态类型、默认值和动态定义推导   | [types.ts](../src/types.ts)   | [types.test.ts](../tests/types.test.ts)                                              |
| 结构化错误                                 | [errors.ts](../src/errors.ts) | [parser.test.ts](../tests/parser.test.ts)、[values.test.ts](../tests/values.test.ts) |

包的公共出口见 [index.ts](../src/index.ts)。新增能力应同步更新解析契约及对应测试，归档原文继续作为历史研究材料保留。
