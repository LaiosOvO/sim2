# Polaris 前后端分离与注册表重构审计

> 状态：持续更新
> 首次记录：2026-07-30
> 审计范围：`D:\workspace\workflow\sim2`（底座）与 `D:\polaris`（二开平台）
> 输入材料：用户提供的《项目问题.md》、仓库源码、Next.js 开发 trace
> 当前阶段：Phase 1 工程拓扑、运行时矩阵与边界门禁实施

## 1. 文档用途

本文件用于持续记录：

1. 已由代码或运行数据证实的事实；
2. 前端、后端和共享契约之间的依赖问题；
3. 已确认与待确认的架构边界；
4. 现有临时措施及其局限；
5. 后续重构方案、验收指标和风险。

每轮代码审计结束后直接更新对应章节，不将未验证猜测写成既定事实。

## 2. 当前结论

当前性能问题的主因不是数据库、Bun/Node 启动方式或某一个慢接口，而是
client/server seam 失效：

- 前端页面和普通 API 为获取少量 metadata 或 session，静态导入了完整工具运行时；
- Tools、Blocks、Triggers、Providers、鉴权、执行器、加密和 UI 配置通过注册表与通用
  `utils` 相互连通；
- Next.js 在首次访问页面或接口时编译数千个与该请求无关的模块；
- Turbopack、webpack 暴露的是同一依赖问题的不同表现，不是根因；
- 继续逐条修复 `node:crypto` import trace 只能移动问题，不能建立可持续边界。

## 3. 性能证据

从 `apps/sim/.next/dev/trace` 提取到：

- 146,914 条 trace event；
- 206 次 `compile-path`；
- 路由编译累计约 4,191.3 秒；
- 峰值 RSS 约 17.71 GiB；
- 峰值已用 heap 约 8.06 GiB；
- 发现 6 次 `server-restart-close-to-memory-threshold`；
- trace 中包含 14 次开发服务器启动。

部分最长冷编译：

| 路径 | 编译耗时 |
| --- | ---: |
| `/api/mothership/events` | 303.9 秒 |
| `/workspace/[workspaceId]/home` | 272.4 秒 |
| `/api/workspaces/[id]/pm/projects` | 250.5 秒 |
| `/api/organizations/[id]/whitelabel` | 199.6 秒 |
| `/api/users/me/settings` | 150.3 秒 |
| `/api/knowledge` | 135.9 秒 |
| `/api/providers/base/models` | 112.8 秒 |
| `/api/logs/stats` | 91.1 秒 |
| `/api/logs` | 90.9 秒 |

这与“打开一个接口可能需要两分钟”的现象一致，并且能由编译图和内存压力解释。

上面的数字是首次审计快照。2026-07-30 02:48（Asia/Shanghai）再次以只读方式采集仍在运行的
Polaris 开发产物时，trace 已增长到 190,821 个 event、281 次 `compile-path`、累计
4,922.1 秒编译、19 次内存阈值重启；峰值 RSS 为 19,020,701,696 bytes，峰值 heap used
为 8,651,292,832 bytes。开发静态产物共有 1,475 个 JavaScript/CSS 文件，原始体积
264,241,331 bytes，逐文件 gzip 合计 38,280,310 bytes。其中 Blocks、Tools 和 Icons
三个一方开发 chunk 分别达到约 1.43 MB、0.91 MB 和 0.32 MB gzip。开发产物总和不能当成
单路由 bundle，但它清楚说明重型注册表已经成为独立的大 chunk。

Phase 1 已将证据固化为以下可重复资产：

- `docs/testing/performance-baseline.json`：trace、route compile、RSS、chunk 与目标预算；
- `docs/testing/browser-runtime-closure-baseline.json`：588 个 Client root 的传递闭包 ratchet；
- `docs/testing/browser-bundle-policy.json`：最终 bundle deny list、重型依赖 allow scope 与预算；
- `scripts/architecture/bundle-budget/collect-next-baseline.ts`：从任意 `.next` 目录重新采集；
- `scripts/architecture/dependency-graph/check-browser-runtime-closure.ts`：输出最短污染链并在 CI
  阻止债务增加。

当前闭包基线为：297 个 Client root 可达 Executor、267 个可达 execution/sandbox、200 个
可达运行时 Tool/Block/Trigger、71 个可达 database/auth/secrets。它们是待归零的历史债务，
不是允许长期保留的目标；新建 `features`、`api-client`、`browser`、`catalog` 路径从第一天起
执行零预算。

补充外部 runtime 虚拟节点后，另有 233 个 Client root 可达 server crypto 或 Provider SDK；
最短链为 `generated-password-input.tsx -> lib/core/security/encryption.ts`。扫描器会把
`node:crypto`、`isolated-vm`、E2B、Daytona、飞书 Node SDK、AWS/Google Cloud SDK、
Anthropic/OpenAI SDK 都作为服务端运行时节点传播，避免 workspace 之外的依赖被误当作安全。

## 4. 注册表规模

### 4.1 底座与 Polaris 对比

| 注册内容 | Sim2 | Polaris | 增量 |
| --- | ---: | ---: | ---: |
| Tool 注册项 | 4,340 | 4,378 | +38 |
| Block 注册项 | 313 | 331 | +18 |
| Block Meta 注册项 | 248 | 265 | +17 |
| Trigger 注册项 | 396 | 397 | +1 |

Polaris 的扩展增加了静态图规模，但根本问题继承自底座：展示模型与执行模型共用静态注册
图，新增任何 Integration 都会扩大所有错误消费者的编译闭包。

### 4.2 关键文件

| 文件 | 大小/规模 | 当前职责问题 |
| --- | --- | --- |
| `apps/sim/tools/registry.ts` | 约 366.8 KB、9,162 行、274 个顶层 import | 静态聚合工具实现 |
| `apps/sim/tools/index.ts` | 约 82.9 KB、2,520 行 | 工具导出入口过宽 |
| `apps/sim/blocks/registry-maps.ts` | 约 41.2 KB、298 个顶层 import | metadata 与完整 BlockConfig 同图 |
| `apps/sim/triggers/registry.ts` | 约 36.2 KB | 聚合 Trigger 配置 |
| `apps/sim/providers/utils.ts` | 约 50.4 KB、1,517 行 | UI helper 与工具参数处理混合 |
| `apps/sim/lib/auth/auth.ts` | 约 140.4 KB、3,652 行 | session 查询与完整认证系统初始化混合 |
| `apps/sim/components/icons.tsx` | 约 702.3 KB、8,760 行 | 图标目录成为大型静态依赖 |

## 5. 已证实的依赖污染链

### 5.1 Provider helper 拖入完整工具注册表

