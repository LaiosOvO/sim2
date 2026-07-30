# W6 Group A paused-execution read 独立审查

Result: **changes-required**

范围：

- API-0282 `GET /api/resume/[workflowId]/[executionId]`
- API-0996 `GET /api/workflows/[id]/paused/[executionId]`
- API-0997 `GET /api/workflows/[id]/paused`

实现 agent：`/root/api1037_donor_audit`  
独立 reviewer：`/root/api1037_donor_audit/w6_group_a_independent_review`  
审查日期：2026-07-30

reviewer 没有实现本组代码。本报告按
`docs/testing/migration-independent-review-policy.md` 审查了 Sim2、Polaris donor、target
contracts/deep Module/adapters/tests，以及 production API 与实际 resume 页面闭包。

三条路由不得进入 accepted ledger。当前不是“已完成、只差登记”：production API 不能命中
这些 handler，现有 resume 页面仍直接 import `PauseResumeManager`，真实 PostgreSQL fixture
也会失败。

## 必须修改的问题

### 1. native slice 没有挂入 production API，构建产物中不存在三条路由

Priority: critical

`apps/api/src/bootstrap/application/create-api-application.ts:17-24` 没有 execution-read
module option，`createApiApplication()` 的 handler chain（同文件 `43-49`）也没有该模块。
`apps/api/src/bootstrap/composition/create-production-api-options.ts` 没有创建：

- `createDrizzlePausedExecutionReader()`；
- `createPlatformWorkflowReadAuthorizer()`；
- 两个 use case/handler；
- 三条 route 的 method/path/auth manifest。

独立执行 `bun --cwd apps/api build` 虽然成功，但在 `apps/api/dist/**/*.js` 搜索
`PausedExecutionDetailAPI`、`createDrizzlePausedExecutionReader` 和 `/api/resume/` 均无
结果。这个 build 没有编译 W6 slice，不能作为本组 production build 证据。

必须新增一个拥有 exact route selection、GET method gate、authentication policy 和
observation headers 的 execution-read transport module，并在 configured/unconfigured
composition 中明确接线。还必须加 production application test，证明三个 exact path
返回 native 响应，错误 method 不会落进 handler，其他 path 仍走 404/后续 module。

### 2. resume queue 查询没有绑定已授权的 paused row，可跨 workflow 混入敏感数据

Priority: critical

`apps/api/src/infrastructure/postgres/repositories/drizzle-paused-execution-reader.ts:39-55`
在已经找到 `workflowId + executionId` 的 paused row 后，只按：

```ts
eq(resumeQueue.parentExecutionId, executionId)
```

读取 queue。`resume_queue.paused_execution_id` 才是指向 `paused_executions.id` 的外键；
`parent_execution_id` 没有外键约束。一个属于其他 workflow 的 queue row 只要错误地或被
恶意地写入相同 `parentExecutionId`，其 `resumeInput`、failure reason、new execution ID
就会进入当前已授权 workflow 的 detail 响应。

Sim2/Polaris donor 也只有 `parentExecutionId` 条件，但独立审查门禁要求修掉继承的数据
隔离缺陷，不能以 donor 同样存在为由保留。查询至少应同时约束：

```text
resume_queue.parent_execution_id = executionId
AND resume_queue.paused_execution_id = authorizedPausedRow.id
```

真实 PostgreSQL fixture 必须增加反例：为 workflow-2 的 paused row 插入
`parentExecutionId = workflow-1 executionId` 的 queue row，并证明 workflow-1 detail
绝不返回该 row。

### 3. 项目的主要前端性能目标尚未落地，resume 页面仍直接编译完整 Executor 链

Priority: critical

target 的实际页面
`apps/sim/app/(interfaces)/resume/[workflowId]/[executionId]/page.tsx:2` 仍直接 import：

```ts
@/lib/workflows/executor/human-in-the-loop-manager
```

并在同文件 `34-37` 直接调用 `PauseResumeManager.getPausedExecutionDetail()`。因此打开
resume 页面时，Next server-page compile 仍会解析包含 Executor、execution payload、
billing、provider/streaming 等依赖的 2,000+ 行 manager；新 deep Module 并没有替换实际
页面读路径。

`apps/sim/hooks/queries/resume-execution.ts:4-8` 也仍使用旧的超大 workflow contract 与
`@/executor/types`，并在 `22-78` 重复维护含多个 `any` 的 ad-hoc wire types。没有任何
browser consumer import `@sim/api-contracts/execution-read`。

同时，`packages/api-contracts/package.json:7-67` 没有 `./execution-read` subpath export。
当前只能经 contracts 根 barrel 取类型/schema，无法建立交接文档声称的 focused browser
entry。

