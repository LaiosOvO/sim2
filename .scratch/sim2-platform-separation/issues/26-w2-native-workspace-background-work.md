# W2 API-1009 Workspace Background Work 审计与实现追踪

接口：`GET /api/workspaces/[id]/background-work`  
状态：`pending-independent-re-review`；三个 review blocker 已整改，不计入严格完成数。

## Donor 结论

Sim2 与 Polaris 的 route、background-work store、前端 hook 和 monolithic workspace-fork
contract 完全一致：

| 文件 | SHA256 |
| --- | --- |
| route | `3E19A1FD299FCD75FC41E90D2A935E502366D6628ED17B1DDFA0FCD2B3768896` |
| store | `BFF018CFC420A805C723CFE100BF67E8AF33933B58FCB17B5398313C5AC5F988` |
| hook | `2E84E1A6AD7A98073B8491964A73125A2277B38DA981239054BDD2709392F3C8` |
| contract | `84BF295C30ABD671386FEF4CA7A89B0808B9B95815865DC2339E03D17C997E71` |

### 请求与错误顺序

冻结顺序：

```text
session
  -> params/query parse
  -> active workspace + effective permission
  -> deployment / Enterprise / AppConfig gate
  -> workspace admin
  -> background-work read
```

- 无 session：`401 {"error":"Unauthorized"}`。
- `id` 仅要求非空字符串。
- query `cursor` 是 optional string。
- query `limit` 使用 `Math.min(Math.max(Number(value) || 50, 1), 100)`；默认 50、上限 100。
- 同一 scalar query key 重复时，donor 将其表示为数组并由 string schema 返回 400；target
  transport 现在保留这一完整表示，不再用 `searchParams.get()` 静默取首值。
- validation：`400 {"error":"Validation error","details":[...]}`。
- typed 403/404：donor `withRouteHandler` 返回 `{error, requestId}`。
- unexpected：`500 {"error":"Internal server error","requestId}`。

### Query 语义

成功请求固定两次 PostgreSQL read：

1. 读取未 archived、`forkedFromWorkspaceId = workspaceId` 的 child workspace IDs；
2. keyset 分页读取 `background_work_status`。

第二个查询的 “involving workspace” 是以下 OR：

- row `workspaceId` 是当前 workspace；
- `metadata.childWorkspaceId` 是当前 workspace；
- `metadata.otherWorkspaceId` 是当前 workspace；
- row 属于当前 workspace 的 live child，且 kind 是 `fork_sync`/`fork_rollback`。

排序为 `updatedAt DESC, id DESC`，读取 `limit + 1`。cursor 保存 PostgreSQL
`updated_at::text` 的微秒精度与 id，支持旧 ISO cursor。非法 cursor 降级为第一页，不返回
400/500。

### Response 与泄密边界

响应为 `{items, nextCursor}`。Item 只包含：

- id/workspaceId/workflowId；
- kind/status/message/error；
- allowlisted metadata；
- ISO startedAt/completedAt。

metadata 可能来自 jsonb，新的 V1 contract 必须解析并剥离未知字段；不能把未知 secret、token、
credential 或执行 state 透传给浏览器。

## 前端问题与目标

donor `background-work.ts` 从 816 行、35,173 bytes 的
`apps/sim/lib/api/contracts/workspace-fork.ts` 运行时导入合同。目标实现必须提供独立
`@sim/api-contracts/workspace-background-work` subpath，并让真实 hook 改用 focused contract。
API/adapter、DB、Registry、Executor、Sandbox 不能进入 client closure。

## 冻结的深模块

```text
ListWorkspaceBackgroundWorkUseCase.execute
  -> WorkspaceBackgroundWorkReader.listInvolving
    -> Drizzle/PostgreSQL adapter
```

- application 复用 Workspace Forking 的 current-access 与共享 gate；
- port 一次调用返回 page，不向 application 泄漏“两次 SQL”的编排；
- adapter 隐藏 child lookup、OR scope、keyset/cursor、排序和 over-fetch；
- handler 只负责 session、URL extraction、HTTP/error mapping；
- focused client 只消费 versioned contract。

## 验收追踪