```text
client component
→ providers/utils
→ tools/params
→ tools/utils
→ tools/registry
```

`providers/utils` 的前端消费者通常只需要 `getProviderFromModel`、`formatCost` 或展示能力
判断，但其静态依赖会拉入完整工具运行时。

### 5.2 Block 注册图循环扩大

```text
blocks/registry
→ blocks/registry-maps
→ individual block
→ blocks/utils
→ providers/utils
→ tools/params
→ tools/utils
→ tools/registry
```

部分 Block 还导入 `@/triggers`，使 Block、Trigger 和 Tool 注册图连为一体。

### 5.3 普通鉴权接口拖入执行系统

```text
ordinary API route
→ lib/auth
→ auth.ts
→ workflow lifecycle
→ webhook/provider subscriptions
→ MCP / executor
→ tools runtime registry
```

`getSession` 的调用方只需要验证 session，但 import 会初始化 Better Auth 全配置并触达
计费、SSO、组织插件、邮件、生命周期清理、Webhook、MCP 和 Executor。

### 5.4 客户端直接导入服务端加密模块

```text
generated-password-input.tsx
→ lib/core/security/encryption.ts
→ server env / Buffer / AES
```

客户端只需要随机密码生成，却导入了同时承担服务端加解密的模块。这是明确的边界违规样例。

## 6. 静态依赖闭包

使用 TypeScript AST 构建本地 import graph，并排除 type-only import 后：

| 入口 | 本地模块数 | Tool 模块 | Block 模块 | Trigger 模块 |
| --- | ---: | ---: | ---: | ---: |
| `providers/utils.ts` | 6,009 | 4,689 | 305 | 481 |
| `tools/params.ts` | 6,009 | 4,689 | 305 | 481 |
| `blocks/registry.ts` | 6,009 | 4,689 | 305 | 481 |
| Logs 页面 | 6,506 | 4,691 | 308 | 482 |
| Workflow 页面 | 6,952 | 4,690 | 未单列 | 未单列 |
| Home 页面 | 7,907 | 4,706 | 310 | 483 |
| `/api/users/me/settings` | 6,756 | 4,705 | 未单列 | 未单列 |
| `/api/providers/base/models` | 6,753 | 未单列 | 未单列 | 未单列 |
| `/api/logs` | 6,766 | 4,705 | 未单列 | 未单列 |

因此，慢接口并不一定执行了工具逻辑；仅静态 import 到共享入口就足以触发大规模编译。

## 7. 《项目问题.md》审阅

文档对以下问题的判断与代码和 trace 一致：

- Turbopack/Monaco CSS 错误不是根因；
- webpack 的 `node:crypto` 错误暴露了 client/server seam 违规；
- `sanitization`、`serializer`、`block-outputs`、`tools/params` 等共享路径会间接触达
  Runtime Registry；
- 局部断链能暂时消除一条错误路径，但新的路径会继续出现；
- 需要系统重构，而不是继续按构建报错逐条打补丁。

需要修正的方案点：

1. 不应再维护一个手写且可执行的 `client-registry.ts`。前端应消费生成的、可序列化的
   Tool Catalog。
2. `server-registry.ts` 也不应只是另一个静态导入全部实现的大对象。目标应是
   Integration Manifest 加后端按需加载。
3. `params/client.ts` 不能包含回调、Provider SDK 或运行时 schema enrichment；共享部分
   必须保持纯数据或纯函数。
4. 路径黑名单不足以防止间接污染。边界检查需要分析完整 import graph，并配合
   `server-only` 标记和 package export map。
5. 文档缺少执行沙箱边界与可量化验收指标，本审计已补充。

## 8. 执行沙箱边界

### 8.1 已确认归属

执行沙箱属于后端，包括：

- `isolated-vm` 任务执行；
- E2B 与 Daytona Provider；
- Sandbox task registry；
- Broker；
- 环境变量和 Provider 凭证；
- 文件挂载、输出回收、超时、取消、资源限制、审计与清理。

浏览器只能通过稳定契约提交任务并读取状态或结果。

### 8.2 仓库中名称相近但不同的概念

- `iframe sandbox` 和 CSP：前端预览隔离；
- `use-sandbox-block-constraints`：练习模式的编辑器限制；
- E2B、Daytona、`isolated-vm`：后端执行沙箱。

后续代码和文档必须使用“执行沙箱”“预览隔离”“练习约束”区分三者。

### 8.3 当前实现评价

`lib/execution/remote-sandbox/types.ts` 中的 `SandboxProvider` 与 `SandboxHandle` 已形成
较小的执行接口，并且存在 E2B、Daytona 两个真实 Adapter。这是可保留并迁移到后端的
深模块雏形。

需要改变的是可见性和归属：

- Provider Adapter、任务注册表和运行时类型不得暴露给前端；
- 共享层只保留任务请求、状态、结果和错误协议；
- API route 不应继续承担全部执行编排，后续应收敛到后端 SandboxExecution 模块；
- 所有执行入口都必须经过统一的鉴权、配额、超时、取消和清理策略。

## 9. 已有止痛措施

`next.config.ts` 已加入 minimal registry alias：

- `@/tools/registry` → `tools/registry.minimal.ts`
- `@/blocks/registry-maps` → `blocks/registry-maps.minimal.ts`

配置注释记录：完整共享依赖图会把约 247 个工具 Integration、约 2,074 个模块拖入路由；
minimal 模式曾将 `/logs` 从约 16 GB / 4.9 分钟降低到约 5 GB / 15 秒。

Polaris 还存在开发预热和 Turbopack cache 相关改动。这些措施能降低等待或提前编译，但
存在明显局限：

- minimal registry 会丢失功能，不是长期产品模型；
- 预热只是把等待提前；
- 缓存不能阻止服务端模块进入错误的编译图；
- 内存和构建稳定性仍取决于静态依赖规模。

## 10. 可复用的正确模式

仓库已有可作为重构样板的实现：

1. `connectors/registry.ts` 只聚合客户端安全的 `meta.ts`；
2. `connectors/registry.server.ts` 聚合后端实现；
3. Enrichment 将声明数据放在 `types.ts`，执行放在 `run.ts`；
4. `lib/integrations/integrations.json` 已证明生成静态 Catalog 可行；
5. `packages/auth/src/verify.ts` 已为 Realtime 提供轻量认证验证入口；
6. `packages/workflow-types` 与 `workflow-renderer` 已证明纯类型和渲染能力可以移出
   `apps/sim`。

## 11. 已确认的迁移方向

### 11.1 目标与来源

- 目标平台：完成架构重构后的 Sim2；
- 迁移来源：现有 Polaris 业务实现；
- Polaris 不是新架构底座，不能整仓复制后继续在原依赖图上拆分；
- 原 Sim2 与 Polaris 在重构期间都应保留为可对照的只读事实来源。