必须：

1. 增加 `@sim/api-contracts/execution-read` subpath；
2. 让 resume detail hook/facade 直接使用该 subpath 的命名类型和 schema；
3. 让页面通过已鉴权的 API/BFF read seam 获取 initial data，移除页面对
   `PauseResumeManager`/Executor 的 import；
4. 为 resume page/hook 增加永久零预算的 dependency-closure gate；
5. 在 `docs/testing/evidence/` 保存 cold compile、incremental compile、page-open 和关键
   interaction 测量，并设置不可自动抬高的回归 ratchet。

当前全局 browser closure gate 虽然通过，但 baseline 仍允许 271 个 client roots 触达
Executor，且 lightweight surface baseline 根本没有 resume surface；这不是本组验收
证据。

### 4. 真实 PostgreSQL fixture 当前会在插入阶段失败

Priority: high

独立 reviewer 在临时 `postgres:16-alpine` 容器中设置：

```text
SIM_REQUIRE_POSTGRES_TEST=1
SIM_TEST_DATABASE_DISPOSABLE=1
DATABASE_URL=<disposable PostgreSQL 16>
```

并执行：

```text
bun --cwd apps/api test tests/w6/native-execution-read.postgres.test.ts
```

结果为 `1 failed`。失败发生在
`apps/api/tests/w6/native-execution-read.postgres.test.ts:54`：TypeScript template
literal 中的 `\"` 在发送 SQL 前已经变成 `"`，最终 JSONB 文本为：

```text
{"snapshot":"{"serverOnly":"authorized-detail-state"}","triggerIds":["trigger-1"]}
```

PostgreSQL 返回 `22P02 invalid input syntax for type json`。因此交接文档所列 queue
ordering、status filter、tenant isolation、narrow snapshot 等真实 I/O 断言一项都没有
运行。

应改用参数化 insert（首选）或正确构造 JSON 值，禁止继续用多层手写 SQL/JSON escaping。
修复后除现有断言外，还要加入第 2 项的 cross-workflow queue 反例。临时审查容器已清理。

### 5. workspace API key 的错误优先级与 donor 不一致，兼容矩阵没有记录

Priority: medium

donor `validateWorkflowAccess()` 的顺序是：

1. 查 workflow；
2. hybrid authentication；
3. 若 workspace key 的 `workspaceId` 不匹配，返回
   `API key is not authorized for this workspace`；
4. 再调用 canonical workflow permission。

target
`apps/api/src/infrastructure/postgres/repositories/platform-workflow-read-authorizer.ts:20-31`
先返回 canonical denial，只有 canonical allowed 后才在 `42-48` 检查 workspace-key
mismatch。若 key 跨 workspace 且 key 的 user 同时没有目标 workflow 权限，target 会返回
canonical access-denied message，而 donor 返回 workspace-key mismatch message。

现有 test 只覆盖 “canonical allowed + workspace mismatch”，没有覆盖上述分支。应在
canonical result 带有 workflow/workspace 时先执行 credential workspace scope 检查，
或把这一差异作为版本化行为变更明确批准，并冻结精确错误 body。

另一个未覆盖差异是 personal/unattached workflow：donor 先读取 workflow，明确返回 403
deprecation message；canonical `getActiveWorkflowContext()` 使用 workspace inner join，
可能把该记录折叠为 404。必须增加真实 auth/repository fixture，决定并冻结 403/404 行为，
不能保留当前不可达的 `if (!workspaceId)` 分支作为证据。

### 6. strict contract 与 projection 之间仍有可用性缺口

Priority: medium

contract 将 resume links、loop/parallel scopes 与 snapshot 外层设为 `.strict()` 是合理的
敏感字段防线；summary/queue 也基本按字段构造。但
`paused-execution-projection.ts:57-63` 的 `normalizeResumeLinks()` 仍先 spread 持久化对象，
再交给 strict schema。旧数据若多一个字段会导致整个 detail 500，而不是安全地只投影五个
公开字段。这与交接文档“projection 逐字段构建 DTO”的说法不一致。

`executionSnapshot` 也在 `189-193` 原样交给 strict schema。应显式构造
`{ snapshot, triggerIds }`，并对历史/畸形 row 采用已决定的兼容策略。需要 fixture 覆盖：

- resumeLinks/scope/snapshot 外层含额外持久化字段时不泄漏；
- 合法动态 JSON（primitive、array、object、null）仍保持 wire value；
- 非 JSON 数据或历史缺字段时的错误策略；
- 超大 snapshot 的响应预算与后续 lazy V2 策略。

