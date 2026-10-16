# 默认分支切换

新基础分支为 `next`，其首提交没有父提交。历史 `main`、`explore/command-interface` 和 `feat/core-foundation` 保留作参考。

## 直接使用 next

在 GitHub 仓库设置中将默认分支设为 `next`，或在具备仓库管理权限的本地环境执行：

```sh
gh repo edit Vanisper/argvia --default-branch next
```

这一步不要求改名旧 main，也不需要将两个历史合并。

## 后续复用 main 名称

如果希望新主线最终仍叫 main，先在 GitHub 将旧 main 改名为 `reference/main-initial`，再将 next 改名为 main，并确认默认分支指向新的 main。重命名前核对最新远程状态和规则，使用 GitHub 的分支重命名功能保留引用关系。

新旧历史无共同祖先，切换通过分支管理完成，不通过 PR 合并或强制覆盖旧 main。

CI 对所有推送分支执行，因此可在默认分支切换前验证 next。
