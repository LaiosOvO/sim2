# 迁移 W3 Public v1 命令与数据接口

What to build: 迁移 W3 中顶级领域 v1 的 52 条接口。
Blocked by: 09, 12
Status: ready-for-agent

## What to build

复用统一 API-key middleware、rate limit、workspace access 与 versioned error contract。

## Acceptance criteria

- selector 精确命中 52 条。
- API key 作用域、撤销、rate-limit、租户隔离、分页与错误兼容测试通过。
- 文件/流式特例遵守 boundary annotation 和 B/S 测试。
- 独立 API 对外兼容，Next facade 可逐路由回滚。

## Blocked by

09、12。
