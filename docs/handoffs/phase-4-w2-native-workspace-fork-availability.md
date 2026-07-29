# Phase 4 Handoff：W2 Native Workspace Fork Availability

## 结果

`API-1031 GET /api/workspaces/[id]/fork/availability` 已从固定 legacy origin 切为独立
Workspace Forking Module。W2 当前为 native `12/22`、legacy `10/22`。

## 边界

- Web/Next facade 仍只有生成式代理和 `{available:boolean}` 合同。
- Forking application 只编排 active workspace context、Enterprise entitlement 和 rollout
  三个窄端口。
- PostgreSQL adapters 分别拥有 workspace context、组织套餐/owner billing-block 与
  platform-admin 读取。
- `extensions/infra/appconfig` 拥有 AWS profile transport、冷请求合并、
  stale-while-revalidate、last-good retention 与纯 gate rule。
- `workspace-forking` 名称、fallback 和 admin 惰性求值归 Forking composition，不建立
  通用 feature registry。
- AWS SDK 只在实际 profile fetch 时动态加载；Executor、Registry、Sandbox、Billing Core、
  Next 和 React 均不进入 Module 闭包。

## 兼容性决定

donor route 调用 `checkWorkspaceAccess`，但没有检查 `hasAccess`；只要 workspace active，
任意 session 都能得到一个不泄露原因的布尔值。原生实现删除了这次无效 permission query，
但保持 observable response。若要改为成员可读，应另立安全变更并补共享/外部用户差分。

Gate 顺序保持：

1. billing off：`FORKING_ENABLED` 显式值优先，否则继承 `ENTERPRISE_ENABLED`，legacy
   default 为 false；
2. billing on：个人 workspace 为 false，组织 workspace 要求 owner 未被 billing-block 且
   active Enterprise；
3. 仅 hosted + 两个 AppConfig identifier 配齐时应用 `workspace-forking` rollout；
4. entitlement、rollout、AppConfig 异常折叠为 false；workspace persistence 异常保持 500。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 12/22 / 10/22 |
| Fork/AppConfig focused tests | 12/12 |
| API full tests | 124 passed；1 skipped |
| W2 focused tests | 112 passed；1 skipped |
| PostgreSQL integration | 1/1 |
| API Contract tests | 16/16 |
| Platform Contract | 80 schemas |
| Full repository type-check | 44/44 tasks |
| API build | 1,141 modules；entry 33.77 KiB |
| Server chunks | Forking 3.36 KiB；rollout 1.24 KiB；admin 0.55 KiB；AWS SDK lazy 约 0.95 MiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Browser closure | Infra Extensions 0；API/Worker 0 |
| Forking boundary | 6 module files / 4 adapters / 1 AppConfig Infra / 1 contract |
| Target structure | 57 roots / 85 required files |
| Target graph | 23 packages / 167 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

## 后续

- API-1034 lineage 先复用 availability gate，再建立窄 lineage read port。
- API-1032 diff 与 API-1037 resources 分别建立 diff/resource read models，不复制旧
  `workspace-forking/authz.ts` 或 lineage registry。
- API-1009 background-work 虽与 Forking UI 同区，但包含后台任务状态，应复用 entitlement
  seam 后建立独立 job-status read port。
- API-0885/0887/1011/1122 继续等待 Billing attribution/ledger/limit-policy foundation。
