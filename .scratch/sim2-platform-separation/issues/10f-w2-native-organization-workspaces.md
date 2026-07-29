# W2 原生 Organization Workspaces

Status: completed

## 范围

- `API-0241 GET /api/organizations/[id]/workspaces`
- Organization Module：`interface / application / ports / index.ts`
- organization admin authorization
- Access Control enterprise entitlement
- PostgreSQL organization workspace read
- W2 backend 切换为 native

## 深模块边界

```text
Next generated facade
  -> W2 router
     -> Organizations HTTP interface
        -> ListOrganizationWorkspaces use case
           -> RequestAccessResolver.organizationRole
           -> OrganizationAccessControlEntitlementReader
           -> OrganizationWorkspaceReadRepository
```

Application 不 import Billing、Drizzle、环境变量或 Next。企业权益被压缩为一个
`isEntitled(organizationId)` port；生产 adapter 只读取组织 owner billing-block 与 active
enterprise subscription，并接收 composition 解析后的 runtime flags。

## 兼容语义

- 无 session：`401 {"error":"Unauthorized"}`；
- 非 owner/admin：`403 {"error":"Admin permissions required"}`；
- 无企业权益：`403 {"error":"Access Control is an Enterprise feature"}`；
- repository/未分类异常：`500 {"error":"Internal server error","requestId":"..."}`；
- workspace 按 name 升序；
- 旧接口不排除 archived workspace，本次明确保留。

## 权益判定

1. `BILLING_ENABLED` 关闭：兼容放行；
2. billing 开启、self-host 且 `ACCESS_CONTROL_ENABLED`：兼容放行；
3. 其余环境先检查 organization owner 的 `user_stats.billing_blocked`；
4. owner 未 blocked 时要求 organization reference 的 `active + enterprise` subscription；
5. 数据库异常 fail closed。

## 证据

| Gate | 结果 |
| --- | --- |
| Native backend | 6/22 |
| Legacy compatibility | 16/22 |
| API tests | 78 passed；1 disposable DB test 默认跳过 |
| W2 focused tests | 66 passed；1 disposable DB test 默认跳过 |
| Real PostgreSQL | workspace/order/archive + 4 entitlement branches，1/1 |
| API contract tests | 11/11 |
| Platform contract | 55 schemas |
| Full repository type-check | 43/43 tasks |
| API build | entry 24.56 KiB；workspace adapter 0.64 KiB；entitlement adapter 1.83 KiB |
| Next facade isolation | 22 entries；最大 1,485 gzip bytes |
| Target structure | 47 roots / 43 required files |
| Target cycles | 22 packages / 125 source nodes；0 cycle |

## 后续

Organization authorization 和 entitlement seam 可供 permission-group collection/detail routes
复用。`API-0235 roster` 只要求 organization membership，并且普通 member/admin 返回内容不同，
不能错误复用本接口的 admin + enterprise gate。
