# Phase 4 Handoff：W2 原生 Workspace Execution Metrics

## 本阶段完成

`API-1058 GET /api/workspaces/[id]/metrics/executions` 已从固定 legacy origin 切为独立 API
原生 Workspaces Module。W2 当前为 native `11/22`、legacy `11/22`。

Sim2 与 Polaris donor route SHA-256 相同，本阶段没有丢失二开差分。

## 解决的边界问题

旧 route 用 253 行 Next handler 混合 session、workspace access、workflow/log/paused SQL、
all-time bounds、时间分桶与 percentile。新链路为：

```text
Next generated facade
  -> versioned workspace execution-metrics contract
  -> standalone API handler
  -> GetWorkspaceExecutionMetricsUseCase
      -> RequestAccessResolver.workspacePermission
      -> WorkspaceExecutionMetricsReadRepository
          -> Drizzle workflow/bounds/sample adapter
```

Application 拥有 query/time/bucket/percentile 纯规则；adapter 只返回统计所需的小 projection，
不读取 execution payload，也不 import Next、legacy helper、Executor、Registry 或 Sandbox。

## 保留的兼容语义

- session 缺失 401，workspace access 缺失 403；
- start/end 缺省 now-24h/now，segments 缺省 72、范围 1..200；
- workflow/folder/trigger/level 保持逗号分隔行为；
- error/info/running/pending 保持 donor 的 paused join 条件；
- 无 workflow 先返回空结果和 segmentMs 0；
- allTime 无 log 返回每个 workflow 的空 segments；
- end 早于当前时间时 allTime 扩展到 now；
- bucket end 边界、非 error success、duration average 和 p50/p90/p99 算法不变；
- query parse 或 repository 异常保持通用
  `500 { error: "Failed to compute metrics" }`。

## PostgreSQL 时间修正

真实 PostgreSQL 发现 raw `MIN/MAX(timestamp)` aggregate 是无时区字符串，普通 Drizzle
timestamp 是 `Date`。Adapter 在 persistence boundary 将前者明确按 UTC 解码，消除了非 UTC
Node 进程下的 8 小时时间轴漂移。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 11/22 / 11/22 |
| Focused execution-metrics tests | 8/8 |
| API full tests | 112 passed；1 skipped |
| W2 focused tests | 100 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 16/16 |
| Platform contract | 80 schemas |
| Full repository type-check | 43/43 tasks |
| API build | 1,042 modules；entry 30.24 KiB |
| Metrics chunks | Workspaces module 14.50 KiB；adapter 3.86 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes；forbidden marker 0 |
| Workspaces boundary | 10 module files / 3 adapters / 1 contract；0 violation |
| Target structure | 53 roots / 70 files |
| Target graph | 22 packages / 154 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

补充全仓 `bun run test` 仍复现已记录的 Windows 基线失败：Desktop CredentialVault 的
owner-only POSIX mode 断言 expected 0、received 54。本阶段 API、W2、Contract、PostgreSQL
与 TypeScript 门禁均通过；没有将该平台断言误报为本阶段全绿或本阶段回归。

## 下一步

剩余 11 路按 foundation 推进：

- API-1009/1031/1032/1034/1037 先建立 Forking entitlement/AppConfig/authz read foundation；
- API-0885/0887/1011/1122 进入 Billing/usage ledger foundation；
- API-1006 作为 Worker command 迁移；
- API-1056 可在 Inbox entitlement seam 建立后独立迁移。
