# Ticket 10k：W2 原生 Workspace Execution Metrics

## 剩余 W2 复核

API-0209 后剩余 12 条 legacy route 分为四组：

1. Billing/ledger foundation：
   - API-0885 user usage limits；
   - API-0887 user usage logs；
   - API-1011 workspace credit availability；
   - API-1122 workspace usage gate。
2. Workspace Forking foundation：
   - API-1009 background work；
   - API-1031 fork availability；
   - API-1032 fork diff；
   - API-1034 fork lineage；
   - API-1037 fork resources。
   这些路共享 Enterprise/self-host entitlement、AppConfig rollout 和 fork authorization，
   不应逐路复制 `ee/workspace-forking/lib/lineage/authz.ts`。
3. Worker command：
   - API-1006 workspace-events poll 实际执行 cron auth、Redis lock、detached polling 和写入，
     应迁到 Worker job，而不是继续当作普通 tenant read repository。
4. 可独立迁移的 read model：
   - API-1056 inbox tasks 仍依赖 Max-plan entitlement；
   - API-1058 workspace execution metrics 只依赖 workspace access 与 PostgreSQL read model。

本阶段选择 API-1058。原因不是“代码最少”，而是旧 route 有 253 行，直接在 Next 中混合
鉴权、过滤 SQL、paused execution join、all-time bounds、时间分桶和 percentile projection；
它不需要 Billing、Provider、Executor、Registry 或 Sandbox，适合收敛为一个独立深模块。

## 范围

- Inventory：`API-1058`
- 方法/路径：
  `GET /api/workspaces/[id]/metrics/executions`
- Donor：
  - `D:\workspace\workflow\sim2\apps\sim\app\api\workspaces\[id]\metrics\executions\route.ts`
  - `D:\polaris\apps\sim\app\api\workspaces\[id]\metrics\executions\route.ts`
- 两份 route SHA-256：
  `20C3722395EE88B09C3FB6593E657A8DEA972AF87864F4364FCD108F5DF10A6F`

## 已确认兼容语义

1. session 缺失返回 `401 { error: "Unauthorized" }`。
2. query：
   - startTime/endTime 可选，缺省为 now-24h/now；
   - segments 经 number coercion，范围 1..200，缺省 72；
   - workflowIds/folderIds/triggers/level 为逗号分隔字符串；
   - allTime 只接受 `true|false`。
3. 无效 Date 或有 workflow 时 start >= end：
   `400 { error: "Invalid time range" }`。
4. 无 workspace access：
   `403 { error: "Forbidden" }`。
5. workflow filter 先限定 workspace，再应用 folder/workflow IDs。
6. 无 workflow 时返回空 workflows、原 start/end 和 segmentMs 0。
7. level 兼容：
   - error = level error；
   - info = level info 且 endedAt 非空；
   - running = level info 且 endedAt 为空；
   - pending = level info 且 paused row 尚未 fully resumed；
   - 未识别 level 不增加过滤条件。
8. allTime 先按 workflow/trigger/level 过滤求 startedAt min/max；max 早于 now 时 end 扩到 now。
9. 有 workflow 但 allTime 无 log 时返回每个 workflow 的空 segments，start/end 为 now，
   segmentMs 0。
10. bucket 数等于 segments；边界按 floor 分桶，最后一个 bucket 吸收 end 边界。
11. 非 error 都计为 successful；duration 只统计 number。
12. avg 四舍五入；p50/p90/p99 使用排序数组和 donor 的 floor index 算法。
13. 未处理异常（含 query schema parse 失败）返回
    `500 { error: "Failed to compute metrics" }`。

## 目标 seam

```text
packages/api-contracts/src/workspaces.ts

apps/api/src/modules/workspaces/
├─ interface/create-get-workspace-execution-metrics-handler.ts
├─ application/get-workspace-execution-metrics.ts
└─ ports/workspace-execution-metrics-read-repository.ts

apps/api/src/infrastructure/postgres/repositories/
└─ drizzle-workspace-execution-metrics-read-repository.ts
```

Application 拥有 query normalization、time range、bucket 和 percentile 纯规则；repository
只拥有 workspace-scoped workflow、bounds 和 filtered sample 查询。Module 不 import
Drizzle/DB/Next/legacy route，adapter 不 import Executor/Registry/Sandbox。

## 测试计划

- default/explicit/allTime time range；
- query parse failure、invalid Date、start >= end；
- session/access order；
- workflow/folder/trigger/level filter normalization；
- no-workflow 与 allTime-no-log 分支；
- bucket boundary、success、avg/p50/p90/p99；
- generic 500 envelope；
- full API-1058 native routing；
- disposable PostgreSQL integration：workspace scope、filters、paused state、bounds；
- contract/generated/facade/boundary/build/graph/full type gates。

## 已完成实现

`API-1058` 已切为 native；W2 当前为 native `11/22`、legacy `11/22`。实现按目标 seam
落地，并将 Workspaces boundary gate 从只检查 host-context adapter 扩展为同时检查 member、
host-context 与 execution-metrics 三个 adapters。

真实 PostgreSQL 首轮测试发现 `MIN/MAX(timestamp)` 的 raw aggregate 返回无时区字符串，
而普通 Drizzle timestamp 字段返回 `Date`。Asia/Shanghai 进程会让二者相差 8 小时。Adapter
现在只在 persistence 边界把无时区 aggregate 明确按 UTC 解码，避免 all-time bounds 与
sample 时间轴漂移。

## 验收证据

| Gate | 结果 |
| --- | --- |
| Focused API-1058 tests | 8/8 |
| API full tests | 112 passed；1 skipped |
| W2 focused tests | 100 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 16/16 |
| Platform contract | 80 schemas |
| Full repository type-check | 43/43 tasks |
| API build | 1,042 modules；entry 30.24 KiB |
| Execution metrics chunks | Workspaces module 14.50 KiB；adapter 3.86 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Workspaces boundary | 10 module files / 3 adapters / 1 contract；0 violation |
| Target structure | 53 roots / 70 required files |
| Target graph | 22 packages / 154 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |
| Supplemental full-repo test | API/Contract 等通过；仍复现既有 Windows Desktop vault POSIX mode 断言（expected 0 / received 54） |