- [x] focused versioned contract 与 compatibility tests
- [x] application/port/handler
- [x] repeated cursor/limit donor-compatible 400 与 auth-before-validation 测试
- [x] production PostgreSQL adapter
- [x] session/validation/gate/admin/error precedence tests
- [x] direct/native route integration and legacy-not-called evidence
- [x] real PostgreSQL tenant/scope/filter/cursor/metadata-stripping fixture
- [x] production composition and W2 metadata
- [x] focused frontend hook and monolith-import removal
- [x] facade/client/browser boundary and build evidence
- [x] source-bound focused cold/incremental compile evidence and executable ratchet
- [x] handoff and pending-independent-review entry

## 实现结果

- Sim hook 改用本地 `defineRouteContract` focused wrapper；共享 V1 literal 不再伪造
  `body/headers: undefined`。
- `requestJson` 的 type-only import 从全量 contracts barrel 改为 `contracts/types`，focused
  TypeScript 项目由误加载大量服务端 contract 依赖改为小于一秒通过。
- focused browser closure 为 2,898 gzip bytes，且禁止旧 workspace-fork contract、DB、
  Registry、Executor、Sandbox、Next server 与 Node crypto。
- focused Vite watch 使用真实 hook 入口，最终 raw sample 为 cold 97 ms、临时编辑真实
  hook 后 incremental 36 ms；runner 恢复源码并校验 SHA-256。固定 ratchet 为 cold
  2,000 ms、incremental 750 ms，已接入 root package 与 test-build CI，单测 2/2 通过。
- 最终测量时共享 worktree 中另有 `bunx tsc --noEmit`，更早的证据窗口还观察到独立 Next
  dev :3110；因此这些是真实、source-bound 的本机样本，但不是稳定跨机器 baseline。并发
  verification 曾达到 cold 1,025 ms，证明初始 1,000 ms 上限不足以容纳共享 runner 噪声；
  最终 2,000/750 ms 仍严于项目 10,000/1,000 ms 目标。
- package contract 的旧证据 3,877 bytes 已校正为当前实测 3,873 bytes。
- 整页 `/workspace/[workspaceId]/settings/[section]` 的 Next cold trace 仍为 84,067.2 ms，
  HTTP 请求 92,907.36 ms、RSS 9,109,176,320 bytes，并因共享 layout 拖入
  `remote-sandbox/daytona.ts` 后遇到残缺的本地 `@daytona/sdk` 安装而返回 500。因此没有
  声称 Next incremental、成功 page-open 或关键交互达标；原始证据与 claim limit 见
  `docs/testing/evidence/api-1009-next-route-cold-attempt-raw.json`。
- 一次性 PostgreSQL 16 容器验证 direct/metadata/live-child involvement、tenant isolation、
  archived child、kind filter、相同 timestamp 的 id tie-break、同一 JavaScript 毫秒内
  `...123456 -> ...123455` 跨页、非法游标降级与 metadata 去密。测试通过 Drizzle 实际
  query logger 证明小数据集与增加 250 rows 后都固定为两条 SQL；1/1 通过，容器已停止。
- 实现交接见 `docs/handoffs/phase-4-w2-native-workspace-background-work.md`；严格完成账本
  等待未参与 agent 审查，不由实现者自行计数。

## 独立审查整改记录（2026-07-30）

`docs/reviews/API-1009-workspace-background-work.md` 的三个 `changes-required` 阻断项均已
按原范围整改：

1. repeated `cursor`/`limit` 不再静默取首值；有 session 时返回 donor-compatible 400，
   无 session 时仍先返回 401，workspace access/reader 都不会被调用。
2. 新增 source-bound focused Vite watch cold/incremental 原始证据、固定预算、可执行
   ratchet、单测和 CI 接线；3,877 bytes 旧值已校正为 3,873。整页 Next 失败样本独立落盘，
   未伪造 incremental/page-open/interaction。
3. PostgreSQL fixture 把相同 timestamp、微秒 cursor 放到实际跨页边界，并对 7/257 rows
   的实际 Drizzle SQL 数量固定为 2。

最终验证：workspace-background-work contract 4/4、API-1009 focused 11/11、full API
210 passed/5 skipped、real PostgreSQL 1/1、API contracts 20/20、focused/full TypeScript、
API build、Workspace Forking boundary、target structure、W2 coverage/facades、focused client
isolation、lightweight/browser closure、strict API validation、Biome 与 diff check 均通过。
性能 raw sample 为 97/36 ms；最终复跑 ratchet 为 87/34 ms。独立 reviewer 已给出
functional route `approved`，API-1009 已进入 accepted ledger；Next 整页冷启动仍未达标。
