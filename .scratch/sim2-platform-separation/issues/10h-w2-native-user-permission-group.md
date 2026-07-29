# Ticket 10h：W2 原生 User Permission Group

## 范围

- Inventory：`API-0243`
- 方法/路径：`GET /api/permission-groups/user?workspaceId=...`
- Donor：
  - `D:\workspace\workflow\sim2\apps\sim\app\api\permission-groups\user\route.ts`
  - `D:\polaris\apps\sim\app\api\permission-groups\user\route.ts`
- 两份 route SHA-256：
  `2D5E9EEF9361990206962303ACB62AF458F477531313CFF8F7C3B310CBFC577E`

## 已确认兼容语义

1. 只接受 session；无 session 返回 `401 { error: "Unauthorized" }`。
2. 缺失/空 `workspaceId` 返回 `400 { error: "workspaceId is required" }`。
3. active workspace 不存在返回 `404 { error: "Workspace not found" }`。
4. workspace 存在但 caller 无有效权限返回
   `403 { error: "Not a member of this workspace" }`。
5. personal workspace（`organizationId = null`）在完成 access check 后直接返回：
   - group/config 全部 null；
   - `entitled=false`；
   - `organizationId=null`；
   - `isOrgAdmin=false`。
6. organization 与管理员身份必须按 workspace 的 owning organization 解析，不能使用 caller
   active organization。
7. organization 未获得 enterprise entitlement 时不查询 permission group，返回
   `entitled=false`，但仍返回 owning organization id 与 `isOrgAdmin`。
8. entitlement 后的 group 优先级是：
   1. 针对该 workspace、caller 是显式 member 的最老 non-default group；
   2. 针对该 workspace、完全没有显式 member 的最老 non-default group；
   3. organization default group；
   4. none。
9. 冲突脏数据按 `permission_group.created_at ASC, id ASC` 决定最老 winner。
10. JSON config 必须补齐 legacy 默认值并过滤无效 auth-type 数组值。
11. 未处理异常沿 `withRouteHandler` 返回
    `500 { error: "Internal server error", requestId }`。

## 当前编译污染证据

旧 route 为读取一个 config，直接 import：

- NextResponse 与 Next Auth；
- Billing barrel；
- workspace permissions utility；
- `ee/access-control/utils/permission-check.ts`。

最后一个文件不仅包含 group resolver，还同时 import Executor types、Block access、Provider
model 解析、环境 flags 和多种 command validation error。若直接搬迁/复用，会重新形成用户指出的
“只拿 metadata/config，却加载完整服务端 registry/executor 闭包”。

## 目标 seam

1. `packages/api-contracts/src/permission-groups.ts`
   - 完整 V1 config/response schema；
   - 纯数据默认值与 normalization，不 import DB/Executor/Registry。
2. `apps/api/src/modules/permission-groups`
   - 一个 `GetUserPermissionGroupUseCase` external interface；
   - application 负责 workspace/access/org/entitlement 短路顺序；
   - repository port 只负责 active workspace context 与 group winner。
3. PostgreSQL adapter
   - group query保留明确优先级与 oldest tie-break；
   - 不 import 旧 EE permission-check。
4. 复用：
   - `RequestAccessResolver`；
   - `OrganizationAccessControlEntitlementReader`。

## 测试计划

- auth/query/404/403 顺序；
- personal workspace 短路；
- external member 与 owning organization scope；
- admin role + non-entitled 短路；
- explicit member > empty group > default > none；
- oldest group tie-break；
- config 默认值/invalid auth type；
- generic 500 requestId；
- full W2 routing；
- disposable PostgreSQL integration；
- contract/facade/build/graph/full type gates。

## 验收结果

| Gate | 结果 |
| --- | --- |
| Native / legacy | 8/22 / 14/22 |
| Focused API-0243 tests | 6/6 |
| API full tests | 90 passed；1 skipped |
| W2 focused tests | 78 passed；1 skipped |
| PostgreSQL 16 integration | 1/1；覆盖 explicit/empty/default 优先级与 oldest tie-break |
| API contract tests | 13/13 |
| Platform contract | 65 schemas；生成产物 clean |
| Full repository type-check | 43/43 tasks |
| API build | entry 26.55 KiB；adapter 2.37 KiB；permission-group module chunk 8.38 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes；forbidden marker 0 |
| Target structure | 50 roots / 51 required files |
| Target graph | 22 packages / 137 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

结论：API-0243 已原生化，前端 facade 仅依赖版本化 contract。旧 EE permission-check、
Executor、Block、Provider model parser 与环境 enforcement 均不在新读取链路中。
