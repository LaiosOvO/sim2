# W2 原生 Workspace Members

Status: completed

## 范围

- `API-1057 GET /api/workspaces/[id]/members`
- 独立 Workspaces Module：`interface / application / ports / index.ts`
- 统一 request-context authorization seam
- Drizzle workspace member read adapter
- workspace member V1 response contract

## 关键语义

旧实现有两个不能合并的概念：

1. 查看者访问权：显式 workspace permission，或 workspace 所属组织的 owner/admin 继承；
2. 轻量成员列表：只显示 `permissions(entity_type=workspace)` 的显式成员。

因此组织管理员可以读取成员列表，但如果没有显式 workspace permission，不会被凭空加入
`members` response。新实现继续保持这一语义。

## 边界

```text
W2 tenant-read router
  -> Workspaces HTTP interface
     -> ListWorkspaceMembers application use case
        -> @sim/auth authorizeRequestContext
           -> RequestAccessResolver port
        -> WorkspaceMemberReadRepository port
           -> Drizzle PostgreSQL adapter
```

拒绝访问、workspace 不存在和 workspace 已归档统一映射为旧 wire：
`404 {"error":"Workspace not found or access denied"}`，防止资源枚举。

## 证据

| Gate | 结果 |
| --- | --- |
| Native backend | 3/22 |
| API tests | 63 passed；1 disposable DB test 默认跳过 |
| W2 focused tests | 51 passed；1 disposable DB test 默认跳过 |
| PostgreSQL integration | Postgres 16 disposable container，1/1 |
| API contract tests | 8/8 |
| Platform contract | 46 schemas |
| API split build | entry 22.33 KiB；member adapter 0.83 KiB；access resolver 2.85 KiB |
| Full repository type-check | 43/43 tasks |
| W2 inventory | 22/22 C/A/D/I |
| Target structure | 40 roots / 29 required files |
| Target cycles | 22 packages / 108 source nodes；0 cycle |

真实 DB fixture 同时验证显式 read permission、组织管理员派生 admin、跨 workspace 拒绝、
归档 workspace 拒绝，以及显式成员列表不包含仅派生权限的组织管理员。
