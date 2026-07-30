# API-1032 原生迁移审计：workspace fork diff

> 审计日期：2026-07-30  
> 路由：`GET /api/workspaces/[id]/fork/diff`  
> 只读来源：`D:\workspace\workflow\sim2`、`D:\polaris`  
> 目标：冻结 wire contract、错误优先级、依赖闭包、性能风险与原生 API deep module seam；本文不实现代码。

## 1. 冻结结论

1. Sim2 与 Polaris 的 API-1032 路由、HTTP contract 和主要规划逻辑相同，路由文件 SHA256 均为 `E388F6AFE829C4E52C09375BB303C53EC14C337113F5DEBEE062017E5A4B95DC`。
2. API-1032 是只读预览，但不是轻量 metadata 查询。它读取至多 1000 个已部署工作流的完整 normalized `WorkflowState`，扫描 block、nested tool、resource reference，再读取 fork mapping、资源清单、target draft、dependent values 和 source liveness。
3. 旧实现没有实例化 `Executor`，也没有调用 Node sandbox/`isolated-vm`；但依赖闭包经过 `getBlock -> registry-maps` 和 `getTool -> tools/registry` 拉入全量 block/tool definition graph，并引用了少量 `executor/constants`/reference helpers。Polaris 的全量 registry 又增加 Feishu、Meegle、HR、MAT、Risk、Todo 等业务工具，所以不能把这条闭包复制到新前端或新 API 的公共模块。
4. 真正的请求时 N+1 是 source workflow state load：每个已部署工作流至少先查 active version，再加载一套完整 normalized state；旧实现仅用并发度 5 缓解 round-trip，没有消除 N+1。其余资源、mapping、draft 和 liveness 查询基本已经按 kind/ID 批量化。
5. 原生迁移应复用现有 shared forking gate 与 `WorkspaceForkCurrentAccessReader`，新增两个小 seam：
   - `DirectWorkspaceForkEdgeReader.findActiveEdge(a, b)`
   - `WorkspaceForkDiffReader.read(input) -> GetForkDiffResponseV1`
   `WorkspaceForkDiffReader` 是 deep module：在一个 interface 后隐藏 bulk workflow snapshot、mapping/resource queries、reference scanning、dependent projection 和完整 response assembly。
6. 不应把 donor 的 `blocks/registry`、`tools/registry` 搬进 `apps/api`。运行时只允许使用数据化的 `WorkflowReferenceMetadataCatalog`（建议由构建脚本从 Sim2 + Polaris definitions 生成并校验的 committed manifest）；执行函数、SDK、鉴权、加密和 sandbox implementation 不得进入 catalog。
7. API-1032 与后续 promote command 必须调用同一个纯 `ForkSyncPlanner`。不能分别实现 preview/apply 规则，否则 reference、copyable、archive、excluded 和 dependent semantics 会漂移。

## 2. Sim2 / Polaris SHA256 与分叉

### 2.1 路由、contract 与直接 helpers

