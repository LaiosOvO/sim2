# Phase 4 Handoff：W2 原生 User Permission Group

## 本阶段完成

`API-0243 GET /api/permission-groups/user` 已从固定 legacy origin 切为独立 API 原生
Permission Groups Module。W2 当前为 native `8/22`、legacy `14/22`。

Sim2 与 Polaris donor route SHA-256 相同，本阶段没有丢失二开差分。

## 解决的边界问题

旧 route 为返回 permission-group metadata/config，直接 import Billing、workspace permission
utility 与 EE `permission-check`。后者可达 Executor types、Block access、Provider model
parser、环境 flags 和 command enforcement errors；复用它会把执行闭包重新带入读取链。

新 seam 为：

```text
Next generated facade
  -> versioned permission-group contract
  -> standalone API handler
  -> GetUserPermissionGroupUseCase
      -> RequestAccessResolver
      -> OrganizationAccessControlEntitlementReader
      -> UserPermissionGroupReadRepository
          -> Drizzle group-winner adapter
```

浏览器兼容侧只接触纯 schema/DTO。Config 默认值和 invalid auth-type stripping 也在纯 contract
normalizer 内完成，不 import DB、Executor、Registry 或环境配置。

## 保留的兼容语义

- session 验证先于 query 验证；
- active workspace missing 与 access denied 分别返回 404/403；
- personal workspace 在 access check 后返回 null group/config；
- role 和 entitlement 按 workspace owning organization，而非 caller active organization；
- non-entitled organization 不执行 group resolution；
- winner 顺序为 explicit member > zero-member/all-members > organization default > none；
- 冲突按 `created_at ASC, id ASC` 取最老记录；
- 未处理错误返回带 requestId 的通用 500。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 8/22 / 14/22 |
| Focused permission-group tests | 6/6 |
| API full tests | 90 passed；1 skipped |
| W2 focused tests | 78 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 13/13 |
| Platform contract | 65 schemas |
| Full repository type-check | 43/43 tasks |
| API build | entry 26.55 KiB |
| Permission-group chunks | adapter 2.37 KiB；module 8.38 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes；forbidden marker 0 |
| Target structure | 50 roots / 51 files |
| Target graph | 22 packages / 137 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

## 下一步

继续按 W2 inventory 优先迁移能复用现有 tenant/access seam 的只读接口。每条接口保留
donor 差分审计、原生 contract/use case/adapter、真实 PostgreSQL fixture 和 facade closure
gate；禁止为了复用旧 helper 把 Executor、Registry 或 Provider 实现重新带回 metadata 路径。
