# Phase 4 W2 原生 Workspace Members 检查点

> 日期：2026-07-30
> Ticket：10c
> 状态：完成

## 结果

`API-1057 GET /api/workspaces/[id]/members` 已从 legacy origin 切换为独立 API 原生查询。
W2 当前为 3 条 native、19 条 compatibility：

```text
TenantReadModule
  -> API-0137: Invitations Module
  -> API-0294: GitHub Stars handler
  -> API-1057: Workspaces Module + workspace authorization
  -> other 19: fixed legacy-origin compatibility backend
```

Next 的动态 route 仍是生成式 7 行 facade，不 import permission utility、Drizzle、
Better Auth、Executor 或 Registry。

## Workspaces Module

```text
apps/api/src/modules/workspaces/
├─ interface/
│  └─ create-list-workspace-members-handler.ts
├─ application/
│  └─ list-workspace-members.ts
├─ ports/
│  └─ workspace-member-read-repository.ts
└─ index.ts
```

PostgreSQL adapter 位于
`apps/api/src/infrastructure/postgres/repositories/drizzle-workspace-member-read-repository.ts`。
Application 依赖 `RequestAccessResolver` 和 member repository 两个窄接口；Composition Root
绑定现有 Drizzle access resolver 和新 read adapter。

## 权限与展示列表不可混淆

访问判断复用 `@sim/auth/authorization`：

- 显式 workspace `read|write|admin` 可读；
- workspace 所属组织的 `owner|admin` 通过现有 effective permission 规则可读；
- workspace 不存在、归档或无权限都对客户端隐藏为 404。

成员 response 仍只来自显式 workspace `permissions` 行。组织管理员的派生权限只用于
authorization，不会自动把其资料加入 UI 成员列表。这保持 Sim2 当前行为，也阻止权限模型
重构意外改变头像/owner cell 数据。

## Contract 与错误兼容

`@sim/api-contracts/workspaces` 新增 workspace ID、轻量 member 和 response V1 schema。
Response 只含 `userId/name/image`，会移除 `permissionType` 等服务端权限细节。

错误保持：

- 无 session：`401 {"error":"Authentication required"}`；
- missing/archived/denied：`404 {"error":"Workspace not found or access denied"}`；
- authorization/repository 异常：`500 {"error":"Failed to fetch workspace members"}`。

## 验证

| Gate | 结果 |
| --- | --- |
| Native routes | 3/22 |
| Legacy compatibility routes | 19/22 |
| API tests | 63 passed；1 disposable DB test skipped by default |
| W2 focused tests | 51 passed；1 disposable DB test skipped by default |
| Real PostgreSQL adapters | Postgres 16 disposable container，1/1 |
| API Contract tests | 8/8 |
| Generated W2 coverage | 22/22；backend status clean |
| Platform Contract | 46 schemas |
| API split build | entry 22.33 KiB；member adapter 0.83 KiB；access resolver 2.85 KiB |
| Full repository type-check | 43/43 tasks |
| Target structure | 40 roots / 29 required files |
| Target cycles | 22 packages / 108 source nodes；0 cycle |

真实 PostgreSQL fixture 覆盖：

- viewer 显式 read permission；
- 组织管理员无显式 permission 时派生 admin；
- 跨 workspace 无权限；
- archived workspace 即使仍有旧 permission 也拒绝；
- member adapter 只返回显式成员，不返回仅有派生权限的组织管理员。

## 下一步

迁移 Polaris `API-1060 GET /api/workspaces/[id]/personal-profile`。它必须复用本 Ticket 的
workspace authorization seam，并把 Polaris external identity 查询放到 Identity/Workspace
read port；不能直接 import Polaris 的 `assertActiveWorkspaceAccess` 或 Feishu SDK。
