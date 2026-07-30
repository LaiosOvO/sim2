# W2 API-1009 Workspace Background Work 审计与实现追踪

接口：`GET /api/workspaces/[id]/background-work`  
状态：`pending-independent-review`；实现侧已完成，不计入严格完成数。

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
- [x] production PostgreSQL adapter
- [x] session/validation/gate/admin/error precedence tests
- [x] direct/native route integration and legacy-not-called evidence
- [x] real PostgreSQL tenant/scope/filter/cursor/metadata-stripping fixture
- [x] production composition and W2 metadata
- [x] focused frontend hook and monolith-import removal
- [x] facade/client/browser boundary and build evidence
- [x] handoff and pending-independent-review entry

## 实现结果

- Sim hook 改用本地 `defineRouteContract` focused wrapper；共享 V1 literal 不再伪造
  `body/headers: undefined`。
- `requestJson` 的 type-only import 从全量 contracts barrel 改为 `contracts/types`，focused
  TypeScript 项目由误加载大量服务端 contract 依赖改为小于一秒通过。
- focused browser closure 为 2,908 gzip bytes，且禁止旧 workspace-fork contract、DB、
  Registry、Executor、Sandbox、Next server 与 Node crypto。
- 一次性 PostgreSQL 16 容器验证 direct/metadata/live-child involvement、tenant isolation、
  archived child、kind filter、微秒游标分页、非法游标降级与 metadata 去密，1/1 通过，
  容器已停止。
- 实现交接见 `docs/handoffs/phase-4-w2-native-workspace-background-work.md`；严格完成账本
  等待未参与 agent 审查，不由实现者自行计数。