### 11.2 Git 与目录证据

- Sim2 当前远端是 `LaiosOvO/sim2.git`；
- Polaris 当前远端是 `LaiosOvO/polaris.git`；
- Polaris 对象库中不存在当前 Sim2 HEAD，两个目录不能依靠普通 cherry-pick 迁移；
- 强行合并 unrelated histories 会把架构重构和历史冲突混成一个不可审计步骤。

两个仓库也不是简单的包含关系：

- Sim2 有 `browser-protocol`、`desktop-bridge`、`terminal-protocol`；
- Polaris 有 `feishu-channel`、`meegle-connector`、`polaris-extension-sdk`。

直接复制 Polaris 会保留当前依赖污染，同时可能丢失 Sim2 新增能力。

### 11.3 推荐工作区策略

不创建空仓库，也不复制 Polaris。推荐从 Sim2 新建专用分支和 worktree：

```powershell
git -C D:\workspace\workflow\sim2 worktree add `
  -b refactor/sim2-frontend-backend-separation `
  D:\workspace\workflow\sim2-refactor `
  main
```

该命令目前只是建议，尚未执行。

后续职责：

```text
D:\workspace\workflow\sim2
  → 原始底座与回归对照

D:\polaris
  → 业务实现 donor 与行为对照

D:\workspace\workflow\sim2-refactor
  → 唯一的新架构实现与迁移目标
```

Polaris 迁移应维护 capability inventory，按业务纵切迁移：

1. 数据模型与迁移；
2. 领域规则；
3. 后端用例与契约；
4. Provider Adapter；
5. 前端页面；
6. 工作流模板；
7. 回归与迁移验收。

禁止按 `apps/sim`、`lib`、`components` 等技术目录整批复制。

## 12. 暂定目标 seam

```text
apps/web
  ├─ UI、页面、编辑器
  ├─ API client
  └─ 生成的 Tool/Block/Integration Catalog

packages/contracts
  ├─ HTTP 契约
  ├─ Workflow DTO
  ├─ Sandbox Job 契约
  └─ 纯 schema、类型和稳定 ID

apps/api
  ├─ Session/Auth
  ├─ 业务用例与查询
  ├─ Workflow admission
  ├─ Job 创建、状态、取消
  └─ 不执行重型工具或用户代码

apps/worker
  ├─ Workflow Executor
  ├─ Runtime Registry
  ├─ SandboxExecution
  └─ Integration runtime loaders

apps/realtime
  └─ 协作、执行状态和事件推送

后端共享模块
  ├─ DB、加密、审计
  ├─ Auth verification
  └─ Queue contracts
```

第一阶段不立即搬迁全部 API route。先在当前部署结构内建立编译 seam，验证依赖图收缩；
再决定物理拆分和独立部署。

## 13. 前后端分离能否解决当前问题

结论：能够解决主要问题，但前提是先建立依赖和构建 seam，不能只把目录或部署进程分开。

真正有效的条件：

- Web 编译图只能到达 UI、API client、纯契约和生成 Catalog；
- Runtime Registry、Auth 配置、Executor、SDK、加密和执行沙箱只能由后端/Worker 到达；
- 共享 package 必须是纯类型、纯 schema 或浏览器安全的纯函数；
- CI 检查间接 import graph，而不只是检查显式路径；
- Web 与 API 独立构建，Worker 不进入任何页面或普通查询接口的编译闭包。

仅将代码移动到 `frontend/` 和 `backend/` 两个目录、但继续共用当前 barrel 和 registry，
不会解决问题。

## 14. 后端语言与架构评估

### 14.1 Go 是否可用

Go 可以作为后端语言，但不建议在第一阶段用 Go 重写整个后端和工作流执行器。

原因：

- 当前慢点首先是 TypeScript 静态依赖图失控，不是 JavaScript 请求吞吐不足；
- Workflow Executor、工具参数转换、Block 序列化、Trigger.dev 任务、E2B/Daytona SDK
  和 `isolated-vm` 均已有 TypeScript 实现；
- 将 4,000 多个工具注册项和执行语义迁到 Go，会同时引入行为重写、双语言 schema、
  Auth/DB 兼容与完整回归风险；
- Go 重写不能自动阻止前端 import Runtime Registry。

### 14.2 当前推荐

第一阶段使用 TypeScript 后端模块化单体加独立 Worker：

```text
Next.js Web
    ↓ HTTP
Node/TypeScript API
    ↓ Job
Trigger.dev（先保留）
    ↓
Node/TypeScript Execution Worker
    ↓
Runtime Registry / Sandbox Adapter / Provider SDK
```

建议 API 运行于独立 Node 进程。框架可在 Spec 阶段比较 Fastify 与 Hono；不要在边界尚未
建立前同时更换语言、队列、Auth 和执行器。

### 14.3 Go 的合理切入点

若后续数据证明存在高并发连接、调度吞吐或资源代理瓶颈，可将 Go 用于：

- API gateway 或高吞吐查询服务；
- Sandbox provisioner / resource scheduler；
- 独立事件网关；
- 不承载 Tool/Block 语义的基础设施模块。

推荐的长期混合形态是 Go Control Plane 加 TypeScript Execution Plane，而不是一次性
Go 全量重写。只有通过稳定 HTTP、OpenAPI 或消息契约通信，不共享源码 import。

## 15. 执行沙箱集成方案

### 15.1 调用链

```text
Browser
  → POST execution/sandbox job
  → API 鉴权、授权、配额、幂等
  → 保存 Job 与不可变执行快照
  → Queue
  → Execution Worker
  → SandboxExecution interface
  → isolated-vm / E2B / Daytona Adapter
  → 对象存储保存大文件
  → DB 保存状态与结果引用
  → Realtime/SSE 推送进度