| 文件（相对仓库根） | Sim2 SHA256 | Polaris SHA256 | 结论 |
|---|---|---|---|
| `apps/sim/app/api/workspaces/[id]/fork/diff/route.ts` | `E388F6AFE829C4E52C09375BB303C53EC14C337113F5DEBEE062017E5A4B95DC` | 同左 | 完全相同 |
| `apps/sim/lib/api/contracts/workspace-fork.ts` | `84BF295C30ABD671386FEF4CA7A89B0808B9B95815865DC2339E03D17C997E71` | 同左 | 完全相同 |
| `.../copy/copy-workflows.ts` | `FA6BB328CEBD28F8882ED99FA1CF261502E7E4EC747FFF7E2BA42B103798B499` | `604D0DB8118495217AEEA3D77F6BB1F33B1E06AEE30ADD82283F3BD74D5B5A45` | 分叉：Sim2 使用统一 `folder(resourceType)`；Polaris 使用 `workflowFolder`。API-1032 只调用其中的 `loadTargetDraftSubBlocks`，该函数本身不依赖 folder |
| `.../copy/deploy-bridge.ts` | `822C9B263EB259B4C2837830172847C512BCEA7E1F08ADA3229EE95499FDB7D3` | 同左 | 完全相同 |
| `.../lineage/authz.ts` | `6266AB9B0DC33C1654F428A1C6C3B77C09BA2875DFAD2D9AE92B57B2E6C3CAA9` | 同左 | 完全相同 |
| `.../mapping/block-map-store.ts` | `22FE5EABAA87113A51D8ACA7FA9F6A0620D01CADA44F8DDAE51251A694867B0E` | 同左 | 完全相同 |
| `.../mapping/dependent-reconfigs.ts` | `CD29546CB3A4B83AB01F4AD6A7EA8BDD565AC7D7AD9FA04C7614D6A14E17EBD4` | 同左 | 完全相同 |
| `.../mapping/dependent-value-store.ts` | `146CE34E4C63917DB143AF577268FC0312692F7671DF52BAB03339850BA237A3` | 同左 | 完全相同 |
| `.../mapping/resources.ts` | `47631065C03C73F4069573533186010B95F105F6A3B84EAC80E318AC7B0B2004` | `E4183D8F7427A64F4B6A9E44583F14E2A53E3100E6B786141FEC2E8DAD99E031` | 分叉：文件 folder label 的 join，Sim2 用统一 `folder`，Polaris 用 `workspaceFileFolder` |
| `.../promote/cleared-refs.ts` | `89CDB42EC414DBCD4B2151790D4FF61102EE7747F0C0AEEA11ACA668C21ED6AD` | 同左 | 完全相同 |
| `.../promote/promote-plan.ts` | `920408428A7AFD7AF7901072EA8C323C07D476A7C25C1CED7173ECDD92A099FC` | 同左 | 完全相同 |
| `.../remap/block-identity.ts` | `B1429EDAA1FF62057838CD8CF28EC196383090EDE365D4D086CF4BEDE8570E33` | 同左 | 完全相同 |
| `.../remap/remap-references.ts` | `D85EF527F856289FEEB41EB287437BA356E24EEAC3DC307EED65593ABEF237F2` | 同左 | 完全相同 |

### 2.2 关键传递依赖

| 文件 | Sim2 SHA256 | Polaris SHA256 | 结论 |
|---|---|---|---|
| `lineage/lineage.ts` | `E987864F3EE7F9D8F2521965054869BBD4FE42ECC2D3AD1C1958986009DD0E01` | 同左 | 完全相同 |
| `mapping/cascade.ts` | `B301C21164DA702626711FE8ACE142F1C82384A09C687F163C8306839891F8FE` | 同左 | 完全相同 |
| `mapping/mapping-store.ts` | `225B5DB2B22B6BA56659E7180C1182A9938FF5D9BFA6092A61F3D57BB427EB9F` | 同左 | 完全相同 |
| `remap/reference-scan.ts` | `0A54C93AB3273D5D40FB79101A34603BA024DE382681FE079B5368978195F10C` | 同左 | 完全相同 |
| `lib/workflows/search-replace/indexer.ts` | `BA4A3881475C95397A896846580234DE3EE296A7A64AD2AE7FCD8E2C5FFC52B7` | 同左 | 完全相同 |
| `blocks/registry.ts` | `E4F121783290A1FEACFDD7B816BA0F06F6DAECD76CF493B25F26695A5829D609` | 同左 | accessor 相同 |
| `blocks/registry-maps.ts` | `63173FE1CDCA3A360E37E3F8086F39FBE2ECBA214AB8EEF49957CE006A68A318` | `1579AB23150A33551758F0FB641B42704F75AFC35DE8F760330C43A7C162B6EB` | Polaris 新增 78 行注册：Feishu、Meegle、channel wait 及 Polaris Identity/Assignment/Approval/Context/Document/HR/MAT/Risk/Todo 等 |
| `tools/params.ts` | `CE940F06DC78BD183158AB5581EAF9786D1B473F036AEBED597CE9C26AC182C9` | 同左 | 完全相同 |
| `tools/utils.ts` | `BBB4D356CDAA078308D10A5E3C7F895FC25B5C81159F4C963A80E844DFE395E6` | 同左 | 完全相同，但静态 import 全量 tool registry |
| `tools/registry.ts` | `F13B3B3B931246B52D077F94D6330E89901606C1B85E0C0A144566EFA9ABB657` | `9E92D2C48A45553F418D6EE80603894717D6250CCD31AE0FFF537885E00000B0` | Polaris 新增 85 行 Feishu/Meegle/Polaris Biz 工具 import 与注册 |

