# 迁移 W2 租户与成员只读接口

What to build: 迁移 W2 中 workspace/organization/user/access 相关的 22 条低风险只读接口。
Blocked by: 09
Status: ready-for-agent

## What to build

筛选 `Wave = W2` 且顶级领域属于 workspaces、organizations、users、invitations、
permission-groups、workspace-events、stars 的接口。

## Acceptance criteria

- 筛选结果精确为 22 条，coverage report 无遗漏/重复。
- 每条完成共享 contract、独立 API handler、Next 兼容 facade 与观测标签。
- session、tenant isolation、pagination/filter 与 not-found/error differential test 通过。
- 清单要求的 C/A/D/I 测试全部有机器可追踪结果。

## Blocked by

09。
