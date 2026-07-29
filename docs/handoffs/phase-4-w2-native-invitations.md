# Phase 4 W2 原生邀请读取检查点

> 日期：2026-07-30
> Ticket：10b
> 状态：完成

## 结果

`API-0137 GET /api/invitations` 已从 legacy compatibility backend 切换为独立 API 原生
实现。W2 当前为 2 条 native、20 条 legacy：

```text
TenantReadModule
  -> API-0137: Invitations Module -> PostgreSQL adapter
  -> API-0294: GitHub Stars handler
  -> other 20: fixed legacy-origin compatibility backend
```

Next 原路径仍是 7 行生成式 facade，不 import session、数据库、invitation core 或其他
服务端实现。

## Invitations Module

新模块遵守 Spec 约定的目录边界：

```text
apps/api/src/modules/invitations/
├─ interface/
│  └─ create-list-my-invitations-handler.ts
├─ application/
│  └─ list-my-invitations.ts
├─ ports/
│  └─ invitation-read-repository.ts
└─ index.ts
```

Drizzle 实现在
`apps/api/src/infrastructure/postgres/repositories/drizzle-invitation-read-repository.ts`。
Composition Root 是唯一绑定 port 与 adapter 的位置。

Repository read model 从类型和 SQL select 两层排除 acceptance token。旧实现对每一条邀请
分别查询 grants、organization、inviter；新 adapter 使用两批查询，避免 N+1，同时保持
pending/unexpired、email normalization、排序、组织/邀请人/grant 字段和 ISO date wire
shape。

## Contract 与配置

`@sim/api-contracts/invitations` 新增 V1 invitation/grant/response schema，生成 OpenAPI
component。Contract 测试证明即使输入带 token，解析后的 invitee response 也会移除它。

原 production composition 把 tenant-read authentication 错误绑定到 Environment Module 的
`ENCRYPTION_KEY`。现在 session authentication 单独按 DB + Better Auth secret/base URL
组合；环境变量加密模块未配置时，邀请读取仍不会被迫走 legacy backend。

## 验证

| Gate | 结果 |
| --- | --- |
| Native routes | 2/22 |
| Legacy compatibility routes | 20/22 |
| API tests | 58 passed；1 disposable DB test skipped by default |
| W2 focused tests | 46 passed；1 disposable DB test skipped by default |
| Real PostgreSQL adapter | Postgres 16 disposable container，1/1 |
| API Contract tests | 7/7 |
| Generated W2 coverage | 22/22；backend status clean |
| Platform Contract | 43 schemas |
| API split build entry | 21.32 KiB；invitation adapter lazy chunk 2.42 KiB |
| Full repository type-check | 43/43 tasks |
| Target structure | 37 roots / 27 required files |
| Target cycles | 22 packages / 102 source nodes；0 cycle |

真实 PostgreSQL fixture 覆盖大小写/空格 email 归一化、pending/unexpired 过滤、排除其他
用户与 accepted/expired 数据、organization/inviter/grant hydration 和 token 不泄露。
测试由 `SIM_TEST_DATABASE_DISPOSABLE=1` 明确保护，本次临时 Docker container 已销毁。

## 下一步

继续迁移需要 workspace tenant authorization 的 `API-1057 workspace members`，用现有
request authorization seam + Drizzle access resolver 验证 not-found/access-denied 与旧
wire 差分。随后迁移 Polaris `API-1060 personal-profile`，复用同一个 workspace access
决策，不把 Polaris 的旧 permission utility 搬进 API。