迁移基线不能只复制 Sim2 metadata。Polaris 新 block/tool 也必须进入生成后的 reference metadata manifest，否则这些 workflow 的 dependent/reference preview 会漏项。folder/file-folder 的 DB adapter 应以目标 schema 的 split entities 为准，不把两套 donor helper 兼容层带进 application module。

## 3. 精确请求 wire contract

### 3.1 请求

- Method：`GET`
- Path：`/api/workspaces/[id]/fork/diff`
- Path params：
  - `id: string`，必须非空；不要求 UUID。
- Query：
  - `otherWorkspaceId: string`，必须非空；不要求 UUID。
  - `direction: "push" | "pull"`。
- Body：无；不得为了实现方便新增 body。
- Auth：Better Auth session user；session 或 `session.user.id` 缺失时返回 401。
- 方向：
  - `push`：`id` 是 source，`otherWorkspaceId` 是 target。
  - `pull`：`otherWorkspaceId` 是 source，`id` 是 target。

### 3.2 成功响应（HTTP 200）

所有字段都由 donor server 发出。`excludedSourceWorkflows` 与 `excludedTargetWorkflows` 在 response parser 中有 `.default([])`，用于新 client 读取旧 server；它们在原生 server response 中仍应显式发送。

```ts
interface GetForkDiffResponseV1 {
  sourceWorkspaceId: string
  targetWorkspaceId: string
  willUpdate: integer
  willCreate: integer
  willArchive: integer
  workflows: Array<{
    action: 'update' | 'create' | 'archive'
    currentName: string
    otherName: string
  }>
  excludedSourceWorkflows: string[]
  excludedTargetWorkflows: string[]
  unmappedRequired: ForkUnmappedReferenceV1[]
  unmappedOptional: ForkUnmappedReferenceV1[]
  mcpReauthServerIds: string[]
  inlineSecretSources: string[]
  dependentReconfigs: ForkDependentReconfigV1[]
  resourceUsages: ForkResourceUsageV1[]
  copyableUnmapped: ForkCopyableUnmappedV1[]
  clearedRefs: ForkClearedRefV1[]
}

interface ForkUnmappedReferenceV1 {
  kind:
    | 'credential' | 'env-var' | 'knowledge-base' | 'knowledge-document'
    | 'table' | 'file' | 'mcp-server' | 'custom-tool' | 'skill'
  sourceId: string
  required: boolean
  blockName?: string
}

interface ForkDependentReconfigV1 {
  parentKind: 'credential' | 'knowledge-base' | 'table'
  parentSourceId: string
  parentContextKey: string
  targetWorkflowId: string
  targetBlockId: string
  blockName: string
  subBlockKey: string
  selectorKey: string
  title: string
  toolName?: string
  currentValue: string
  sourceValue: string
  required: boolean
  providesContextKey?: string
  consumesContextKeys: string[]
  context: Record<string, string>
}

interface ForkResourceUsageV1 {
  parentKind: ForkUnmappedReferenceV1['kind']
  parentSourceId: string
  workflows: Array<{ workflowId: string; workflowName: string }>
}

interface ForkCopyableUnmappedV1 {
  kind: 'knowledge-base' | 'table' | 'custom-tool' | 'skill' | 'file' | 'mcp-server'
  sourceId: string
  label: string
  parentId: string | null
  parentLabel: string | null
  referenced: boolean
}

type ForkClearedRefV1 =
  | (ForkClearedRefBaseV1 & {
      cause: 'reference'
      kind: ForkUnmappedReferenceV1['kind']
      sourceDeleted: boolean
    })
  | (ForkClearedRefBaseV1 & {
      cause: 'workflow'
      kind: 'workflow'
    })
  | (ForkClearedRefBaseV1 & {
      cause: 'dependent'
      kind: ForkUnmappedReferenceV1['kind']
      parentKind: ForkUnmappedReferenceV1['kind']
      parentSourceId: string
    })

interface ForkClearedRefBaseV1 {
  targetWorkflowId: string
  workflowName: string
  blockId: string
  blockLabel: string
  fieldLabel: string
  sourceId: string
  sourceLabel: string
}
```