## Donor 核对结果

reviewer 直接读取了只读参考仓库：

- `D:\workspace\workflow\sim2`
- `D:\polaris`

两套 donor 的三条 route 和 `apps/sim/app/api/workflows/middleware.ts` 一致；Polaris 的
`PauseResumeManager` 对本组三个 read 行为也与 Sim2 相同。

| 行为 | donor | target slice | 审查 |
| --- | --- | --- | --- |
| detail key | `workflowId + executionId` | 相同 | match |
| queue order | `parentExecutionId`, `queuedAt ASC` | 相同 | 行为 match，但 tenant filter 必须加固 |
| list key/order | `workflowId`, `pausedAt DESC`, 无 limit | 相同 | match |
| status query | 任意 string；逗号 split + trim；空串不筛选 | 相同 | match |
| time-only | detail 404/list 隐藏 | 相同 | match |
| pause summary | human point 数量，按 point 重算 resumed | 相同 | match |
| block ID | 删除所有 `_loop\d+` | 相同 | match |
| resume UI URL | 去掉 query | 相同 | match |
| queue position | pending 全局顺序、每 context 首个 | 相同 | match |
| latest queue | 每 context 最新 `queuedAt`，相等时后者胜 | 相同 | match |
| list snapshot | donor 读整行 | target 只读 `execution_snapshot -> 'triggerIds'` | 正确优化 |
| detail snapshot | 完整 serialized snapshot | 相同 | 高敏授权数据，需 payload evidence |
| API-0282 unexpected 500 | 泄漏 caught `error.message` | safe 500 + requestId | 可接受的安全升级 |
| API-0996/0997 unexpected 500 | wrapper safe 500 + requestId | safe 500 + requestId | match |
| unauth/validation precedence | donor params → workflow lookup → auth | target auth → params → workflow auth | 已记录的安全升级，需 production test 冻结 |

target contract 没有直接声明 persistence-only fields，list SQL 也只选择必要列；这部分方向
正确。detail 的 `snapshot`、queue `resumeInput`、pause response 和 metadata 仍可能承载
workflow input、variables、block output、credential ID 或用户敏感数据，不能描述为“无
敏感数据”。它们的安全性完全依赖 workflow auth、workspace scope 和 queue tenant
isolation。

## 已通过的证据

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

bun --cwd packages/api-contracts test
  2 files passed, 19 tests passed

bun --cwd apps/api test
  28 files passed, 2 files skipped
  167 tests passed, 2 tests skipped

bun --cwd packages/api-contracts type-check
  passed

bun --cwd apps/api type-check
  passed

bun --cwd apps/api build
  passed, 1,149 modules
  W6 symbols/routes absent from output

bun run check:target-structure
  passed: 57 module roots, 93 required files

bun run check:browser-runtime-closure
  passed current non-regression baseline
  executor client roots: 271
  execution-and-sandbox client roots: 240

bun run scripts/architecture/build-isolation/check-lightweight-client-surfaces.ts
  passed only the three existing surfaces; resume is not registered

bun run check:wave-migration-progress
  W6: 0/11
```

## 失败或缺失的验收证据

```text
real PostgreSQL 16:
  1 failed before adapter assertions (invalid fixture JSONB)

production route composition:
  missing

W6 route manifest / observation headers:
  missing

@sim/api-contracts/execution-read subpath:
  missing

resume browser/server-page dependency closure:
  not migrated; page still imports PauseResumeManager

resume cold/incremental compile and page-open evidence:
  missing

detail payload-size evidence:
  missing

independent-review ledger entries for API-0282/0996/0997:
  missing
```

## 复核退出条件

1. 修复 queue 双重归属过滤，并增加 cross-workflow queue PostgreSQL 反例。
2. 修复真实 PostgreSQL fixture，重新在 disposable PostgreSQL 16 上通过。
3. 完成 execution-read production module/composition/三条 exact route，并增加 application
   integration tests。
4. 增加 contract subpath，迁移实际 resume page/hook，删除
   `PauseResumeManager`/Executor closure。
5. 记录并 ratchet resume cold/incremental compile、page-open、interaction 与 detail payload
   指标。
6. 补齐 API key mismatch、unattached workflow、internal-user、invalid params/query 和 method
   precedence 测试。
7. 把 strict nested DTO 改为显式公开字段投影，补历史/额外字段 fixture。
8. 在独立审查账本中为三个 inventory ID 分别登记本报告为 `changes-required`，但不得加入
   W6 `completedInventoryIds`。
9. 修复后由未参与实现的 agent 重新独立审查；在新的结果为 `approved` 前不得计数。

