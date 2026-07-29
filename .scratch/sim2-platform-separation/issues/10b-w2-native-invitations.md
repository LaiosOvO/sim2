# W2 原生邀请读取

Status: completed

## 范围

- `API-0137 GET /api/invitations`
- 独立 Invitations Module：`interface / application / ports / index.ts`
- PostgreSQL invitation read adapter
- invitee-facing V1 response contract
- session authentication → W2 router → native handler

## 边界结论

旧路由同时 import Next、session、invitation core 和数据库 hydration。目标实现拆成：

```text
W2 tenant-read router
  -> Invitations HTTP interface
     -> ListMyInvitations application use case
        -> InvitationReadRepository port
           -> Drizzle PostgreSQL adapter
```

Repository port 的返回类型不包含 acceptance token。Drizzle adapter 也不 select token，并把
旧 `hydrateInvitation` 的逐行 organization/inviter/grant 查询改成：

1. 一批基础 invitation + organization + inviter；
2. 一批 invitation grants + workspace name。

## 行为兼容

- session 必须包含 user email，否则保持 `401 {"error":"Unauthorized"}`；
- email 使用 trim + lower 归一化；
- 只返回 pending 且尚未过期的邀请；
- 日期保持 ISO string；
- repository 失败保持 `500 {"error":"Failed to list invitations"}`；
- wire response 与归一化旧实现 fixture 相同；
- 结果和版本化 contract 均不包含 token。

## 配置解耦

Tenant-read 的 session authentication 现在只要求 DB + Better Auth secret/base URL，不再被
Environment Module 的 `ENCRYPTION_KEY` 配置阻断。各 Module 按自己的配置 readiness
fail-closed，避免一个不相关模块让原生只读 API 回退旧服务。

## 证据

| Gate | 结果 |
| --- | --- |
| Native backend | 2/22 |
| API tests | 58 passed；常规运行跳过 1 个 disposable DB test |
| W2 focused tests | 46 passed；常规运行跳过 1 个 disposable DB test |
| Invitation PostgreSQL integration | Postgres 16 disposable container，1/1 |
| API contract tests | 7/7 |
| Platform contract | 43 schemas |
| API split build | entry 21.32 KiB；invitation adapter lazy chunk 2.42 KiB |
| Full repository type-check | 43/43 tasks |
| W2 inventory | 22/22 C/A/D/I |
| Target structure | 37 roots / 27 required files |
| Target cycles | 22 packages / 102 source nodes；0 cycle |

PostgreSQL test 只有 `SIM_TEST_DATABASE_DISPOSABLE=1` 时运行，防止测试 DDL 误触非一次性
数据库。本地证据使用临时 Docker container，测试完成后已删除。
