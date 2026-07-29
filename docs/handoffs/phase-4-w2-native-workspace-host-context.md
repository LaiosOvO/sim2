# Phase 4 Handoff：W2 原生 Workspace Host Context

## 本阶段完成

`API-1041 GET /api/workspaces/[id]/host-context` 已从固定 legacy origin 切为独立 API 原生
Workspaces Module。W2 当前为 native `9/22`、legacy `13/22`。

Sim2 与 Polaris donor route SHA-256 相同，本阶段没有丢失二开差分。

## 解决的边界问题

旧 route 本身很小，但 helper 同时依赖 React cache、workspace permission DB utility、
organization settings access 与 Billing workspace payer/access。新链路为：

```text
Next generated facade
  -> versioned workspace host-context contract
  -> standalone API handler
  -> GetWorkspaceHostContextUseCase
      -> RequestAccessResolver.workspacePermission
      -> WorkspaceHostContextReadRepository
          -> Drizzle host-context snapshot adapter
```

前端兼容侧只接触纯 schema/DTO。独立 API 不 import React、Next、旧 workspace helper 或
legacy Billing Core。

## 保留的兼容语义

- session 验证先于 workspace 解析；
- missing、archived 和 access denied 统一为 403，不泄露 workspace existence；
- host identity、organization membership 和 payer 均来自路由 workspace，不看 session
  active organization；
- organization workspace 使用 owning organization subscription；
- personal workspace 使用 `billedAccountUserId` personal subscription；
- personal priority 为 enterprise > team > pro；
- organization winner 按 `period_start DESC, id DESC`；
- paid flags 需要 `active/past_due`、paid plan 且未 billing-blocked；
- organization block 来自 owner，personal block 来自 billed account user；
- billing interval 优先 column，其次 metadata，最终为 month；
- 未处理错误返回带 requestId 的通用 500。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 9/22 / 13/22 |
| Focused host-context tests | 6/6 |
| API full tests | 96 passed；1 skipped |
| W2 focused tests | 84 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 14/14 |
| Platform contract | 69 schemas |
| Full repository type-check | 43/43 tasks |
| API build | entry 27.22 KiB |
| Host-context chunks | adapter 3.48 KiB；Workspaces module 6.98 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes；forbidden marker 0 |
| Workspaces boundary | 7 module files / 1 adapter / 1 contract；0 violation |
| Target structure | 50 roots / 56 files |
| Target graph | 22 packages / 141 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

## 下一步

优先原生化 `API-1011 credit-availability` 与 `API-1122 usage-gate`。两条路必须复用本阶段
建立的 workspace host/payer seam，并分别建立 credit 与 usage-policy 的窄 ports；不能把旧
Billing barrel 或 `getWorkspaceHostContextForViewer` 再搬进独立 API。