`workflows` 面向当前打开的 `id` 定向：`currentName` 始终是当前 workspace 侧名字，`otherName` 是另一侧名字。create 两侧同名；archive 两侧同名。

### 3.3 错误 body

| 场景 | Status | Body |
|---|---:|---|
| 无 session | 401 | `{ "error": "Unauthorized" }` |
| params/query 无效 | 400 | `{ "error": "Validation error", "details": ZodIssue[] }` |
| 非直接 fork edge | 400 | `{ "error": "These workspaces are not a direct fork edge", "requestId": string }` |
| workspace 不存在/已 archived | 404 | `{ "error": "Workspace not found", "requestId": string }` |
| deployment/AppConfig 关闭 | 404 | `{ "error": "Workspace forking is not enabled on this deployment", "requestId": string }` |
| billing 开启但非 Enterprise | 403 | `{ "error": "Workspace forking is available on Enterprise plans only", "requestId": string }` |
| 非 admin | 403 | `{ "error": "Admin access is required for this workspace", "requestId": string }` |
| 非 typed 异常 | 500 | `{ "error": "Internal server error", "requestId": string }` |

401/validation body 不含 `requestId`；wrapper 仍在所有 response header 写入 `x-request-id`。原生 handler 应保留现有 body 兼容性。

## 4. Auth / validation / gate / admin 精确优先级

执行顺序必须冻结为：

1. session auth；
2. path/query validation；
3. `resolveForkEdge(id, otherWorkspaceId)`；
4. 按 direction 解析 source/target；
5. source active workspace lookup + effective permission；
6. source deployment/billing/AppConfig gate；
7. source admin check；
8. target active workspace lookup + effective permission；
9. target deployment/billing/AppConfig gate；
10. target admin check；
11. diff read/planning。

由此产生的非直觉但兼容所需行为：

- edge 检查先于 workspace 404。任一 ID 不存在、已 archived、两 ID 相同或不是直接父子，首先都是 400 direct-edge error。
- gate 先于 admin。workspace 存在但 viewer 无权限时，deployment/Enterprise/AppConfig 错误可能先于 admin-required。
- source 的所有错误先于 target；`pull` 会交换哪一侧先被检查。
- edge resolver 只接受 active direct parent/child；不支持祖先/后代、多跳或 sibling。
- source 与 target 都要求 admin；只有当前 workspace admin 不够。

目标 use case 不能为了“更合理”改成先 current admin、再 edge，除非另立 breaking change。

## 5. 依赖闭包

### 5.1 DB

GET 无写入，但读取范围很大：

- workspace、permission、organization membership；
- billing/organization entitlement；
- workflow、workflow deployment version；
- normalized workflow state tables（blocks、edges、loops/parallels、variables 等）；
- fork resource mapping、fork block mapping、fork dependent values；
- workspace environment；
- credential；
- table；
- knowledge base、document、knowledge connector；
- MCP server；
- custom tool；
- skill；
- workspace file 与 file folder；
- target draft workflow blocks。

`mapping/cascade.ts` 只读取 `encryptedApiKey` 是否存在以生成 review 描述，不解密也不回传密文。

