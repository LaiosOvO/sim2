# Phase 4 W2 原生 Organization Workspaces 检查点

> 日期：2026-07-30
> Ticket：10f
> 状态：完成

## 结果

`API-0241 GET /api/organizations/[id]/workspaces` 已切换为独立 Organization Module 原生
读取。W2 当前为 6 条 native、16 条 compatibility。

```text
TenantReadModule
  -> API-0137: invitee invitations
  -> API-0241: organization workspaces + admin/enterprise gates
  -> API-0294: GitHub stars
  -> API-1057: workspace members
  -> API-1060: Polaris personal profile
  -> API-1124: workspace invitation management
  -> other 16: fixed legacy-origin compatibility backend
```

## Organization Module

```text
apps/api/src/modules/organizations/
├─ interface/create-list-organization-workspaces-handler.ts
├─ application/list-organization-workspaces.ts
├─ ports/
│  ├─ organization-workspace-read-repository.ts
│  └─ organization-access-control-entitlement-reader.ts
└─ index.ts
```

PostgreSQL adapters 位于：

```text
apps/api/src/infrastructure/postgres/repositories/
├─ drizzle-organization-workspace-read-repository.ts
└─ drizzle-organization-access-control-entitlement-reader.ts
```

## 为什么单独抽 entitlement port

旧 route 通过 permission-group utils 间接拉入 Billing、DB、NextResponse 和环境配置。
目标 application 只问“当前 organization 是否有 Access Control 权益”，具体的 self-host
flag、billing-block、subscription plan/status 全部留在 infrastructure/composition。

这既保留旧行为，又避免 Organization Biz/Application 依赖 Billing 巨型 barrel。

## 行为差分

- owner/admin 才进入 entitlement 检查；
- billing 关闭时兼容放行；
- self-host 显式开启 Access Control 时放行；
- hosted/billing 模式要求未 blocked 的 owner 与 active enterprise subscription；
- workspace 按 name 排序；
- 旧 route 包含 archived workspace，目标没有擅自改变。

## 验证

| Gate | 结果 |
| --- | --- |
| Native routes | 6/22 |
| Legacy routes | 16/22 |
| API tests | 78 passed；1 skipped |
| W2 focused tests | 66 passed；1 skipped |
| PostgreSQL integration | 1/1 |
| API contract tests | 11/11 |
| Platform contract | 55 schemas |
| Full repository type-check | 43/43 tasks |
| API build | entry 24.56 KiB |
| Organization lazy chunks | workspace 0.64 KiB；entitlement 1.83 KiB；config 0.87 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Target structure | 47 roots / 43 files |
| Target graph | 22 packages / 125 source nodes；0 cycle |

## 下一步

迁移 `API-0235 organization roster`。该接口需要将普通 member 的 redacted roster 与
owner/admin 的完整管理 roster 拆成明确 projection，并处理旧 GET 中“顺手把过期邀请写成
expired”的副作用，不能继续把 280 行 DB/映射逻辑留在 HTTP handler。
