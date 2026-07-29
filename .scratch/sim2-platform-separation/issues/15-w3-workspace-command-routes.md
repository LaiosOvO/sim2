# 迁移 W3 Workspace 命令接口

What to build: 迁移 W3 中顶级领域 workspaces 的 46 条接口。
Blocked by: 10
Status: ready-for-agent

## What to build

把 workspace 写操作、成员/设置/资源变更放入 API module application service，并保持事务与审计。

## Acceptance criteria

- selector 精确命中 46 条。
- tenant isolation、角色变更、并发更新、幂等与事务回滚有自动测试。
- Next facade 与独立 API 的状态码、header、错误 envelope 和副作用一致。
- coverage report 和清单 C/A/D/I 要求全部通过。

## Blocked by

10。
