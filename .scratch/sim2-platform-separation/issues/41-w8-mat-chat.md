# 迁移 W8.6 MAT Chat 并关闭 W8

What to build: 迁移 W8 最后 1 条 MAT chat 路由并完成 W8 109 条闭环。
Blocked by: 37, 40
Status: ready-for-agent

## What to build

在 PM/MAT contract 稳定后接入 chat/LLM provider port，合并所有 W8 coverage manifest。

## Acceptance criteria

- 本 ticket selector 精确为 1 条。
- W8 六个子波次合并恰为 109 条且互斥、无遗漏。
- stream/cancel/provider error/usage/auth 与 golden conversation tests 通过。
- Web 不导入 LLM SDK；W8 全量 contract/differential/E2E 回归通过。

## Blocked by

37、40。