### 5.2 Registry

存在两条重量级路径：

```text
dependent-reconfigs / cleared-refs / remap-references
  -> blocks/registry
  -> blocks/registry-maps
  -> 全量 block definitions
```

```text
remap-references
  -> search-replace/indexer
  -> tools/params
  -> tools/utils
  -> tools/registry
  -> 全量 tool definitions
```

这些 registry 是 API-1032 编译/启动重量的主要来源。Polaris 又在两个 registry 中加入完整 Biz 定义，因此复制旧闭包会同时复制 Feishu/Meegle/HR 等实现依赖。

### 5.3 Executor / Sandbox

- 直接运行时引用：`executor/constants`、`executor/utils/reference-validation`，用于识别 `<...>` / env-var / resource reference。
- 没有调用 `Executor`、LoopOrchestrator、execution core。
- 没有启动 Node worker、E2B、Daytona 或 `isolated-vm` sandbox。
- 全量 registry 中包含“可在执行时使用 sandbox”的 block/tool definitions，但 API-1032 本身不执行这些工具。

因此迁移判定是：API-1032 属于 API backend，不属于 execution 或 sandbox；只应抽取 reference syntax 和 metadata，不应依赖执行系统。

### 5.4 Billing / AppConfig / Auth / Crypto

- Billing：`isBillingEnabled` + `isOrganizationOnEnterprisePlan`，source 与 target 各执行 gate。
- AppConfig：billing/AppConfig 模式下 `workspace-forking` rollout，source 与 target各检查一次。
- Auth：session + effective workspace permission，org owner/admin 可派生 workspace admin。
- Crypto：`block-identity.ts` 使用 `node:crypto.createHash` 做 deterministic block ID；不是 secret encryption。API-1032 不解密 credential、Feishu secret 或 connector API key。

## 6. 前端实际消费的 metadata

`useForkDiff` 只通过 `@/lib/api/contracts/workspace-fork` 和 `requestJson` 调用 HTTP；这是目标前端应保留的形态。当前 UI 实际消费：

| Response 字段 | 当前消费方式 |
|---|---|
| `sourceWorkspaceId` / `targetWorkspaceId` | resource selector 与 target/current 定向 |
| `workflows` | change list、rename、archive confirm |
| `excludedSourceWorkflows` / `excludedTargetWorkflows` | 灰色 excluded rows 与 tooltip |
| `mcpReauthServerIds` | 只用 `.length` |
| `inlineSecretSources` | 只用 `.length`，不展示字符串 |
| `dependentReconfigs` | required gate、selector context、save/promote dependent values |
| `resourceUsages` | mapping row 下的 workflow usage |
| `copyableUnmapped` | copy picker、默认选择 referenced 项 |
| `clearedRefs` | blocking/dependent clear 列表 |

当前 UI 不直接使用 `willUpdate`、`willCreate`、`willArchive`、diff response 的 `unmappedRequired` 或 `unmappedOptional`；它用 `workflows` 自己构造 preview，并使用 mapping endpoint/promote response 处理 required mappings。为 wire compatibility，API-1032 原生迁移仍须保留这些字段；后续可另开 v2 summary/detail contract，不在本次迁移中偷偷删除。

前端只能 import `@sim/api-contracts/workspace-forking` 的 schema/type 和 feature-local view model。禁止 import：

- `apps/api/**`
- DB/schema
- workflow planner/scanner
- block/tool registry
- billing/AppConfig adapters
- executor/sandbox
- encryption。

## 7. 性能、N+1 与大对象风险

### 7.1 已确认的 N+1

`loadSourceDeployedStates`：

1. 一次查询列出 deployed source workflows；
2. 对每个 workflow 查询 active deployment version；
3. 对每个 workflow 再加载完整 normalized state；
4. 以并发度 5 分批执行。

复杂度仍是 `O(workflows × state-table-round-trips)`。1000 workflow 上限只是内存安全阀，不是延迟预算。它最可能导致 route 长时间等待；迁移时应改成 workspace snapshot bulk reader：