```

### 15.2 模块职责

`apps/api`：

- 验证 session 与 workspace 权限；
- 校验请求契约；
- 创建 execution/job；
- 查询状态、日志、结果；
- 发起取消；
- 不加载 Provider SDK 或运行用户代码。

`apps/worker`：

- 获取不可变 workflow snapshot；
- 加载需要的 Integration Runtime；
- 执行 Workflow；
- 调用执行沙箱；
- 处理 retry、timeout、AbortSignal、日志和最终状态。

`SandboxExecution` 深模块：

- 输入：任务类型、代码、资源预算、文件引用和取消信号；
- 输出：标准状态、stdout/stderr、结构化结果和输出文件引用；
- 内部 Adapter：`isolated-vm`、E2B、Daytona；
- Provider 选择由服务端配置决定，浏览器不可指定任意 Provider；
- 所有执行必须在 `finally` 中 kill/cleanup；
- 凭证只按最小权限注入，不进入前端或普通执行输出。

### 15.3 现有能力的处理

- 现有 `SandboxProvider` / `SandboxHandle` interface 与 E2B、Daytona Adapter 可以保留；
- 现有 `workflowExecutionTask` 与 Trigger.dev concurrency 控制先保留；
- `/api/function/execute` 中的编排逻辑逐步移入 Worker/SandboxExecution；
- 沙箱 bundle、`isolated-vm-worker.cjs` 和 Provider SDK 只进入 Worker 构建；
- 大文件通过 MinIO/对象存储引用传递，避免经过 Web 进程内存。

## 16. 暂定重构顺序

1. 建立 import graph 基线与前端禁入规则；
2. 将展示 metadata 投影为生成的 Catalog；
3. 拆分 `providers/utils`、`tools/params`、`tools/utils`；
4. 将 Runtime Registry 改为后端专用并按 Integration 懒加载；
5. 提取轻量 session verification seam，隔离完整 `auth.ts`；
6. 拆分随机密码生成与服务端加解密；
7. 收敛执行沙箱接口和后端编排；
8. 清理 Workspace 首屏与非编辑器页面的 Monaco/Editor 依赖；
9. 在功能回归和性能门槛通过后，再将 API/Executor 物理迁出 Next Web 应用；
10. 删除 minimal registry 临时模式。

## 17. 待确认决策

### D-001：底座 Integration 兼容范围（已确认）

2026-07-30 用户确认：

- 保留 Sim2 全量 Integration 的服务端执行能力；
- 保留基于稳定 Tool、Block、Trigger 标识的历史工作流执行兼容；
- 浏览器只消费生成的、可序列化的轻量 Catalog；
- Catalog 可以通过接口分页、分组或按需加载；
- 非当前任务所需的 Integration Runtime 在后端按需加载；
- 在该兼容基线上迁入 Polaris 业务扩展；
- 不通过直接删除大量 Integration 来换取编译性能。

执行兼容与前端目录加载范围是两个不同概念：保留全部历史执行能力，不代表浏览器必须
一次加载全部目录，更不代表前端可以导入 Runtime Registry。

### D-002：第一阶段后端语言（已确认）

2026-07-30 用户确认：

- 第一阶段采用 TypeScript 前端；
- 后端 API 使用 TypeScript；
- Workflow Executor 与执行沙箱使用独立 TypeScript Worker；
- Go 不进入第一阶段；
- Go 仅作为后续可独立替换的 Control Plane 或基础设施模块候选。

选择原因：

- 当前目标是切断编译依赖并迁移已有行为，不是重写执行语义；
- TypeScript 可以最大限度复用 Sim2/Polaris 的 Executor、工具、Trigger.dev 与 Sandbox
  Adapter；
- Web、API、Worker 通过契约和 Job seam 解耦后，未来仍可单独替换 API 或调度模块语言。

### D-003：API 渐进迁移方式（已确认）

2026-07-30 用户确认：

- 从第一天建立独立 TypeScript API 与 TypeScript Execution Worker；
- 旧 Next.js API Route 允许渐进迁移，不要求一次性搬迁实现；
- 全部 Route 必须在实施前一次性纳入迁移计划；
- 迁移计划必须包含逐 Route 归属、批次、风险和测试；
- 切流期间保持旧实现可回滚，直至新实现完成验收。

该决定采用绞杀式迁移：规划范围一次性完整，代码实现与流量切换分批完成。

### D-004：Next bundler 与 Vite（技术结论）

当前 `apps/sim` 使用 Next `16.2.11`。默认脚本调用 `next dev`/`next build`，使用 Next 16
默认的 Turbopack；仓库另有显式 `dev:webpack` 诊断脚本和 webpack alias 兼容配置，但项目
规则要求生产构建使用 Turbopack。因此：

- 当前慢编译不能归因于“仍在使用 Webpack”；
- Next 不提供受支持的 Vite bundler 替换配置；
- 保留 Next 而把 Webpack 换成 Vite不是可实施的单独改动；
- 使用 Vite 意味着迁移 Next App Router、Server Component、Route Handler、navigation
  和构建部署模型，是独立的 Web framework 迁移；
- 第一阶段先保持 Next + Turbopack，切断错误 import graph；达到前后端 seam 与性能验收
  后，再决定是否建立 Vite 迁移 Spec。

## 18. API 全量迁移规划基线

逐 Route 机器清单见：
`docs/architecture/api-migration-inventory.md`。

### 18.1 当前真实规模

| 范围 | Route 文件 | HTTP handler |
| --- | ---: | ---: |
| Sim2 | 990 | 1,202 |
| Polaris | 1,110 | 1,359 |
| 两仓库合并后的唯一路径 | 1,126 | 1,377 |

用户最初提到的 1,108 是较早口径；当前 Polaris 工作区实际已有 1,110 个 Route。完整迁移
还必须保留 16 个 Sim2 独有 Route，因此计划口径是 1,126 个唯一路径。

来源差异：

- 887 个共有且文件内容相同；
- 87 个共有但实现已分叉；
- 16 个仅存在于 Sim2；
- 136 个仅存在于 Polaris。

87 个分叉 Route 必须逐一做行为差异审阅，禁止默认用 Polaris 覆盖 Sim2。

### 18.2 第一版迁移分类

| 波次 | Route 数 | 内容 |
| --- | ---: | --- |
| W1 | 3 | 健康检查、环境与新 API 骨架 |
| W2 | 95 | 只读查询和低风险接口 |
| W3 | 263 | Core CRUD、文件和数据接口 |
| W4 | 555 | Integration Tool Adapter |
| W5 | 29 | Workflow authoring、部署与定义 |
| W6 | 11 | Executor、Job、Sandbox、暂停/恢复/取消 |
| W7 | 61 | Auth、OAuth、Webhook、Cron 与公网入口 |
| W8 | 109 | Polaris PM、HR、Approval、Identity 等业务域 |

其中 555 个 Tool Route 占全部 Route 的 49.3%。它们必须按 Provider 分组，使用共享
Adapter 和生成式兼容路由迁移；不能把 555 个 Next handler 原样手抄到新 API。

### 18.3 当前测试与契约缺口

- 合并后的 1,126 个 Route 中，仅 186 个检测到同目录直接 Route 测试，约 16.5%；
- Sim2 有 34 个非标准/Zod-backed contract 缺失 Route；
- Polaris 同样有 34 个非标准 contract Route；
- Polaris 新增 1 个 Route 内直接 Zod、11 个未定型响应 schema；
- Polaris 有 9 个 Route 文件直接读取 `request.json()`，高于 Sim2 基线；
- 两个仓库当前的 `check:api-validation` 都未通过。

因此迁移前置条件不是“旧代码能运行”，而是先冻结每个 handler 的 wire contract、鉴权、
状态码、错误体、幂等和副作用行为。

### 18.4 全量测试策略

每个 Route handler 都必须具备：

1. Contract 测试：方法、路径、参数、请求体、响应体、状态码和错误结构；
2. Auth 测试：未登录、无权限、跨 workspace/organization、合法调用；
3. Differential 测试：同一输入同时调用旧实现和新实现，比较规范化结果；
4. 回滚测试：流量开关切回旧实现后不丢请求、不破坏状态。

按类别追加：

- DB/Redis/MinIO Route：真实依赖集成测试和事务/回滚测试；
- Tool Route：Provider Adapter contract、凭证隔离、超时、限流、错误映射与录制回放；
- File Route：大文件、Range、Content-Type、流式回压、路径穿越与签名 URL；
- Executor/Sandbox：队列、幂等、重试、取消、超时、恢复、资源清理和输出文件；
- Auth/OAuth/Webhook/Cron：签名、重放、防伪、时间窗、重复投递和密钥泄露；
- Streaming：断线、重连、取消、背压和半途失败；
- Polaris 业务域：领域状态机、审计记录和关键业务 E2E。

测试实施采用分层生成：

- 1,377 个 handler 全量生成 contract/auth smoke cases；
- 每个深 Module 维护单元与集成测试；
- 仅关键用户旅程维护端到端 E2E，避免 1,126 套重复且脆弱的 UI 测试；
- 每个 Wave 都有性能基线、灰度观测和独立回滚演练。

## 19. 后续需要补充的证据

- 各类页面和 API 的客户端 bundle/服务端编译模块预算；
- Runtime Registry 各 Integration 的真实加载频率；
- 历史工作流中仍在使用的 Integration 分布；
- Production 与 Development 的冷启动和常驻内存基线；
- `auth.ts` 消费者分类及可替换 session seam；
- Serializer、workflow diff、block outputs 对动态 metadata 的具体需求；
- Sandbox API 的同步、异步、流式输出和取消语义；
- 前后端是否最终独立部署及其网络、认证和运维约束。

目标工程目录、Biz/Infra 模块边界、API 优先级以及画布 Replay/Debug 的迁移方案已整理到：
`docs/architecture/target-engineering-structure-and-migration-plan.md`。

### 19.1 Polaris Biz/Infra 直接耦合

静态扫描确认当前至少存在以下直接耦合文件：

| 当前目录 | 直接依赖 Feishu/Meegle/工具运行时的文件数 |
| --- | ---: |
| `lib/polaris/pm` | 5 |
| `lib/polaris/hr` | 5 |
| `lib/polaris/delivery` | 2 |
| `lib/polaris/identity` | 2 |
| `lib/polaris/channels` | 5 |

典型问题包括 PM service 直接获取 Meegle client、HR service 直接调用
`runFeishuServerTool`、Delivery/Channels 直接获取 Feishu client。迁移时必须将 Provider
transport 留在 Infra，把 PM/HR/Delivery 所需能力抽成 Biz port，并只在 Composition Root
绑定。

### 19.2 画布 Replay/Debug 的客户端执行闭包

当前 Replay/Debug 已有服务端安全投影和事件补发能力，但 UI 仍直接：

- 导入 `executeWorkflowWithFullLogging` 和 `@/executor/types`；
- 在浏览器根据历史日志重建 `SerializableExecutionState`；
- 在 Zustand store 保存 `Executor` 与 `ExecutionContext`；
- 调用 `executor.continueExecution` 执行单步/继续；
- 根据画布 edge 与节点输出计算下一执行节点。

这会把 Executor 与运行时依赖继续带入浏览器编译图。目标方案将 Replay plan、执行快照、
下一节点计算、单步/继续循环和幂等状态全部迁入 API/Worker；浏览器只保存
`debugSessionId` 和安全状态投影。

### 19.3 飞书长连接、Node 与 Sandbox 的真实关系

代码和部署文件确认：

- Polaris 的 `apps/sim/package.json` 虽通过 `bun run dev` 进入脚本，但 `dev` 实际执行
  `node --import tsx scripts/dev-node.ts`，脚本又用 Node 的 `process.execPath` 启动 Next；
- `instrumentation-node.ts` 在 Next Node 进程动态启动飞书 `WSClient`；
- `ws-trigger.ts` 使用 `@larksuiteoapi/node-sdk`，每 15 秒从数据库 reconcile 应维持的
  credential connections，再直接调用 webhook processor；
- 长连接没有 import Sandbox，但 webhook processor 会进入 workflow dispatch，因此当前
  进程闭包把飞书 ingress、Next、Executor 和 Sandbox 串在一起；
- 本地 Sandbox 明确执行 `node --version` 检查，并以
  `node --no-node-snapshot isolated-vm-worker.cjs` 启动 child process；
- production Dockerfile 按 Node ABI 重编译 `isolated-vm`，最终使用
  `CMD ["node", "apps/sim/bootstrap.js"]`。
- 2026-07-30 本机探针显示 Bun 1.3.11 可以导入 Lark SDK 1.71.1 并构造/关闭
  `WSClient`，所以不能把问题误归因成“飞书 SDK 一导入就不支持 Bun”；但这不覆盖真实
  长连接、TLS、代理、重连和信号生命周期。
- 同一探针中 `isolated-vm` 6.0.2 在 Node 22.20.0 下正常暴露 `Isolate`，在 Bun 下执行
  到 `require('isolated-vm')` 后提前结束且不再执行后续语句；其 package engine 也明确
  要求 Node `>=22.0.0`。这是本地 Sandbox 不得改用 Bun 的直接运行时证据。

结论：不能把“Bun 是 package manager”误写成“生产服务运行在 Bun”。API、Worker、飞书
长连接与本地 Sandbox 的生产 runtime 固定为 Node.js 22.19+；Bun 用于 install、script、
build 和 test。飞书长连接不是 Sandbox 能力，目标是将其迁入独立 `feishu-ingress`
Worker role，只负责连接、归一化、去重和 job admission，与 execution/Sandbox role 分开
部署和健康检查。

### 19.4 Contract seam 与浏览器体积

Phase 2 的第一条真实 seam 已完成：

- `api-contracts` 拥有 error、pagination、identity 和 trace wire schema；
- `execution-contracts` 只通过 `api-contracts` 复用 trace，拥有 job/event/debug schema；
- `tool-catalog` 的 contract primitive 只包含序列化 metadata；
- `polaris-extension-sdk` 只包含 extension descriptor/lifecycle，不包含 Feishu/Meegle DTO；
- Web、API、Worker 都使用同一个 `TraceContext`，但只有 API/Worker 在信任边界执行 Zod
  runtime validation。

第一次实现让 Web 直接调用 Zod schema，单入口 browser build 达到 269,728 bytes。改成
type-only import、将校验留在 API/Worker 后，产物降为 200 bytes，且不包含 Zod、
Executor、Registry、Sandbox、Provider SDK 或 Node marker。这个结果确认“共享类型”不等于
“共享运行时实现”：浏览器契约入口也必须保持 type/runtime 双出口意识。

契约 CI 现包括 pure-package gate、target module cycle gate、OpenAPI/manifest clean-tree
生成检查和 16 KB browser adapter budget。

### 19.5 Browser-safe Tool Catalog 与剩余闭包

原有 `apps/sim/lib/integrations/integrations.json` 已经接近浏览器安全 metadata，但两个真实
画布消费者仍会导入 `@/blocks/registry`：integration matcher 直接读取 `getBlock` 和
`getAllBlocks`，Copilot mention hook 则动态导入完整 Block Registry。动态 import 只改变
加载时机，不会建立前后端边界；它仍会要求浏览器 bundler 编译 Registry 的传递闭包。

现在的 seam 是：

```text
BlockConfig declarations
  -> TypeScript AST extractor（生成时，不执行 Registry）
  -> versioned browser summary + provider shards + manifest/hash
  -> apps/sim/lib/catalog/client.ts
  -> integration matcher / Copilot mention UI
