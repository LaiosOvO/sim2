# Ticket 10j：W2 原生 Data Drain Runs

## 选路决策

API-1041 之后审计了：

- `API-1011 /api/workspaces/[id]/credit-availability`
- `API-1122 /api/workspaces/[id]/usage-gate`

两条 route 虽然复用 host-context，但下游 `checkAttributedUsageLimits` 同时包含 immutable payer
attribution、actor/payer billing block、账期 usage ledger、组织 pooled usage、member cap、
daily refresh、goodwill/on-demand limit 与不同 fail-open/fail-closed 规则。此时直接复制旧
Billing Core 会形成第二个重型注册表，违反本次重构边界。

因此两条接口保留在 W2，但先阻塞于独立 Billing read-model foundation：

1. 版本化 billing attribution snapshot；
2. payer/member usage ledger ports；
3. daily refresh 与 plan-limit 纯领域规则；
4. enforcement 与 display projection 分离；
5. 使用同一 fixture 对旧 Billing Core 做差分后再原生切流。

本阶段改迁较独立的 `API-0209`，继续减少 legacy origin。

## 范围

- Inventory：`API-0209`
- 方法/路径：
  `GET /api/organizations/[id]/data-drains/[drainId]/runs?limit=...`
- Donor：
  - `D:\workspace\workflow\sim2\apps\sim\app\api\organizations\[id]\data-drains\[drainId]\runs\route.ts`
  - `D:\polaris\apps\sim\app\api\organizations\[id]\data-drains\[drainId]\runs\route.ts`
- 两份 route SHA-256：
  `D32B87B375CDBF2EFE681CE558B38A95ECD2A86368C152103F4A22B0FF1ED54A`

## 已确认兼容语义

1. 只接受 session；无 session 返回 `401 { error: "Unauthorized" }`。
2. 鉴权先于 query validation。
3. caller 不是目标 organization member：
   `403 { error: "Forbidden - Not a member of this organization" }`。
4. self-host/billing-disabled 且 `DATA_DRAINS_ENABLED` 未开启：
   `404 { error: "Data Drains are not enabled on this deployment" }`。
5. hosted/billing-enabled 时目标 organization 必须有 active Enterprise：
   `403 { error: "Data Drains are available on Enterprise plans only" }`。
6. member 通过 entitlement 后仍必须是 owner/admin；普通 member：
   `403 { error: "Forbidden - Only organization owners and admins can view data drains" }`。
7. params 非空；`limit` 是整数 1..200，缺省 25。validation envelope 保留 400。
8. drain 必须同时匹配 `drainId` 与 route organization；否则：
   `404 { error: "Data drain not found" }`。
9. runs 按 `startedAt DESC`，应用 limit。
10. wire 字段为 id/drainId/status/trigger/startedAt/finishedAt/rowsExported/
    bytesWritten/cursorBefore/cursorAfter/error/locators；时间为 ISO，null 保留，locators 缺失
    归一为空数组。
11. 未处理异常返回 `500 { error: "Internal server error", requestId }`。

## 当前边界问题

旧 37 行 route 同时 import Next、Auth、DB schema、Drizzle、Data Drain access helper 与
serializer。Access helper 又把 session、organization membership、deployment flag、
Enterprise subscription 和 role error response 混在一起；若复制会让 transport、policy 与
persistence 继续无法独立测试。

## 目标 seam

1. `packages/api-contracts/src/data-drains.ts`
   - 只包含 run/response/params/query V1 schema。
2. `apps/api/src/modules/data-drains`
   - handler：session、params/query 与兼容错误 envelope；
   - use case：固定 membership -> deployment/entitlement -> role -> drain -> runs 顺序；
   - ports：
     - `DataDrainRunReadRepository`
     - `DataDrainEntitlementReader`
3. PostgreSQL adapters
   - entitlement adapter 只读 active Enterprise；
   - run adapter 用 organization-scoped drain existence 和 bounded run query；
   - 不 import Next、Auth、legacy Billing/Data Drain helper 或 destination registry。

## 测试计划

- auth/membership/deployment/enterprise/role/query/drain-not-found 顺序；
- default/explicit/invalid limit；
- organization-scoped drain；
- timestamp/null/locators projection；
- generic 500 requestId；
- full API-0209 native routing；
- disposable PostgreSQL integration；
- contract/facade/build/graph/full type gates。

## 已完成实现

```text
packages/api-contracts/src/data-drains.ts

apps/api/src/config/data-drain-runtime.ts
apps/api/src/modules/data-drains/
├─ interface/create-list-data-drain-runs-handler.ts
├─ application/list-data-drain-runs.ts
├─ ports/data-drain-entitlement-reader.ts
├─ ports/data-drain-run-read-repository.ts
└─ index.ts

apps/api/src/infrastructure/postgres/repositories/
├─ drizzle-data-drain-entitlement-reader.ts
└─ drizzle-data-drain-run-read-repository.ts

scripts/architecture/import-boundaries/
└─ check-data-drains-module-boundary.ts
```

`API-0209` 已切为 native；W2 当前为 native `10/22`、legacy `12/22`。Data Drain
destination config/serializer/dispatcher registry 没有进入新读取链。Query 仍兼容 donor 的
`Number.parseInt` 行为、缺省 25 与 1..200 边界。

## 验收证据

| Gate | 结果 |
| --- | --- |
| Focused API-0209 tests | 8/8 |
| API full tests | 104 passed；1 skipped |
| W2 focused tests | 92 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 15/15 |
| Platform contract | 76 schemas |
| Full repository type-check | 43/43 tasks |
| API build | 1,039 modules；entry 29.31 KiB |
| Data Drain chunks | module 6.10 KiB；run adapter 1.35 KiB；entitlement adapter 1.69 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Data Drains boundary | 5 module files / 2 adapters / 1 contract；0 violation |
| Target structure | 53 roots / 66 required files |
| Target graph | 22 packages / 150 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |
