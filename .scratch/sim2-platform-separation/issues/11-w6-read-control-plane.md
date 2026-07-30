# W6 Execution Read Control Plane：6/11 路由审计与冻结设计

状态：donor 审计与原生迁移设计已冻结；尚未实现。

目标接口：

| API ID | 方法与路径 | 实际性质 |
| --- | --- | --- |
| API-0138 | `GET /api/jobs/[jobId]` | Job 状态只读 |
| API-0282 | `GET /api/resume/[workflowId]/[executionId]` | Paused execution detail 只读别名 |
| API-0283 | `GET /api/resume/poll` | **有副作用的 cron command，不是 read** |
| API-0993 | `GET /api/workflows/[id]/executions/[executionId]` | Execution status/output 只读 |
| API-0996 | `GET /api/workflows/[id]/paused/[executionId]` | Paused execution detail 只读 |
| API-0997 | `GET /api/workflows/[id]/paused` | Paused execution list 只读 |

完成这组后，W6 native coverage 为 `6/11 = 54.5%`。但架构上必须如实区分五条 query 和一条
command，不能因为 HTTP method 都是 GET 就把 API-0283 塞入 Execution Read Module。

## 1. 总结论

1. 六个 route 文件在 Sim2 与 Polaris 逐文件 SHA256 完全一致。
2. API-0282 与 API-0996 是同一个 paused-detail use case 的两个路径别名：
   - 参数名分别为 `workflowId` 与 `id`；
   - 成功/404 合同相同；
   - unexpected 500 的 donor envelope 有细微差别。
3. API-0282、API-0993、API-0996、API-0997 都通过
   `validateWorkflowAccess(..., requireDeployment=false)`：
   - 先查 workflow，后做 hybrid auth；
   - 支持 internal JWT、API key、session；
   - workspace API key 还要匹配 workflow workspace；
   - 最后要求 canonical workflow read permission。
4. API-0138 读当前配置的 job backend：
   - database backend 直接读 PostgreSQL `async_jobs`；
   - Trigger.dev backend 调第三方 `runs.retrieve`；
   - 当前没有 Redis job read。
5. Paused detail/list 的 durable source of truth 是 PostgreSQL
   `paused_executions` + `resume_queue`，API 可直接读投影，不需要 Worker RPC。
6. API-0993 的 source of truth 是 PostgreSQL execution log；重 payload 可能需要从 object
   storage materialize。它不需要 Executor 或 Worker RPC。
7. API-0283 会获取 Redis distributed lock、读取/写入 paused state、做 admission、
   enqueue resume 并启动 `executeResumeJob`。它必须迁到 Worker；API 只保留 cron auth 和
   internal command/RPC adapter，或者让 scheduler 直接调用 Worker。
8. donor 把 paused read methods 放在 2675+ 行的 `PauseResumeManager` 中。该文件顶层导入
   billing、event buffer、preprocessing、logging、`execution-core`、完整 Executor 和 serializer，
   所以三个纯读 route 仅为了两条 SQL 与纯 projection 就把整个执行系统拖入 server compile。
   原生迁移必须提取纯 read model，不能导入该 manager。
9. 五条 query 可以归入一个深 Execution Read Module，并由多个 handler 复用；但不要做一个
   “万能 reader port”。Module 内保留四个小 use case 和按数据源划分的 ports。

## 2. Sim2 / Polaris 证据

### 2.1 Route SHA256

| API | Route SHA256 | Sim2/Polaris |
| --- | --- | --- |
| API-0138 | `497FF65034A5C322405449B22F8062E83D3416A38C6A4211BC88C723AAEEF66B` | 相同 |
| API-0282 | `8716E5B7A15EE44BF72B73AAB466CAC653F4D18370ABFC877DD131F7CA138816` | 相同 |
| API-0283 | `C3BC76AE1EB3BBD0151EEABC1FC17AA179C436D87A24342B362EAE7813025C4A` | 相同 |
| API-0993 | `B062FD798EC4B9C9FC0BA23B6B5E7CCAF18A3CE0384B876AF173EB317BE55150` | 相同 |
| API-0996 | `F253B769859B2C733B6797AEE3067353281BDD4F69620F4F9BC399094955B51F` | 相同 |
| API-0997 | `A826E4CB6557E8D126B0E40D533F1689D72B80969356577645DB56C08EA3FE02` | 相同 |

### 2.2 Helper / contract 分叉

| 文件 | Sim2 SHA256 | Polaris SHA256 | 本组相关结论 |
| --- | --- | --- | --- |
| `lib/api/contracts/common.ts` | `68E47FED45BC147C10D931DFF38A60FBCBE38DA4DC04726A0D5940EFAB52792D` | 相同 | Job contract 无分叉 |
| `lib/api/contracts/workflows.ts` | `F3EC4C488EF562C393799D25C17319324A43F8A731818A0BE6BFCE3343C2C5FD` | `3E0D649858E7F8C9425B99ACA7ECE59EAF627233AE8014279158A7CBCC8D1FCC` | 全文件因 Polaris 其他扩展分叉；本组 schemas/contracts 无差异 |
| `human-in-the-loop-manager.ts` | `1D4C8F691F9726313058C5EC04ACFF6F2362E14FD002418B4427FACB7ACB7532` | `318170BB084F6A0C2B712B9C0D34B3D8D1907EED3EAE15241E704B6AE81A8540` | 全文件因执行扩展分叉；本组 list/detail/normalize methods 无差异 |
| `trace-store.ts` | `B930461F92D3668FAADC85EFCDE16EFE78866988B034893C8E1553DBF2C1EE2C` | 相同 | Object-store materialization 无分叉 |
| `async-jobs/config.ts` | `1393F698490909B0ECBA2154F2936B0EC2F6E7921611DFDD984E759855FA256A` | 相同 | Job backend selection 无分叉 |

因此这六条不需要在 Sim2/Polaris 行为中二选一；目标以共同语义迁移。Polaris 的其他
execution 扩展不得通过复制整个 manager 偷渡进 Read Module。

## 3. 共用 workflow auth 的精确行为

API-0282/0993/0996/0997 都先由 route contract 解析参数/查询，然后调用
`validateWorkflowAccess(request, workflowId, false)`。

内部顺序：

```text
read workflow by id
  -> workflow missing: 404 Workflow not found
  -> workflow.workspaceId missing:
       403 This workflow is not attached to a workspace...
  -> hybrid auth:
       internal Bearer JWT
       OR X-API-Key
       OR session cookie
  -> auth failure: 401
  -> workspace API key must match workflow.workspaceId: 403
  -> canonical authorizeWorkflowByWorkspacePermission(action=read)
  -> denied: authz-provided status/message
```

风险与冻结：

- donor 在 auth 前查询 workflow，所以未认证 caller 能区分不存在 workflow 与存在但需要认证；
- donor routes 也在 auth 前 validation；
- 原生平台一贯要求 auth-before-validation。实现时需要 differential test 明确是否保留 donor
  precedence。建议安全升级为“先完成 hybrid identity，后做 workflow lookup/authz”，但必须作为
  W6 统一兼容决策一次性应用四条 route，不能各自漂移。
- 无论是否调整 precedence，workflow read authorization 都要在任何 execution/paused DB read
  之前完成。

## 4. API-0138：Job Status

### 4.1 Auth / validation

donor 顺序：

```text
validate non-empty jobId
  -> checkHybridAuth(requireWorkflowId=false)
  -> load job from configured backend
  -> authorize from job.metadata
```

认证支持 internal JWT、API key、session。失败：

- invalid params：`400 Validation error`；
- auth 失败：`401`，error 使用 hybrid auth message 或 `Authentication required`；
- job missing：`404 Task not found`。

metadata authorization：

1. 有 `metadata.workflowId`：
   - canonical workflow read authorization；
   - denied -> `403 Access denied`；
   - workspace API key 额外读取 workflow，要求其 workspace 等于 key workspace；
   - 不同时 -> `403 API key is not authorized for this workspace`。
2. 无 workflowId、但有 `metadata.userId`：
   - 必须等于 authenticated user id；
   - 否则 `403 Access denied`。
3. workflowId/userId 都没有：
   - `403 Access denied`。
4. workflowId 与 userId 同时存在时，以 workflow branch 为准，不再要求 userId 相等。

### 4.2 Backend

- Database backend：PostgreSQL `async_jobs WHERE id = ? LIMIT 1`；
- Trigger.dev backend：`runs.retrieve(jobId)` 第三方读取；
- 不读 Redis；
- 不需要 Worker RPC；
- backend 选择由 deployment config 决定，不能由 browser 参数决定。

### 4.3 Wire

成功：

```json
{
  "success": true,
  "taskId": "job-id",
  "status": "pending | processing | completed | failed",
  "metadata": {},
  "output": {},
  "error": "optional"
}
```

- `metadata` 原样返回，optional/nullable；
- `output` 任意 JSON，只有不为 `undefined` 才返回；
- `error` 只有不为 `undefined` 才返回；
- response schema `.passthrough()`；
- backend 异常 message 含 `not found` 时 donor 映射 404，其余
  `500 Failed to fetch task status`。

风险：

- authorization 完全依赖 job metadata 的正确写入；
- output/metadata 可能包含大 payload 或 secret；
- Trigger.dev adapter 从 payload 重建的 metadata 与 database row metadata 不完全对称；
- 原生 `JobStatusReader` 应只返回授权需要的 ownership descriptor 与 public projection；
  不应把完整 job payload 暴露给 application。

## 5. API-0282 / API-0996：Paused Execution Detail

两条 route 调同一方法：

```text
getPausedExecutionDetail({workflowId, executionId})
```

### 5.1 数据查询

1. PostgreSQL `paused_executions`：
   - `workflow_id = workflowId`
   - `execution_id = executionId`
   - `LIMIT 1`
2. 命中后 PostgreSQL `resume_queue`：
   - `parent_execution_id = executionId`
   - `ORDER BY queued_at ASC`

无需 Redis、Object Storage、Worker RPC 或 Executor。

### 5.2 Projection

queue entry：

```text
id
pausedExecutionId
parentExecutionId
newExecutionId
contextId
resumeInput
status
queuedAt / claimedAt / completedAt -> ISO|null
failureReason -> string|null
```

pause point：

- donor 将 object-map 转为数组；
- 过滤掉 `pauseKind = time`，detail API 只显示 human pause；
- 缺省 `resumeStatus -> paused`；
- 缺省 `pauseKind -> human`；
- block id 去掉 `/_loop\d+/g` suffix；
- `resumeLinks.uiUrl` 去 query string；
- 注入 queuePosition 与相同 context 的 latest resume entry。

summary：

```text
id, workflowId, executionId, status
totalPauseCount
resumedCount = human pausePoints 中 resumeStatus=resumed 的数量
pausedAt, updatedAt, expiresAt -> ISO|null
metadata
triggerIds = executionSnapshot.triggerIds || []
pausePoints
```

detail 再增加：

```text
executionSnapshot
queue
```

若 DB row 不存在，或过滤 time pause 后 human points 为 0，都返回
`404 Paused execution not found`。

### 5.3 两条别名的 error 差异

- API-0282 用 try/catch，unexpected 500 会把 `error.message` 下发；
- API-0996 让 `withRouteHandler` 处理，unexpected 500 为稳定
  `Internal server error + requestId`。

原生实现应共享同一个 use case 和 safe 500 envelope。建议收敛到 API-0996 的安全行为，避免
API-0282 泄漏数据库/内部错误；需要 differential test/ADR 记录这是安全修复。

### 5.4 Payload 风险

`executionSnapshot: unknown` 可能包含完整 workflow/execution state、inputs、variables 与大量
中间数据。即使 caller 有 workflow read 权限，也不代表每个字段都适合下发。首轮兼容可保留，
但必须：

- 设 response byte metric/上限与审计；
- 不记录 snapshot、resumeInput、metadata；
- 后续 V2 改为最小 Resume View DTO；
- 不允许此 response 进入共享/CDN cache；
- 测试 secret sentinel 不会出现在 summary/list；detail 的允许字段要有明确安全决策。

## 6. API-0997：Paused Execution List

### 6.1 Query

`?status=<string>` optional。donor：

- 单值：`status = value`；
- 逗号分隔多值：`status IN (...)`；
- trim 每个值；
- 不校验 enum；
- 空字符串相当于不加过滤。

### 6.2 DB / projection

PostgreSQL：

```text
SELECT * FROM paused_executions
WHERE workflow_id = ?
  [AND status = ? | status IN (...)]
ORDER BY paused_at DESC
```

没有 limit/cursor。每行：

- 映射 pause points；
- 过滤 time pause；
- 无 human pause 的 row 整行丢弃；
- 返回与 detail 相同的 summary，不返回 queue/snapshot 字段本身。

当前实现仍 `SELECT *`，为了拿 `executionSnapshot.triggerIds` 会把完整 snapshot 从 DB 读进
API 内存。原生 PostgreSQL adapter 必须显式投影，并使用 JSON path 只取 `triggerIds`，不能读
完整 snapshot。

风险：

- 无分页，paused rows 多时会造成大 DB read 与大 response；
- status 是无界字符串；
- metadata/pause point response.data 可能很大；
- order 只有 `pausedAt DESC`，相同时间无稳定 tie-break。

首轮可保持 wire，但 adapter 至少窄投影；V2 增加 status enum、cursor/limit、稳定
`pausedAt DESC, id DESC` 与 summary payload cap。

## 7. API-0993：Workflow Execution Status

### 7.1 Query

params：

- `id`: non-empty workflow id；
- `executionId`: non-empty。

query：

- `includeOutput=true|false`，缺省/false -> false；
- `selectedOutputs` 为逗号分隔 selectors，trim、丢空项，无数量/长度上限。

### 7.2 PostgreSQL

第一条查询 `workflow_execution_logs`，同时匹配 workflow id 与 execution id，显式投影：

```text
executionId, workflowId, workspaceId
status, level, trigger
startedAt, endedAt, totalDurationMs
executionData, costTotal
```

未命中：`404 Execution not found`。

第二条查询 `paused_executions`，只按 execution id，投影：

```text
id, status, pausePoints, metadata, resumedCount,
pausedAt, nextResumeAt
```

paused row 的 status 为 `paused | partially_resumed` 时，响应总 status 覆盖为 `paused`；
否则采用 log status。

### 7.3 Object Storage

`executionData` 可能是 inline JSON，也可能包含 `traceStoreRef`。后者通过已经授权的
workspace/workflow/execution scope 从 object storage materialize。读取失败时降级为 inline
markers，不让状态接口整体失败。

不需要 Worker RPC、Redis、Registry、Executor 或 Sandbox。当前 route 的
`PausePoint` 只是 type import，projection helpers 都可迁为纯函数。

### 7.4 Response

```text
executionId, workflowId
status: pending|running|paused|completed|failed|cancelled
trigger, level
startedAt ISO
endedAt ISO|null
totalDurationMs|null
paused|null
cost: {total:number}|null
error|null
finalOutput|null
blockOutputs|null
```

paused detail：

```text
pausedAt
resumeAt = nextResumeAt || earliest active pause point resumeAt || null
pauseKind
blockedOnBlockId
automaticResumeWaitingReason
pausedExecutionId
pausePointCount
resumedCount
```

output projection：

- `error` 只在 final status `failed` 时从 execution data 的
  `error` / `finalOutput.error` / `completionFailure` 提取；
- `finalOutput` 只在 `includeOutput=true && status=completed` 时返回；
- `selectedOutputs` 非空时遍历 trace spans，以 block id 收集第一个 output，再按 dotted path
  选值；没有命中的 selector 不出现在 object；
- selectedOutputs 非空时 `blockOutputs={}` 也不是 null；
- cost 使用 `Number(costTotal)`。

性能缺陷：

donor 无论 status/query 是否需要 payload，都会 materialize execution data。原生 use case 可在
以下任一条件满足时才读 object storage：

```text
status == failed
OR includeOutput
OR selectedOutputs.length > 0
```

这不改变 wire，却能消除绝大多数 status polling 的 object-store 请求。

安全：

- `selectedOutputs` 要加 count/selector length bounds，防止 CPU/response 放大；
- `finalOutput` 与 block outputs 可含用户数据/PII，不日志记录、不公共缓存；
- object reader 必须绑定已授权 workspace/workflow/execution 三元组。

## 8. API-0283：Resume Poll 实际是 Worker Command

### 8.1 Auth / lock

- 不使用 session/hybrid auth；
- `Authorization: Bearer ${CRON_SECRET}`，constant-time compare；
- secret 未配置或不匹配 -> `401 {"error":"Unauthorized"}`；
- Redis lock：
  - key `time-pause-resume-poll-lock`
  - TTL 180 秒；
  - request owner 为短 request id；
  - 未获得 lock -> `202 success`，message 为 polling already in progress/skipped；
  - finally best-effort release。

这不是 Redis read；它是分布式 lease mutation。

### 8.2 Due selection

PostgreSQL `paused_executions`：

- status `paused | partially_resumed`；
- `nextResumeAt IS NOT NULL AND <= now`；
- `ORDER BY nextResumeAt ASC`；
- `LIMIT 200`；
- 只投影 resume 所需 metadata 子集、pausePoints、retry count 等。

### 8.3 Legacy snapshot fallback

新 rows 从 metadata 解析 executor user/workspace/billing attribution。缺失时：

1. 批量读取 snapshot serialized byte size；
2. 超过 `MAX_PAUSED_EXECUTION_SNAPSHOT_BYTES` 不加载；
3. eligible ids 按固定 chunk 读取 snapshot；
4. 使用 `ExecutionSnapshot.fromJSON` 恢复 resume metadata；
5. 缺失/oversized/corrupt 转为 intervention/waiting failure。

### 8.4 副作用

每批最多 200 rows，以并发 10 处理：

- 计算 due time pause points；
- 调 execution preprocessing/admission；
- 写 automatic resume waiting / retry state；
- claim/enqueue resume queue；
- 可能启动 `executeResumeJob`；
- 更新 `nextResumeAt`；
- process queued resumes；
- 对单 row failure 隔离并汇总。

因此 API-0283 同时依赖 Redis、PostgreSQL 写、Billing/Admission、Executor 和 Worker job。
绝对不能进入 Execution Read Module 或 API process。

### 8.5 目标 seam

推荐：

```text
Cron HTTP handler
  -> verify cron auth
  -> AutomaticResumePollCommandPort.run(requestId)
       -> production HTTP/queue adapter
          -> Worker AutomaticResumePollModule
             -> Redis lease
             -> PostgreSQL due/resume repositories
             -> admission
             -> execution coordinator
```

为兼容 donor 的同步统计 response，可先使用 authenticated internal Worker RPC 并等待结果。
长期最好让 scheduler 直接命中 Worker internal endpoint，删除公共 API 中转。所有 RPC 必须：

- mTLS/internal JWT 或 shared internal secret；
- request id / idempotency key；
- 明确超时（donor maxDuration 120s）；
- 失败不在 API 本地 fallback 执行 Executor；
- Worker unavailable -> stable 502/503，而不是动态 import legacy manager。

成功 response：

```json
{
  "success": true,
  "requestId": "...",
  "claimedRows": 0,
  "dispatched": 0,
  "failures": [
    {"executionId":"...","contextId":"...","error":"..."}
  ]
}
```

lock busy 为 202；top-level failure 为
`500 {success:false,requestId,error}`。该接口 internal-only，不能生成 browser hook/facade。

## 9. 数据源与 RPC 决策表

| API | PostgreSQL 直读 | Redis | Object Storage | 外部 backend | Worker RPC |
| --- | --- | --- | --- | --- | --- |
| API-0138 | database backend 时读 `async_jobs` | 无 | 无 | Trigger.dev 配置时 `runs.retrieve` | 否 |
| API-0282 | `paused_executions` + `resume_queue` | 无 | 无 | 无 | 否 |
| API-0283 | Worker 内读写 paused/resume | Worker 内 lease | legacy snapshot 在 PG JSON | 无 | **是** |
| API-0993 | logs + paused | 无 | trace payload 按需读 | 无 | 否 |
| API-0996 | `paused_executions` + `resume_queue` | 无 | 无 | 无 | 否 |
| API-0997 | `paused_executions` 窄投影 | 无 | 无 | 无 | 否 |

本组六条没有任何“API 直接 Redis read”。Redis 只应出现在 Worker poll command 的锁/状态写侧。

## 10. 一个深 Execution Read Module + 多 handler 的冻结结构

可以使用一个深 Module，但它的 depth 来自隐藏授权、数据源、projection、payload materialization
与错误语义，而不是把所有数据源揉成一个巨型 repository。

建议目录：

```text
apps/api/src/modules/execution/
  read/
    application/
      get-job-status.ts
      get-execution-status.ts
      get-paused-execution.ts
      list-paused-executions.ts
    interface/
      create-get-job-status-handler.ts
      create-get-execution-status-handler.ts
      create-get-paused-execution-handler.ts
      create-list-paused-executions-handler.ts
    ports/
      job-status-reader.ts
      execution-log-reader.ts
      paused-execution-reader.ts
      execution-payload-reader.ts
    projection/
      execution-status-projection.ts
      paused-execution-projection.ts
    index.ts
```

Infrastructure：

```text
apps/api/src/infrastructure/
  postgres/repositories/
    drizzle-job-status-reader.ts
    drizzle-execution-log-reader.ts
    drizzle-paused-execution-reader.ts
  object-storage/
    execution-payload-reader.ts
  trigger-dev/
    trigger-dev-job-status-reader.ts
```

API-0282 与 API-0996 使用同一个 `get-paused-execution` use case 和 handler factory，仅 route
pattern/param alias/error compatibility配置不同。

建议 ports：

```text
JobStatusReader.read(jobId)
ExecutionLogReader.read(workflowId, executionId)
PausedExecutionReader.readDetail(workflowId, executionId)
PausedExecutionReader.list(workflowId, statusFilter)
PausedExecutionReader.readStatus(executionId)
ExecutionPayloadReader.materializeAuthorized(ref, scope)
```

不要：

- 从 API import `PauseResumeManager`；
- 从 API import `execution-core`、`ExecutionSnapshot`、`@/executor/*`；
- 让 browser import ports/adapters；
- 为每个 route 复制 paused SQL/projection；
- 将 Worker RPC 作为普通 read fallback；
- 把 `SELECT *` row 类型暴露为 module interface。

纯 DTO/Zod 合同放在 `packages/api-contracts`；跨 API/Worker 的 poll command/result 放在
`packages/execution-contracts`。Browser 只可达 public query DTO，不能可达 worker command、
DB schema 或 Executor。

## 11. W6 6/11 实现分组

### Group A：Paused Read Slice（3 routes）

接口：

- API-0282
- API-0996
- API-0997

内容：

- pure paused contracts/projection；
- PostgreSQL paused reader；
- detail aliases；
- list status parsing；
- workflow read auth；
- 删除 API 路径对 `PauseResumeManager` 的运行时依赖。

这是最高 leverage 组：一个 deep slice 原生化三条 route。

### Group B：Execution Status（1 route）

接口：

- API-0993

内容：

- log + paused status reader；
- conditional object materialization；
- pure output/error/pause projection；
- selectedOutputs bounds；
- 不导入 Executor。

### Group C：Job Status（1 route）

接口：

- API-0138

内容：

- backend-neutral job ownership/public projection；
- PostgreSQL 与 Trigger.dev 两个 adapters；
- metadata-based authorization policy；
- arbitrary output contract 与 payload caps。

### Group D：Automatic Resume Poll Worker Command（1 route）

接口：

- API-0283

内容：

- execution-contracts command/result；
- API cron-auth RPC adapter；
- Worker poll module；
- Redis lease、due repository、legacy fallback、admission、resume coordinator；
- API import closure 不含 Executor。

合并结果：

```text
Group A 3
+ Group B 1
+ Group C 1
+ Group D 1
= 6/11 W6 = 54.5%
```

并行建议：

- Track 1：Group A；
- Track 2：Group B；
- Track 3：Group C；
- Track 4：Group D；
- 最后主线统一 contracts/composition/W6 manifest、real PG、build/closure。

## 12. 测试计划

### 12.1 Contract

- job status 四种 status、optional metadata/output/error；
- paused summary/detail/queue ISO/null/unknown payload；
- execution status 六种 status、paused/cost/error/output；
- includeOutput 与 selectedOutputs query normalization/bounds；
- poll command/result contract 只在 execution-contracts/internal surface；
- public browser contract purity。

### 12.2 Auth / error precedence

- internal JWT、session、personal/workspace API keys；
- workflow missing、personal workflow、auth missing、workspace-key mismatch、read denied；
- 验证 auth-first 安全升级或 donor precedence 的 differential；
- job workflow-owned、user-owned、ownerless、both fields；
- paused aliases成功/404完全同 projection；
- unexpected error不泄漏 internal message；
- cron secret missing/wrong/correct。

### 12.3 Real PostgreSQL

Paused：

- human/time/mixed pause points；
- time-only detail/list 隐藏；
- queue ordering、position、latest entry；
- loop block id normalization；
- resume link query stripping；
- status single/comma filter；
- list 窄投影不拉完整 snapshot；
- other workflow/execution isolation。

Execution status：

- log missing；
- each terminal/live status；
- paused/partially-resumed override；
- earliest resume point；
- automatic wait reason fallback；
- cost numeric conversion；
- inline vs externalized payload；
- object missing降级；
- includeOutput false 不 materialize completed payload；
- failed仍 materialize error；
- nested selectedOutputs。

Job：

- database row states/ownership；
- Trigger.dev status mapping/not-found/remote failure；
- workspace key cross-workspace denial；
- metadata missing denial；
- output/error omission rules。

### 12.4 Worker poll

- Redis lock acquired/busy/TTL/release-on-error；
- due filter、`nextResumeAt ASC`、batch 200；
- row concurrency 10；
- paused + partially_resumed；
- valid metadata无 legacy snapshot read；
- legacy byte size cap、chunking、corrupt/missing snapshot；
- retryable admission -> retryAt；
- nonretryable -> intervention；
- queued/resuming paths；
- per-row failure isolation；
- duplicate poll/idempotency；
- Worker restart后 durable state 恢复；
- Worker RPC timeout/unavailable，API 不本地执行；
- claimedRows/dispatched/failures parity。

### 12.5 架构与发布门禁

- W6 manifest 精确把六个 ID 标为 native，其余 5 个仍 legacy；
- generated facade exact routing；
- API full tests / contracts / execution-contracts / worker tests；
- real PostgreSQL、Redis integration、object-storage fake/contract；
- API/Worker production builds + standalone smoke；
- browser closure：
  - `apps/api = 0`
  - `apps/worker = 0`
  - `@sim/db = 0`
  - Executor/Registry/Sandbox = 0；
- API execution read module closure也必须不含 Executor；
- no cycles、target structure、monorepo boundary、secret/logging audit。

## 13. 最终冻结决策

1. 五条 query 进入一个深 Execution Read Module、多 handler；不复制 legacy manager。
2. API-0282/0996 共用同一 use case，API-0997共用 paused projection。
3. Paused read 与 execution status 直接读 PostgreSQL；API-0993 按需读 Object Storage。
4. Job status 根据配置直接读 PostgreSQL或 Trigger.dev；当前不使用 Redis/Worker RPC。
5. API-0283 是 Worker command，Redis lease/DB writes/Executor 全留 Worker。
6. API 永不因 Worker失败 fallback import Executor。
7. Paused list 改为窄列/JSON path投影；detail snapshot继续下发属于兼容债务并记录 V2。
8. API-0993 只在确实需要 error/output/selected output时 materialize object payload。
9. API-0282 的 internal error message 泄漏统一收敛为 safe 500。
10. 四组并行完成后，W6 达到 54.5%，同时 API/browser import closure不含 Executor。

## 14. Group A 实现交接（待独立复核）

### 14.1 状态与责任人

- 实现 agent：`/root/api1037_donor_audit`
- 交接状态：`pending-independent-review`
- 本次仅实现：
  - API-0282 `GET /api/resume/[workflowId]/[executionId]`
  - API-0996 `GET /api/workflows/[id]/paused/[executionId]`
  - API-0997 `GET /api/workflows/[id]/paused`
- API-0993、API-0138、API-0283 未实现，不得计数。
- API-0282 与 API-0996 共用同一个 use case、handler 与 PostgreSQL reader；只在 path
  pattern 上保留 alias。
- 本交接未修改 production composition、W6 route manifest、总进度账本或共享
  `package.json`。因此三条路由目前是“native slice 已实现但尚未挂载”，不能标为
  accepted/native。

### 14.2 已实现文件

```text
packages/api-contracts/
  src/execution-read.ts
  src/index.ts
  tests/execution-read.test.ts

apps/api/src/modules/execution/read/
  application/
    get-paused-execution.ts
    list-paused-executions.ts
  interface/
    create-get-paused-execution-handler.ts
    create-list-paused-executions-handler.ts
  ports/
    paused-execution-reader.ts
    workflow-read-authorizer.ts
  projection/
    paused-execution-projection.ts
  index.ts

apps/api/src/infrastructure/postgres/repositories/
  drizzle-paused-execution-reader.ts
  platform-workflow-read-authorizer.ts

apps/api/tests/w6/
  native-paused-execution-read.test.ts
  platform-workflow-read-authorizer.test.ts
  execution-read-import-boundary.test.ts
  native-execution-read.postgres.test.ts
```

### 14.3 Donor/native 兼容矩阵

| 行为 | donor | native Group A |
| --- | --- | --- |
| detail lookup | `workflowId + executionId` | 相同 |
| detail queue | `parentExecutionId`，`queuedAt ASC` | 相同 |
| time-only detail | `null` 后 route 404 | 相同 |
| list status | 任意 string；逗号拆分并 trim；空 string 不过滤 | 相同 |
| list order | `pausedAt DESC`，无 limit | 相同 |
| list time-only | 过滤 | 相同 |
| loop block ID | 删除 `_loop\d+` | 相同 |
| resume UI URL | 删除 query string | 相同 |
| queue position | pending 全局队列位置 | 相同 |
| latest queue entry | 每个 context 最新 `queuedAt` | 相同 |
| detail snapshot | 返回完整 serialized snapshot | 相同，外层 shape 已精确冻结 |
| API-0282 unexpected error | donor 泄漏 `error.message` | 有意升级为 safe 500 + requestId |
| auth/route parse precedence | donor 先 parse 再 workflow auth | target policy：先身份认证，再解析 path/query，再 workflow auth |

最后两项属于有意的安全行为升级，独立 reviewer 必须明确批准，不能静默当成完全相同。

### 14.4 前端与运行时边界

- `execution/read` deep Module 只依赖 pure contracts 与 ports；不依赖
  `PauseResumeManager`、Executor、Registry、Sandbox、`@sim/db` 或 Drizzle。
- PostgreSQL 与 canonical workflow auth 都被藏在 infrastructure adapters 后。
- boundary test 同时扫描 deep Module、两个 adapters 与 browser-safe contract。
- list 查询不再 `.select()` 整行，只读取 summary 所需列，并用
  `execution_snapshot -> 'triggerIds'` 读取 trigger IDs；不会把完整 snapshot 拉入
  list 路径。
- detail 仍按 donor 契约读取 snapshot。当前 resume 页面只从 snapshot 解析 block name；
  后续 V2 应由服务端投影 `blockName/blockLabel` 并默认不返回 snapshot，必要时通过单独、
  鉴权后的 lazy endpoint 获取。这一 V2 不能混入三条兼容 route 的本次迁移。
- `@sim/api-contracts/execution-read` subpath export 尚未加入共享 `package.json`。composition
  前应加入该 export，并让 browser facade 从 subpath 导入，避免经过 contracts 根 barrel。

### 14.5 Wire shape 与敏感字段审计

- summary、detail、queue、pause point、resume links、loop/parallel scope 与 serialized
  snapshot 外层均为 `.strict()` 精确字段；已删除原来的 `.passthrough()`。
- 未声明的 persistence 字段、queue 字段和 snapshot 外层字段会被契约拒绝；projection
  也只逐字段构建 DTO。
- 三处真正动态 JSON：
  - pause point `response`
  - resume queue `resumeInput`
  - paused row `metadata`
- 这些值属于用户输入/工作流状态，无法按固定业务字段枚举；使用 `z.json()` 或
  `Record<string, JsonValue>`，不允许 function、symbol、BigInt 等非 JSON 值。
- `executionSnapshot` 外层只允许 `{snapshot: string, triggerIds: string[]}`。其中
  `snapshot` 是 serialized execution JSON，可能包含 workflow state、workflow variables、
  block outputs 与 credential ID，属于高敏授权数据。
- donor 的 pause serializer 用 `{}` 作为 `ExecutionSnapshot.input`，也没有把执行时的
  `decryptedEnvVars` 参数写进 snapshot；credential deletion 代码只按 credential ID 清理
  snapshot。当前证据未发现 plaintext credential secret 被 serializer 主动写入。
- 但是 workflow variable、block output 和 `resumeInput` 本身可能承载用户敏感数据；因此
  只能依靠 workflow read authorization 与 tenant isolation，不能声称 payload“无敏感
  数据”。
- donor detail route 没有响应大小上限；automatic-resume legacy fallback 另有 16 MiB
  snapshot 限制，但不适用于这三条 read route。为保持兼容，本实现没有擅自增加上限。
  reviewer 应把“detail payload budget + V2 lazy snapshot”列为后续必须批准的性能/安全
  变更，不能把当前缺少 route-local size cap 隐藏掉。

### 14.6 Tenant isolation 说明

- canonical `authorizeWorkflowByWorkspacePermission` 先由 `workflowId` 找到 active workflow
  和所属 workspace，再校验 user 的 workspace read permission。
- workspace API key 还会校验 key 的 `workspaceId` 与授权结果 workspace 一致。
- `paused_executions` schema 没有 `workspace_id`；它通过全局唯一、带 FK 的
  `workflow_id` 归属 workflow。因此：
  - detail SQL 必须同时匹配 `workflowId + executionId`；
  - list SQL 必须匹配 `workflowId`；
  - 不能使用只按 `executionId` 的查询。
- 当前 reader 符合以上条件。授权结果的 `workspaceId` 不再作为 SQL 条件，是因为 paused
  表不存在该列；在这里额外 join workflow 只会重复 canonical auth 已完成的查找。
- focused test 覆盖 workspace-key cross-workspace denial；real-PG fixture 覆盖错误
  workflowId 不能读取相同 execution 行，以及 list 不跨 workflow。

### 14.7 测试证据

已通过：

