# W2 原生 Workspace Invitation Management Read

Status: completed

## 范围

- `API-1124 GET /api/workspaces/invitations`
- 复用 Invitations Module，但建立独立 management-list port/use case/handler
- 显式 workspace permission 与组织 owner/admin 派生 workspace 可见性
- archived workspace 排除
- 原有管理 wire token 兼容

## 为什么不能与 API-0137 合并

`API-0137 /api/invitations` 是 invitee-facing pending list，只按当前账号 email 查询，其 port
从类型层禁止 token。`API-1124` 是已登录用户对其可访问 workspace 的邀请管理列表，旧
cancel/resend UI 消费 token。两者共享 PostgreSQL adapter 但使用两个窄 port：

```text
InvitationReadRepository
  -> listPendingForEmail(email)             # token-free

WorkspaceInvitationReadRepository
  -> listForAccessibleWorkspaces(userId)    # legacy management token
```

不得为减少文件数而建立一个同时暴露所有字段的宽返回类型。

## 可见性语义

1. 读取用户显式 `permissions(entity_type=workspace)` 的 active workspace；
2. 读取用户唯一组织 membership；role 为 owner/admin 时派生该组织 active workspace；
3. 去重 workspace ID；
4. 只返回 grant 指向这些 workspace 的 invitation rows；
5. 不按 pending/unexpired 过滤，因为旧管理列表包含 accepted/expired 等状态。

## 兼容响应

- 无 session：`401 {"error":"Unauthorized"}`；
- 无可访问 workspace：`200 {"invitations":[]}`；
- 查询异常：`500 {"error":"Failed to fetch invitations"}`；
- V1 contract 保留旧 route 实际 select 的 13 个字段并剥离额外字段。

## 证据

| Gate | 结果 |
| --- | --- |
| Native backend | 5/22 |
| Legacy compatibility | 17/22 |
| API tests | 72 passed；1 disposable DB test 默认跳过 |
| W2 focused tests | 60 passed；1 disposable DB test 默认跳过 |
| Real PostgreSQL | explicit/derived/no-access/archived，1/1 |
| API contract tests | 10/10 |
| Platform contract | 52 schemas |
| API build | entry 23.36 KiB；invitation adapter 4.25 KiB lazy chunk |
| Full repository type-check | 43/43 tasks |
| Next facade isolation | 22 entries；最大 1,485 gzip bytes |
| Target structure | 44 roots / 36 required files |
| Target cycles | 22 packages / 116 source nodes；0 cycle |

## 后续

继续剩余 17 条 W2 原生 read。`API-1123 POST /api/workspaces/invitations/batch` 属于 W3
command，不能因为共用目录而提前混入本 read Ticket；其邮件、审计、billing 与 transaction
side effects 必须在 command migration 中单独验收。