```ts
loadActiveDeployedWorkspaceSnapshot(workspaceId): Promise<{
  workflows: DeployedWorkflowSummary[]
  statesByWorkflowId: Map<string, WorkflowState>
}>
```

用固定数量的 `WHERE workflow_id IN (...)` 查询分别加载 active versions 和 normalized tables，再在内存按 workflow 分组；必要时按 100/200 IDs chunk，query count 与 workflow 数量的关系应是 chunked fixed-bound，而非每 workflow 查询。

### 7.2 已批量化的部分

- mapping rows：一次；
- source/target env：并行；
- mapped target existence：按 kind 并行，至多一个 query/kind；
- target/source workflow rows：并行；
- resource label/source copyables：按 kind 批量；
- block map、dependent value、target drafts：批量；
- source liveness：按 kind 批量；
- route 后半段五类独立 read 使用 `Promise.all`。

这些不应在迁移中退化成 per-reference/per-block 查询。

### 7.3 固定成本仍然偏高

一次非空 diff 在 workflow state 之外还可能执行：

- edge/两侧 access/gate；
- 1 mapping + 2 env；
- 至多 8 个 target-existence queries；
- 2 workflow inventory queries；
- cascade 最多 3 类资源查询；
- copyable labels 最多 6 类；
- source copyables 6 类；
- block map；
- dependent values；
- target draft blocks；
- source candidate labels 约 8 类；
- source workflow names；
- excluded source workflows；
- cleared-ref liveness 最多 8 类。

应在 adapter 内保持并行批量读取，并记录 `workflowCount`、`blockCount`、`queryCount`、`responseBytes`、`durationMs`；不得记录 workflow contents、credentials 或 secret-bearing headers。

### 7.4 大对象与 response 风险

- 最多 1000 个完整 source states 同时驻留内存。
- copyable resource 是 6 个 kind，每 kind 上限 1000，理论上约 6000 项。
- candidate labels 还包含 credential/env/document 等额外集合。
- `dependentReconfigs`、`resourceUsages`、`clearedRefs` 随 blocks × fields 增长，contract 没有总数组/response byte cap。
- source/target workflow inventory query 本身没有显式 limit。
- React Query 在 mapping save/promote settled 后会重新拉 diff；direction switch 使用 placeholder data，昂贵 preview 可能重复执行。

原生验收应至少设：

- p95/p99 目标和 100/500/1000 workflows fixtures；
- response byte telemetry；
- API timeout/abort 传播；
- 并发请求下的 pool 使用测试；
- 不改变 v1 wire 的 server-side bounded snapshot 和 bulk queries。

### 7.5 稳定 ID 正确性风险

`computeForkPromotePlan` 对没有 active mapped target 的 source workflow 调用随机 `generateId()` 生成 preview target ID；API-1032 会把该 ID放入 `dependentReconfigs.targetWorkflowId`/`clearedRefs.targetWorkflowId`。GET preview 与 POST promote 会分别重算 plan，因此新出现且尚无 workflow identity mapping 的 create item 可能获得不同 ID，导致 preview 保存的 dependent override 无法匹配 apply plan。

迁移必须用规则测试锁定并修复：

- 同一 edge + source workflow 的 proposed target ID 在 preview/apply 间稳定；
- 可采用 edge namespace + source workflow ID 的 deterministic ID，或先持久化 reservation/mapping；
- 不能只让 GET 与 POST “碰巧复用同一个进程内对象”。

## 8. 推荐 deep module 设计

### 8.1 Application interface

复用：

- `evaluateForkingAccess`
- `WorkspaceForkCurrentAccessReader.findActiveForViewer(workspaceId, viewerId)`
- `ForkEntitlementReader`
- `ForkRolloutReader`
- `ForkingRuntimeConfig`

新增：