```

本次生成 313 个 item 和 280 个 provider shard；231 个现有 UI integration 的 name、
description、category、bgColor 与生成结果逐项一致。browser summary 为 15,127 bytes
gzip，独立 catalog client bundle 为 80,140 bytes raw / 14,425 bytes gzip，且不包含
Executor、Runtime Registry、execution、Node builtin、Zod、Feishu SDK 或 Provider SDK
marker。Catalog 的 runtime reader 支持 ID/legacy alias 查询、provider filter、搜索、
cursor 和 limit。

`integration-matcher.ts` 与 Copilot `use-mention-data.ts` 已不再导入 Block Registry；专门
consumer gate 会防止回归。全局浏览器闭包计数仍是 588 个 client root，其中 297 个可达
Executor、267 个可达 execution/sandbox、200 个可达 runtime tools/blocks/triggers。
这不是 Catalog seam 失效，而是同一批页面仍通过别的旧 import chain 触达运行时。因而当前
结论只能是“两个消费者已切断”，不能声称“整页运行时闭包已清零”；后续 Runtime Registry、
Replay/Debug、Auth/DB 与其他画布消费者迁移必须继续降低全局 ratchet。

### 19.6 Worker-only Runtime Registry 与懒加载 Provider

首个 Worker runtime seam 已以 Notion add-database-row 建立。Runtime Registry 的公开
接口只有 capability 查询、执行和已加载 Provider 诊断；声明表只保存 provider、
canonical tool ID 和 alias，不包含 UI metadata。`notion_add_database_row_v2` 是 canonical
ID，历史 `notion_add_database_row` 仍可从 execution job 执行。

执行链为：

```text
ExecutionJobV1
  -> RuntimeToolInvocationV1（toolId、credentialRef、params）
  -> Worker Runtime Registry
  -> lazy Notion Provider chunk
  -> RuntimeCredentialResolver port
  -> Notion transport adapter
  -> RuntimeToolExecutionResultV1
