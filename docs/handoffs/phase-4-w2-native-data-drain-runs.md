# Phase 4 Handoff：W2 原生 Data Drain Runs

## 本阶段完成

`API-0209 GET /api/organizations/[id]/data-drains/[drainId]/runs` 已从固定 legacy origin
切为独立 API 原生 Data Drains Module。W2 当前为 native `10/22`、legacy `12/22`。

Sim2 与 Polaris donor route SHA-256 相同，本阶段没有丢失二开差分。

## 解决的边界问题

旧 route 同时依赖 Next、Auth、DB/Drizzle、Data Drain access helper 与 serializer；
access helper 又混合 membership、部署开关、Enterprise entitlement 与角色错误映射。
新链路为：

```text
Next generated facade
  -> versioned Data Drain run contract
  -> standalone API handler
  -> ListDataDrainRunsUseCase
      -> RequestAccessResolver.organizationRole
      -> DataDrainEntitlementReader
      -> DataDrainRunReadRepository
          -> organization-scoped Drizzle adapters
```

前端兼容侧只接触纯 schema/DTO。独立 API 读取链不 import Next/Auth implementation、
legacy Billing/Data Drain helper、destination registry、Executor 或 Sandbox。

## 保留的兼容语义

- 只接受 session，且认证/membership 先于 query validation；
- billing-disabled/self-hosted 未显式开启时返回 deployment 404；
- hosted billing 模式要求 active Enterprise，且 owner billing-block 会拒绝；
- entitlement 之后仍要求 organization owner/admin；
- `limit` 兼容 donor 的 parseInt 行为，范围 1..200、缺省 25；
- drain 必须属于路由 organization，否则统一 404；
- runs 按 `startedAt DESC` 并应用 limit；
- 时间转 ISO，null 保留，缺失 locators 归一为空数组；
- 未处理错误返回带 requestId 的通用 500。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 10/22 / 12/22 |
| Focused Data Drain tests | 8/8 |
| API full tests | 104 passed；1 skipped |
| W2 focused tests | 92 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 15/15 |
| Platform contract | 76 schemas |
| Full repository type-check | 43/43 tasks |
| API build | 1,039 modules；entry 29.31 KiB |
| Data Drain chunks | module 6.10 KiB；run adapter 1.35 KiB；entitlement adapter 1.69 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes；forbidden marker 0 |
| Data Drains boundary | 5 module files / 2 adapters / 1 contract；0 violation |
| Target structure | 53 roots / 66 files |
| Target graph | 22 packages / 150 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

## Billing 路线决策

`API-1011 credit-availability` 与 `API-1122 usage-gate` 暂不直接迁移。二者必须先共享一个
Billing read-model foundation，明确拆分 attribution snapshot、payer/member ledgers、
daily refresh、plan/goodwill/on-demand limit 和 failure policy；不能复制
`checkAttributedUsageLimits` 或 legacy Billing Core。

## 下一步

优先建立上述 Billing foundation，或继续迁移不依赖该 foundation 的 W2 只读接口。
任一路线都必须先更新 coverage/matrix，再补 donor/native 差分、真实数据层 fixture、
boundary/build 和全仓 type-check。