```ts
interface DirectWorkspaceForkEdge {
  childWorkspaceId: string
  parentWorkspaceId: string
}

interface DirectWorkspaceForkEdgeReader {
  findActiveEdge(
    workspaceAId: string,
    workspaceBId: string
  ): Promise<DirectWorkspaceForkEdge | null>
}

interface WorkspaceForkDiffReader {
  read(input: {
    edge: DirectWorkspaceForkEdge
    currentWorkspaceId: string
    sourceWorkspaceId: string
    targetWorkspaceId: string
    direction: 'push' | 'pull'
  }): Promise<GetForkDiffResponseV1>
}
```

`WorkspaceForkDiffReader` 返回完整 viewer-independent preview；viewer auth/gate 在 application use case 先完成。interface 不暴露 DB executor、registry、WorkflowState 或 scanner internals。删除该 module 时，bulk read、scan、mapping、label、dependent 与 response assembly 复杂度会重新散落到 caller，符合 deep module 的删除测试。

### 8.2 Use case 顺序

建议文件：

- `apps/api/src/modules/workspace-forking/application/get-fork-diff.ts`
- `apps/api/src/modules/workspace-forking/interface/create-get-fork-diff-handler.ts`
- `apps/api/src/modules/workspace-forking/ports/direct-workspace-fork-edge-reader.ts`
- `apps/api/src/modules/workspace-forking/ports/workspace-fork-diff-reader.ts`

`createGetForkDiffUseCase.execute(context, request)`：

1. parse params/query；
2. edge reader；
3. 按 direction 定 source/target；
4. source current-access -> shared gate -> admin；
5. target current-access -> shared gate -> admin；
6. diff reader；
7. `getForkDiffResponseV1Schema.parse`。

Handler 负责 session-before-validation、error/status/body mapping 与 request ID；use case 返回 discriminated result：

- `validation-error`
- `direct-edge-required`
- `workspace-not-found`
- `deployment-disabled`
- `enterprise-required`
- `admin-required`
- success。

### 8.3 Production adapters 与 internal seams

建议：

- `DrizzleDirectWorkspaceForkEdgeReader`
- `DrizzleWorkspaceForkDiffReader`

`DrizzleWorkspaceForkDiffReader` 内部实现可以拆目录，但这些是 implementation locality，不扩大 application interface：

```text
apps/api/src/infrastructure/postgres/workspace-forking/diff/
  drizzle-workspace-fork-diff-reader.ts
  load-deployed-workspace-snapshot.ts
  load-fork-diff-resources.ts
  load-fork-diff-mappings.ts
  fork-sync-planner.ts
  project-fork-diff-response.ts
```

内部 seams：

- `DeployedWorkspaceSnapshotReader`：真实 PG adapter + fixture/in-memory adapter；
- `WorkflowReferenceMetadataCatalog`：generated manifest adapter + small fixture adapter；
- `ForkSyncPlanner`：纯计算，同时被 preview 和 promote 使用。

不要为每一张表创建一个 application port。Postgres 是 local-substitutable dependency；复杂 query/read model 应留在一个深 Postgres adapter 内，通过真实 PG fixture 验证。

### 8.4 Registry 替代

新增数据化 package/manifest，例如：

```text
packages/workflow-reference-metadata/
  src/types.ts
  src/generated/block-reference-metadata.ts
  src/catalog.ts
  scripts/generate-from-definitions.ts
```

manifest 只保留 scan 所需字段：

- block type/name；
- subblock id/type/title/required；
- `dependsOn`、selector/context metadata；
- condition/canonical mode/visibility 所需静态值；
- nested tool operation -> param metadata；
- resource kind/reference codec 标识。

生成脚本可以在构建工具进程读取 Sim2 + Polaris definitions；运行时 API 与浏览器都不得 import donor registries。CI 做：

- generated file clean check；
- 每个 registered Sim2/Polaris block/tool 都有 metadata coverage 或明确 no-reference annotation；
- manifest import graph不得到达 tools implementation、provider SDK、auth、crypto、DB、executor、sandbox。

## 9. Contract 与测试计划

### 9.1 纯 application / handler 测试