```text
bun --cwd packages/api-contracts test execution-read.test.ts
  1 file passed, 3 tests passed

bun --cwd apps/api test \
  tests/w6/native-paused-execution-read.test.ts \
  tests/w6/platform-workflow-read-authorizer.test.ts \
  tests/w6/execution-read-import-boundary.test.ts \
  tests/w6/native-execution-read.postgres.test.ts
  3 files passed, 1 file skipped
  20 tests passed, 1 PostgreSQL test skipped

bun --cwd packages/api-contracts type-check
  passed

bun --cwd apps/api type-check
  passed
```

本机 `DATABASE_URL` 未配置、`SIM_TEST_DATABASE_DISPOSABLE` 未开启，所以 real PostgreSQL
测试没有伪装成通过，而是明确 skip。独立复核前必须在 disposable PostgreSQL 上执行：

```text
SIM_REQUIRE_POSTGRES_TEST=1
SIM_TEST_DATABASE_DISPOSABLE=1
DATABASE_URL=<empty disposable database>
bun --cwd apps/api test tests/w6/native-execution-read.postgres.test.ts
```

该 fixture 会创建真实 `paused_executions` / `resume_queue` 表并验证：

- human/time/mixed projection；
- time-only 隐藏；
- queue ordering、position、latest entry；
- loop ID 与 resume URL normalization；
- comma status filter；
- list 窄 snapshot projection；
- workflow tenant isolation；
- 非公开字段不进入 list DTO。

### 14.8 主代理集成点与 rollback scope

独立 reviewer 通过后，主代理仍需：

1. 在 production composition 注入 `createDrizzlePausedExecutionReader()` 与
   `createPlatformWorkflowReadAuthorizer()`。
2. 将两个 handler 挂到三个 exact GET path，并接入统一 method/404/auth middleware。
3. 在 `packages/api-contracts/package.json` 增加 `./execution-read` subpath export。
4. 生成/更新 W6 facade 与 manifest，但只把本组的三条标为 native。
5. 真跑 disposable PostgreSQL、API full suite、production build、browser closure 与页面
   compile/page-open 性能证据。
6. 由非 `/root/api1037_donor_audit` 的 agent 完成独立复核；只有 `approved` 才进入 accepted
   ledger。

rollback 只需撤销 Group A 上述 contracts、module、adapters、tests 与 composition/manifest
接线；不会触及 Worker、Sandbox、Executor 或 donor 数据写路径。数据库 schema 未变化。

## 15. Group A 第一轮审查后的修复记录（2026-07-30）

状态：`changes-required -> pending-independent-re-review`。三条 route 仍未进入 accepted
ledger。

已完成：

1. production API 已接入 `ExecutionReadModule`，API build 为 1,164 modules，产物包含
   `drizzle-paused-execution-reader`、`drizzle-workflow-read-scope-reader`、
   `platform-workflow-read-authorizer` 和三条 exact route 的 observation headers。
2. queue SQL 现在同时要求
   `parent_execution_id = executionId AND paused_execution_id = authorizedPausedRow.id`。
   PostgreSQL fixture 加入另一 workflow 的恶意同 parent execution row，确认 detail 不返回。
3. 增加窄 `WorkflowReadScopeReader`：先冻结 missing 404、personal/unattached 403 和
   workspace-key mismatch 403，再调用 canonical permission seam，恢复 donor error precedence。
4. resume links、loop/parallel scopes 和 serialized snapshot 均改为逐字段投影；额外
   credential/internal cursor/encryption key sentinel 不进入 DTO。合法动态 JSON 保持，
   malformed historical snapshot 明确走 safe 500。
5. `@sim/api-contracts/execution-read` subpath 已发布；resume detail hook 使用 focused
   contract，不再 import `@/executor/types` 或 monolithic workflows contract。
6. API-0282/API-0996/API-0997 的 Next route 已改为轻量 W6 proxy；resume server page
   通过已鉴权 API seam 读取 initial detail，不再 import `PauseResumeManager`。
7. lightweight bundle gate 新增 resume hook/contract：
   - hook：84,639 gzip bytes / 107 inputs；
   - contract：64,927 gzip bytes / 79 inputs；
   - Executor、`lib/workflows/executor`、旧 workflows contract、workflow middleware 均为 0。
8. real PostgreSQL 16 fixture 已通过 1/1；W6 focused 26/26、API type-check、API production
   build 均通过。

真实 dev journey（Windows、Node 22、Next 16.2.11 Turbopack、端口 3108、API route off，
相同 `.next/dev` cache）：

| 请求 | HTTP | total | TTFB |
| --- | ---: | ---: | ---: |
| resume page 首次有效请求 | 200 | 19.769 s | 19.714 s |
| resume page 第二次 | 200 | 0.167 s | 0.157 s |
| resume page 第三次 | 200 | 0.134 s | 0.124 s |

trace 中两个独立 dev-server session 的 resume page cold compile 分别为 17,808.8 ms 和
17,057.0 ms；API-0282 facade compile 为 230.6 ms。热路径已小于 1 秒，但冷页面仍高于
10 秒目标，后续必须继续拆 resume UI/design-system/layout closure。没有发生代码编辑，
因此本次 trace 没有 incremental compile event；不能把热 HTTP 响应冒充 incremental compile。