```

job 不接受 access token 字段；契约的 strip policy 会丢弃这类额外顶层字段。Provider
只能通过 Worker 注入的 credential port 取得 bearer token。缺失 tool/provider、错误
Provider export、参数错误、credential 缺失和执行失败都有 contract version 1 的结构化
错误，不再依赖字符串异常判断。

Registry 与 Catalog 没有运行时 import。CI 读取纯 declaration 和生成后的 Catalog shard，
确认 1 个 runtime declaration 的 canonical/legacy 两个 capability ID 都存在。Worker
使用 split build：共 3 个输出，启动 entry 约 0.49 MB，不含 Notion Provider marker；
Provider 独立 chunk 约 3.92 KB。Worker package 不暴露 exports，Registry public entry
只能由 Worker composition root 导入。全浏览器闭包复核后 `api-or-worker` 仍为 0。

这个 seam 证明目标结构可行，但还不表示旧 `apps/sim/tools/registry.ts` 已退休。当前只迁移
一个代表性 tool；余下工具要按 provider 波次迁移并逐步切换 Executor 调用方，直到旧
Registry 不再属于生产执行路径。

### 19.7 W1 独立 API 与 Next 兼容门面

API inventory 的 W1 精确是三条路径，而不是只做三个无状态探针：

- `API-0102`：GET/POST `/api/environment`；
- `API-0127`：GET `/api/health`；
- `API-0295`：GET `/api/status`。

其中 environment 原实现同时 import DB、Better Auth、AES encryption、credential sync、
Audit 和 PostHog；status 原实现把 Incident fetch/cache 留在 Next route。这两条正是
“Route 看起来很小、实际把服务端闭包编进 Web”的代表。

迁移后，三个原路径只调用 `apps/sim/lib/api-proxy/w1.ts`。独立构建得到 3 个 facade，
最大 1,244 bytes gzip，不含 DB、Better Auth、Drizzle、encryption、Audit、Registry 或
Executor marker。代理支持每条路由的 `api/legacy/off` 模式、request ID/cookie/body
透传、超时、远端旧部署回滚和传输失败 fallback；legacy 模式指向独立旧部署，避免把旧
实现以动态 import 的方式继续留在 Next 编译图。

独立 API 内：

- environment application 只依赖 session/repository/cipher/credential-sync/audit/event
  ports，生产 adapters 才依赖 Better Auth、Drizzle、Security 与 Audit；
- status module 保留原有 Incident summary、缓存、fallback 与响应 header；
- system module 分开 liveness、readiness 和 version；
- 所有响应补 `x-request-id` 与 `x-api-contract-version`；
- 未配置环境也能由 Node 启动并返回 liveness 200，readiness 明确为 503。

生产 adapters 改为配置完整后才 dynamic import，API split build 的 startup entry 从
2.31 MB 降到 17.37 KB。Node 冷启动实测 1,978.91 ms、213.7 MiB RSS、约 81.4 MiB heap；
当前预算分别为 5 秒、384 MiB 和 192 MiB。W1 的三条 inventory 记录都绑定 Contract、
Differential、Integration、Performance 证据。

Node 探针还发现并修复了 `@sim/logger` 在 ESM 中调用 CommonJS `require` 的问题；现在用
Node 22 `process.getBuiltinModule('node:async_hooks')` 同步取得 AsyncLocalStorage，浏览器
仍走 no-op 分支。这再次确认 Bun build 通过不代表 Node production runtime 一定可启动。

最终全 Sim `tsc` 复核被系统以 `-1` 终止且无类型诊断；当时 Polaris Next 进程占用约
6.9 GiB。最终代码使用独立 W1 type graph、API/auth/contracts type-check 和定向 Vitest
通过，审计中保留该资源限制，不把它冒充为全量成功。

### 19.8 Worker Job 与独立 Sandbox role

Ticket 08 将版本化 job 从文档结构推进到可运行链路。API 新增内部 execution admission
Module，只依赖 `ExecutionJobSubmitter`；production adapter 通过带共享 token 的 HTTP 将 job
提交给 execution Worker。API 不 import queue、state、Sandbox 或 Worker 实现。

Worker coordinator 在一个窄接口后隐藏 delivery claim、job ID 幂等、event sequence、
retry/backoff、cancel、timeout、poison job 与 terminal state。定向测试覆盖 duplicate、
transient retry、retry exhaustion、active cancel、wall-clock timeout 和 invalid contract
dead letter。当前内存 queue/state/event journal 只是状态机 adapter，不具备生产持久性；
正式切流仍要求 durable queue、lease、crash recovery 和 DB event store。

SandboxExecution 的第一个 adapter 是 restricted test Sandbox。它不接收源代码，只支持
echo/delay/受控失败；network、host filesystem 和 secret value 没有暴露，secret schema
严格只允许 credential references。input bytes、wall-clock 和 cancel 已实际执行；CPU 和
memory 当前是 contract budget，待 isolated-vm/E2B/Daytona adapter 施加真实资源限制。

`@sim/worker` 的一个 split build 现在提供 execution 与 sandbox 两个独立 Node role。两者
拥有独立 liveness/readiness，可通过 HTTP Sandbox adapter 组合。Sandbox role 的独立构建
闭包为 87,228 gzip bytes，Runtime Registry、Notion Provider、execution coordinator 和
飞书 SDK marker 为 0。真实 Node smoke 启动 API、execution Worker、Sandbox 三个进程，
完成 `API -> Worker -> Sandbox -> started/completed`；因此 Bun 继续只是构建与测试工具，
不是这些生产进程的 runtime。restricted adapter 默认关闭，只有显式测试开关才能启用；
未配置生产 Sandbox 时 readiness 为 503。全浏览器传递闭包复核后 `api-or-worker` 仍为 0。

### 19.9 认证、授权与请求上下文 seam

Ticket 09 把旧 `getSession`、`hybrid.ts`、`internal.ts`、API key service 与 public-share
token lookup 的共同语义收敛到一个 request authentication deep module。路由必须声明
session、API key、public token、internal 或带显式 allow-list 的 hybrid policy；没有默认
allow-list。同时携带多种凭证会被拒绝，显式 token/key 失败不会降级回 session。

四种版本化 context 只保存已验证 actor、credential ID、tenant/resource scope、permission
和 request ID，不保存原始 Cookie、API key、public token 或 JWT。Session 继续使用相同
Better Auth secret/schema；API key 继续使用 `key_hash` 索引并检查 expiry/ban；public
token 检查 `is_active` 与 workspace archive；internal JWT 保留既有 issuer/audience/type。
所有 process env fallback 都留在 API composition root。

授权 seam 统一处理 workspace、organization、workflow 和 resource target。Workspace key
先做 credential scope 比较，再校验 actor 权限；组织访问查询真实 membership；workflow
通过 active workflow 的 owning workspace 授权；public token 只能读取它绑定的精确
`resourceType/resourceId`，不能借此读取整个 workspace/org。Internal service 必须携带匹配
scope。

Internal/hybrid route 还必须声明接受 `user`、`service` 或 `either` actor。旧 internal JWT
若没有 scope 仍可验证身份，但不能访问租户资源；后续切流必须升级 minting 或增加显式、
有时限的 route mapping，不能给旧 token 默认补 `platform:*`。

Public-token-only 路由会忽略浏览器自动携带的 ambient session Cookie，避免登录用户打开
公链时被错误判定为多凭证；该 Cookie 不参与验证，public token 失败也不会回退 session。

`/api/environment` 已使用这个 seam，并确保认证先于 body validation。Next facade 只透传
Cookie/Header；valid/revoked session 的直接调用与代理调用 identity/error parity 测试
通过。Auth 16/16、API 12/12、API Contract 5/5、Next proxy 5/5。Platform Contract 当前
36 schemas。Auth core 独立 Node build 为 65,660 gzip bytes，Executor、Registry、MCP、
Sandbox、UI、Feishu marker 为 0；API startup entry 为 18.89 KiB。W1 Node 冷启动复核为
2,772.04 ms、222.1 MiB RSS，仍低于 5 秒/384 MiB 门槛。

这不是 OAuth/SSO/Auth HTTP 路由迁移完成。Ticket 09 只建立消费 seam；session 创建与吊销、
OAuth callback、SSO 注册、API key 管理等仍按 W7/API inventory 迁移。

### 19.10 W2 租户只读兼容平面

Ticket 10 的第一个检查点选择 W2 中顶级领域属于 workspaces、organizations、users、
invitations、permission-groups、workspace-events、stars 的 22 条 GET。该选择器由独立
inventory checker 复算，版本化契约、coverage report 和生成门面必须同时保持 22/22，
否则 CI 失败。

22 个 Next route 原来合计约 1,600 行，并直接到达 DB、auth、fork/metrics/inbox 等服务端
实现。现在每个 route 是 7 行生成式 facade，合计 154 行；route diff 删除 1,663 行、新增
104 行，净减少 1,559 行。共享代理只转发 path/query/Cookie/API key/Authorization 和
request ID，不运行 Zod、Better Auth、Drizzle、Executor 或 Registry。独立构建 22 个门面，
最大产物 1,485 gzip bytes，所有 server-only forbidden marker 为 0。

独立 API 新增 tenant-read deep module，拥有路由匹配、认证 policy、错误映射、观测标签和
backend port。当前 production adapter 将请求转发到固定的 pre-refactor legacy origin；
旧响应的状态码、body、content type 和业务 header 不改写。API 失败可由显式 flag 回滚到
旧 origin，`api|legacy|off` 三种模式可控，两个代理层都拒绝 same-origin 递归。

鉴权不是统一粗暴设为 session：17 条为 session，usage-limits 为 session/API key/internal
hybrid，usage-logs 为 session/internal，stars 为 public，workspace-events poll 为
legacy-cron。前三类先经过 Ticket 09 authenticator；public/cron 特殊验证与所有路由的最终
tenant authorization 暂时仍由旧实现承担。

这意味着“Next 编译解耦”已经完成，但“独立 API 原生查询”尚未完成。compatibility backend
后面要按 inventory ID 替换成 organization/workspace/user read repository adapters，并用
真实 DB fixture 验证 tenant isolation、pagination/filter、not-found 和旧/新 wire 差分。
在 22/22 backend 都标记为 native 之前，不得移除旧 origin，也不得将 Ticket 10 标为完成。

当前 W2 API 31/31、Next proxy 25/25、API Contract 6/6；Platform Contract 为 38 schemas。
API validation audit 在 Windows path normalization 修复后为 991/991 contract-backed、
non-contract 0；它只把明确 import 并调用版本化 W1/W2 proxy 的门面视为外部契约代理，不
放宽其他 route。目标图为 22 packages/94 source nodes、0 cycle。

## 20. 更新日志

### 2026-07-30

- 建立持续审计文档；
- 写入 Next trace 性能证据；
- 写入 Sim2/Polaris 注册表规模对比；
- 记录工具、Block、鉴权与加密污染链；
- 审阅《项目问题.md》并修正 client/server registry 方案；
- 确认执行沙箱属于后端，并区分预览隔离与练习约束；
- 确认 Sim2 是目标平台，Polaris 是业务迁移来源；
- 记录两个仓库 Git 历史不相通及 package 非包含关系；
- 推荐从 Sim2 建立独立重构 worktree，禁止整仓复制 Polaris；
- 补充 TypeScript API/Worker 架构、Go 适用范围与沙箱集成链；
- 确认 D-001：保留 Sim2 全量服务端 Integration 和历史工作流执行兼容；
- 确认 D-002：第一阶段采用 TypeScript Web、API、Execution Worker 与执行沙箱，Go 延后。
- 确认 D-003：独立 API/Worker 从第一天建立，旧 Route 渐进迁移但一次性完整规划；
- 生成覆盖 1,126 个唯一路径、1,377 个 handler 的 API 迁移清单；
- 记录现有 contract audit 失败、直接 Route 测试覆盖不足和分层测试策略。
- 新增目标工程目录、Biz/Infra 归属、Meegle/Feishu 拆分和前端禁入矩阵；
- 记录 PM/HR/Delivery/Identity/Channels 对具体 Infra 的直接耦合；
- 新增画布 Replay/Debug 的服务端 Debug Session 迁移方案与测试矩阵；
- 将 API 全量清单确认为正式 Spec 的规范性附录，并细化 Polaris Biz 子波次。
- 从最新 Sim2 `main` 创建 `sim2-refactor` worktree 和独立重构分支；
- 记录 Next 16 当前使用 Turbopack、不能原位替换为 Vite 的技术结论；
- 建立 Sim2 upstream Module Alignment Matrix、同步基线和 Polaris 能力迁移表；
- 在目标 worktree 发布正式本地 Spec。
- 确认飞书长连接并不依赖 Sandbox；记录当前 Next instrumentation → webhook processor 的
  间接执行耦合。
- 固定 Node.js 22.19+ 为 API/Worker/飞书长连接/isolated-vm 的生产 runtime，Bun 仅用于
  包管理、构建、测试和脚本。
- 建立浏览器传递闭包 ratchet、Server Crypto/Provider SDK 虚拟节点、性能与 chunk 基线。
- 建立 10 个平台契约 schema、可重复 OpenAPI/版本产物和 Web→API→Worker trace seam。
- 将 Web trace adapter 从运行时 Zod import 收紧为 type-only，browser build 从
  269,728 bytes 降至 200 bytes。
- 建立 AST 驱动的 browser-safe Tool Catalog：313 个 item、280 个 provider 分片、
  231 个 UI metadata differential match 和稳定 SHA-256 manifest。
- 将 integration matcher 与 Copilot mention hook 从完整 Block Registry 迁到 Catalog；
  独立 browser bundle 为 14,425 bytes gzip，Runtime/Executor/Provider marker 为 0。
- 记录局部 Catalog seam 已切断但全局客户端闭包计数未下降，防止把消费者级改造误报为
  整页性能完成。
- 建立 Worker-only Runtime Registry、versioned runtime-tool job/result/error contract 与
  composition-only import gate。
- 迁移首个 Notion runtime adapter，兼容 `notion_add_database_row` 历史 ID；credential
  只通过 Worker port 解析。
- Worker split build 将 Notion Provider 隔离为 3.92 KB lazy chunk，启动 entry 不含
  Provider marker；Catalog/Registry 仅做生成期一致性比对。
- 完成 W1 三条 API inventory 路径迁移，建立独立 Node API、readiness/liveness/version
  与 C/D/I/P 覆盖记录。
- 保留 `/api/status` 对未知 query 的 400 validation wire contract；W1 API 定向测试
  10/10 通过。
- 将 environment/status/health 的 Next route 收敛为最大 1.24 KB gzip 的可回滚代理，
  服务端实现不再进入 Next route 编译图。
- Environment 的 credential sync、audit 和 `environment_updated` PostHog side effect
  均由 API adapter 保留；PostHog 只在启用后动态加载，并在 Node 退出时 flush。
- API production adapters 改为配置后懒加载，split build startup entry 为 17.37 KB；
  记录 1.98 秒、213.7 MiB RSS 的 Node 冷启动基线。
- 修复 `@sim/logger` 在 Node ESM 下使用 CommonJS `require` 导致服务无法直接启动的问题。
- 建立 API -> execution Worker -> 独立 Sandbox role 的版本化执行骨架，覆盖 job 幂等、
  retry、cancel、timeout、poison dead letter、resource policy audit 与 Node build smoke。
- 建立统一认证/request-context seam，覆盖 session、API key、public token、internal/hybrid
  policy、拒绝降级和 workspace/organization/workflow/resource 授权。
- 将 environment W1 改为认证先于 body validation，并验证 Next facade 与独立 API 的
  valid/revoked session identity/error 一致。
- Auth core 独立构建为 65,660 gzip bytes，Executor/Registry/MCP/Sandbox/UI/Feishu
  marker 为 0；Platform Contract 扩展到 36 schemas。
- 完成 W2 租户/成员只读 22 路的兼容平面：生成式 Next facade 最大 1,485 gzip bytes，
  W2 API 31/31、Next proxy 25/25，Platform Contract 扩展到 38 schemas。
- 明确记录 22 路当前仍使用固定 legacy origin；只有 Next 编译解耦完成，原生 read
  repository、tenant authorization 和真实数据层差分仍是 Ticket 10 的剩余工作。