1. auth 在 validation 之前；无 session + invalid query 仍返回 401。
2. `id`、`otherWorkspaceId` 空值和非法 direction 返回 400 details。
3. same ID、missing/archived/non-edge 均先返回 exact 400 direct-edge message。
4. direction 的 source/target orientation。
5. source 错误优先于 target。
6. source/target 各自的：
   - not found；
   - deployment disabled；
   - Enterprise required；
   - AppConfig disabled；
   - admin required。
7. gate 在 admin 之前。
8. planner 只在两侧全部授权后调用一次。
9. exact response schema/wire fixture，包括三个 `clearedRefs` variants、optional fields 与 excluded defaults。
10. unexpected error 500 + requestId；typed errors保留 exact body。
11. API-1032 native routing 命中，legacy Next facade 不被调用。

### 9.2 纯规则测试

共享 `ForkSyncPlanner` 通过 fixture catalog/state 测：

- push/pull；
- update/create/archive；
- deleted 与 merely undeployed source 的区别；
- source/target excluded；
- rename orientation；
- required/optional refs；
- credential/env/KB/document/table/file/MCP/custom-tool/skill；
- nested tool params 与 Polaris Feishu/Meegle/HR block metadata；
- cascade env/credential/MCP OAuth/inline-secret description；
- dependent current-value precedence：stored > target draft，create fallback source；
- copyable referenced/unreferenced、mapped wins、deleted source；
- workflow refs 与 cleared refs；
- preview/apply stable proposed workflow IDs；
- no secret value in response。

### 9.3 真实 PostgreSQL 测试

真实 PG fixture 覆盖 query/read semantics，不用 mock Drizzle chain：

- direct active edge、archived workspace；
- explicit admin 与 org-derived admin；
- source/target workspace；
- active deployment、ghost deployment、archived/undeployed/excluded workflows；
- normalized blocks/edges/variables；
- identity/resource/block mappings；
- target draft dependent value与 persisted dependent value；
- 每种 resource 的 active/deleted rows；
- Polaris split `workflow_folder` / `workspace_file_folder`；
- file 以 storage key 做 mapping/liveness，folder labels 正确；
- archived source resource 标记 `sourceDeleted`；
- response 通过共享 schema parse。

加入 query budget assertion：

- workflow snapshot query count 不随 workflow 数量线性增长，只随固定 chunk 数增长；
- resource/liveness 至多每 kind 一次；
- 0 workflows / 0 references 不执行无意义 queries。

规模测试至少 0、1、100、500、1000 workflows，验证：

- 无 pool starvation；
- 内存与 response bytes 有界且被记录；
- 500/1000 场景不出现 per-workflow SQL。

### 9.4 架构规则

- `packages/api-contracts` 不得 import DB、application、registry、executor、sandbox。
- `apps/web` 不得到达 `apps/api`、DB、registry、executor、sandbox。
- workspace-forking application module只依赖 contracts/auth/logger/config/own ports。
- diff Postgres adapter不得 import donor `blocks/registry`、`tools/registry`。
- generated metadata manifest闭包不得包含 provider SDK、tool request implementations、Feishu credential adapter、crypto 或 sandbox。

## 10. 实现冻结清单

- [ ] contract 先落到 `@sim/api-contracts/workspace-forking`，保留 v1 exact wire。
- [ ] edge check / source / target 错误优先级与 donor 一致。
- [ ] 复用 shared gate/current-access seam。
- [ ] 新增一个 deep diff reader，不新增一堆 table-level application ports。
- [ ] bulk load deployed workflow state，消除 per-workflow N+1。
- [ ] preview 与 promote 共用纯 planner。
- [ ] proposed target workflow ID 跨 preview/apply 稳定。
- [ ] Polaris block/tool metadata进入 data-only manifest。
- [ ] 不 import donor block/tool registries。
- [ ] 不引入 Executor/Sandbox/secret crypto。
- [ ] 纯规则、handler、真实 PG、query budget、browser import-closure 全部通过后再把 API-1032 标记 native。
