# Ticket 10i：W2 原生 Workspace Host Context

## 范围

- Inventory：`API-1041`
- 方法/路径：`GET /api/workspaces/[id]/host-context`
- Donor：
  - `D:\workspace\workflow\sim2\apps\sim\app\api\workspaces\[id]\host-context\route.ts`
  - `D:\polaris\apps\sim\app\api\workspaces\[id]\host-context\route.ts`
- 两份 route SHA-256：
  `7CC3BE77C4A7638F01CDC2A5C15F547307E7C1003A8327DBADC0F1C7A10AC767`

## 为什么优先

剩余 W2 中，`API-1041` 是 `API-1011 credit-availability` 与 `API-1122 usage-gate` 的共同
前置 seam。先迁移 host context，可以让后两条复用稳定的 workspace payer/host identity，
避免各自重新穿过旧 Billing barrel、React cache 和 workspace permission utility。

## 已确认兼容语义

1. 只接受 session；无 session 返回 `401 { error: "Unauthorized" }`。
2. workspace id 通过 route contract 校验。
3. active workspace 不存在、归档或 caller 没有 effective permission 均返回
   `403 { error: "Workspace access denied" }`，不区分不存在与越权。
4. workspace context 必须来自路由 workspace，不能使用 session active organization。
5. 返回 workspace 的 id、name、mode 与 `billedAccountUserId`。
6. `hostOrganizationId` 来自 workspace owning organization；personal workspace 为 null。
7. viewer permission 为显式权限与 owning organization admin inheritance 的 effective winner。
8. host organization member/admin 也按 owning organization 解析；external collaborator 均为
   false，不能按 active organization 误判。
9. owner billing payer：
   - organization workspace 使用 owning organization subscription；
   - personal workspace 使用 `billedAccountUserId` personal subscription；
   - 只认 `active` / `past_due`；
   - personal 优先级为 enterprise > team > pro；
   - organization 同一 reference 取 `period_start DESC, id DESC`。
10. paid flags 同时要求 paid plan、entitled status 且 payer 未 billing-blocked。被 block 时仍
    返回原 plan/status，但 `isPaid/isPro/isTeam/isEnterprise` 全为 false。
11. organization payer 的 block 状态来自该 organization owner；personal payer 来自 billed
    account user。缺失 owner/stats 默认未 block。
12. billing interval 优先 subscription column，其次 metadata 中的 `year`，默认 `month`。
13. 未处理异常沿统一 route wrapper 返回
    `500 { error: "Internal server error", requestId }`。

## 当前边界问题

旧 route 本身只有 29 行，却 import `lib/workspaces/host-context.ts`。该 helper 又同时进入：

- React `cache`；
- workspace permission DB utility；
- organization settings access；
- Billing workspace payer、subscription priority、plan helpers 与 billing block。

这不是 Executor/Registry 污染，但仍是“轻量 metadata route 依赖大型服务端实现闭包”的同类
边界问题。若直接复用，独立 API 会继续依赖 Next/React 与旧 Billing Core，后续
credit-availability/usage-gate 也无法形成稳定模块边界。

## 目标 seam

1. `packages/api-contracts/src/workspaces.ts`
   - host context、workspace mode/permission、owner billing 的纯 V1 schema。
2. `apps/api/src/modules/workspaces`
   - `GetWorkspaceHostContextUseCase` 负责 session actor、effective access 与纯 projection；
   - `WorkspaceHostContextReadRepository` 一次隐藏 workspace、membership、subscription 和
     billing-block snapshot。
3. PostgreSQL adapter
   - 只依赖 DB schema/Drizzle；
   - 精确保留 payer scope、subscription priority 与 block source；
   - 不 import React、Next、legacy Billing 或 workspace helper。
4. 后续 `API-1011` / `API-1122`
   - 复用同一 host-context application seam 或更窄 payer snapshot port；
   - 禁止重新 import 旧 `getWorkspaceHostContextForViewer`。

## 测试计划

- session auth 与 403 concealment；
- owning organization 不受 active organization 干扰；
- external collaborator/member/admin projection；
- organization active/past_due subscription 与 newest tie-break；
- personal enterprise > team > pro priority；
- owner/personal billing block、reason 与 paid flag；
- billing interval column/metadata/default；
- contract stripping 与 generic 500 requestId；
- full API-1041 native routing；
- disposable PostgreSQL integration；
- contract/facade/build/graph/full type gates。

## 验收结果

| Gate | 结果 |
| --- | --- |
| Native / legacy | 9/22 / 13/22 |
| Focused API-1041 tests | 6/6 |
| API full tests | 96 passed；1 skipped |
| W2 focused tests | 84 passed；1 skipped |
| PostgreSQL 16 integration | 1/1；覆盖 org newest、personal priority、block source、archive |
| API contract tests | 14/14 |
| Platform contract | 69 schemas；生成产物 clean |
| Full repository type-check | 43/43 tasks |
| API build | entry 27.22 KiB；adapter 3.48 KiB；Workspaces module chunk 6.98 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes；forbidden marker 0 |
| Workspaces boundary | 7 module files / 1 adapter / 1 contract；0 violation |
| Target structure | 50 roots / 56 required files |
| Target graph | 22 packages / 141 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

结论：API-1041 已原生化。前端 facade 仍只依赖版本化 contract；独立 API 的读取链不再
import React cache、Next、旧 workspace permission utility 或 legacy Billing Core。
