# Sim2 前后端分离与 Polaris 能力迁移 Spec

> 状态：Draft，架构与迁移范围已冻结，量化性能门槛待最终确认
> 日期：2026-07-30
> 目标平台：Sim2 refactor worktree
> 迁移来源：Polaris donor

## Problem Statement

当前 Sim2/Polaris 将 Web 页面、Next Route、Tool/Block/Trigger 注册表、Executor、Auth、加密、
Provider SDK 和 Sandbox 混在同一应用与 import graph 中。页面为了读取少量 metadata 会
间接导入完整 Runtime Registry，使开发时单个接口或页面编译可能持续数分钟，并造成高内存、
重编译和浏览器 bundle 污染。

Polaris 在此基础上增加了 PM、HR、Identity、Approval、Delivery、Risk、Operations、
Feishu、Meegle、Replay/Debug 等能力，但 Biz 与具体 Infra 实现仍有直接耦合，画布调试还在
浏览器持有 Executor 和可恢复执行状态。若直接复制 Polaris 或继续在旧注册表上修补，会让
边界和后续 Sim2 主线同步成本继续扩大。

目标平台还必须持续吸收 Sim2 `main` 更新，保留 Sim2 全量 Integration 的服务端能力和历史
工作流执行兼容，同时完整迁入 Polaris 能力。因此迁移范围必须一次性覆盖全部现有接口，
实施和切流则允许渐进完成。

## Solution

以 Sim2 的 Git 历史创建独立重构 worktree，采用 TypeScript Web、独立 TypeScript API 和
独立 TypeScript Execution Worker。Web 只消费纯 contract、浏览器安全 workflow model 和
按需 Tool Catalog；API 负责鉴权、授权、领域用例、查询、审计和 job admission；Worker
独占 Executor、Runtime Registry、Provider SDK、Sandbox 和可恢复执行状态。

Tool Catalog 与 Runtime Registry 成为两个不同 Module。Catalog 是可序列化、可分页、
可版本化的浏览器投影；Runtime Registry 只在 Worker 中按 Integration 懒加载。前端构建图
对 Executor、Runtime Registry、Sandbox、Provider SDK、DB、服务端 Auth 和加密的传递依赖
必须为零。

Polaris 业务按 Identity、PM、HR、Approval、Delivery、Risk、Operations Biz Module 迁移。
Feishu、Meegle、LLM Provider、对象存储、向量检索、代码托管和 Sandbox 属于 Infra
Extension。Biz 只依赖 capability interface；Composition Root 是唯一绑定具体 Adapter 的
位置。

全部 1,126 个唯一路径、1,377 个 HTTP handler 使用规范性 API inventory 管理。每个 handler
都有稳定 ID、来源、目标 Module、优先级、风险和测试要求。旧 Next Route 按绞杀模式成为
兼容 facade，完成差异测试和灰度后切到独立 API。

画布 Replay/Debug 改成 API/Worker 持有的服务端 Debug Session。Web 只提交回放意图并保存
session ID、状态投影和事件游标；snapshot、历史输出复用、下一节点计算、step、continue、
cancel 和恢复均由 Worker 执行。

目标仓库维护 Sim2 upstream baseline 和 Module Alignment Matrix。每次主线同步都根据
Mirror、Adapt、Split、Retired 策略把 changed paths 映射到目标 Module，并记录验证结果。

第一阶段保留 Next 16 + Turbopack。当前默认开发和生产命令使用 Turbopack，显式 Webpack
脚本只作为诊断兼容入口；Next 没有受支持的 Vite bundler 替换接口。若未来采用 Vite，
必须作为独立 Web framework 迁移立项，不能与注册表、API 和 Worker 拆分同时切换。

## Engineering Directory Plan

本节是规范性工程目录。实施不得另建同义目录；如代码事实要求调整，必须先修改本 Spec、
Module Alignment Matrix 和相关 ADR。

目录按 ownership 落地：Phase 1 建立可构建的 application/package/extension Module root；
内部叶目录在其拥有的行为迁入时创建。不得仅用空目录或批量 `.gitkeep` 冒充已实现 Module，
但后续 ticket 不得偏离本节规定的唯一目标路径。

### Repository Root

```text
D:\workspace\workflow\sim2-refactor\
├─ apps/
├─ packages/
├─ extensions/
│  ├─ biz/
│  └─ infra/
├─ scripts/
├─ docs/
├─ docker/
├─ helm/
├─ .github/
├─ package.json
├─ turbo.json
├─ tsconfig.json
└─ AGENTS.md
```

根 `package.json` 的 workspace 最终覆盖：

```text
apps/*
packages/*
extensions/biz/*
extensions/infra/*
```

### `apps/sim` — Next Web 与兼容门面

```text
apps/sim/
├─ app/
│  ├─ (auth)/
│  ├─ (interfaces)/
│  ├─ (landing)/
│  ├─ _shell/
│  ├─ _styles/
│  ├─ account/
│  ├─ auth/
│  ├─ f/
│  ├─ hr/
│  ├─ ingest/
│  ├─ invite/
│  ├─ organization/
│  ├─ playground/
│  ├─ review/
│  ├─ unsubscribe/
│  ├─ workspace/
│  └─ api/
│     ├─ _compat/
│     ├─ admin/
│     ├─ approvals/
│     ├─ audit-logs/
│     ├─ auth/
│     ├─ billing/
│     ├─ blocks/
│     ├─ chat/
│     ├─ cli/
│     ├─ contact/
│     ├─ copilot/
│     ├─ credentials/
│     ├─ cron/
│     ├─ custom-blocks/
│     ├─ demo-requests/
│     ├─ desktop/
│     ├─ emails/
│     ├─ environment/
│     ├─ files/
│     ├─ folders/
│     ├─ function/
│     ├─ guardrails/
│     ├─ health/
│     ├─ help/
│     ├─ hr/
│     ├─ integrations/
│     ├─ invitations/
│     ├─ jobs/
│     ├─ knowledge/
│     ├─ link-preview/
│     ├─ logs/
│     ├─ mat/
│     ├─ mcp/
│     ├─ memory/
│     ├─ mothership/
│     ├─ organizations/
│     ├─ permission-groups/
│     ├─ pinned-items/
│     ├─ polaris/
│     ├─ providers/
│     ├─ proxy/
│     ├─ resume/
│     ├─ schedules/
│     ├─ settings/
│     ├─ skills/
│     ├─ speech/
│     ├─ stars/
│     ├─ status/
│     ├─ superuser/
│     ├─ table/
│     ├─ telemetry/
│     ├─ tools/
│     ├─ usage/
│     ├─ users/
│     ├─ v1/
│     ├─ wand/
│     ├─ webhooks/
│     ├─ workflows/
│     ├─ workspace-events/
│     └─ workspaces/
├─ features/
│  ├─ account/
│  ├─ administration/
│  ├─ approvals/
│  ├─ auth/
│  ├─ billing/
│  ├─ credentials/
│  ├─ files/
│  ├─ folders/
│  ├─ hr/
│  │  └─ offboarding/
│  ├─ identity/
│  ├─ integrations/
│  ├─ knowledge/
│  ├─ logs/
│  ├─ organizations/
│  ├─ pm/
│  │  ├─ assignments/
│  │  ├─ context/
│  │  ├─ documents/
│  │  ├─ mat/
│  │  ├─ operations/
│  │  ├─ projects/
│  │  └─ repositories/
│  ├─ replay-debug/
│  ├─ risk/
│  ├─ settings/
│  ├─ tool-catalog/
│  └─ workflow-canvas/
│     ├─ blocks/
│     ├─ edges/
│     ├─ panels/
│     ├─ toolbar/
│     └─ viewport/
├─ components/
│  ├─ emcn/
│  ├─ ui/
│  ├─ shell/
│  └─ shared/
├─ hooks/
│  ├─ queries/
│  ├─ mutations/
│  ├─ selectors/
│  └─ streaming/
├─ stores/
│  ├─ auth/
│  ├─ editor/
│  ├─ execution/
│  ├─ navigation/
│  ├─ organization/
│  ├─ workspace/
│  └─ workflows/
├─ lib/
│  ├─ api-client/
│  │  ├─ json/
│  │  ├─ binary/
│  │  ├─ streaming/
│  │  └─ errors/
│  ├─ browser/
│  ├─ catalog/
│  ├─ navigation/
│  ├─ presentation/
│  ├─ query-client/
│  └─ validation/
├─ content/
├─ public/
├─ e2e/
├─ scripts/
└─ package.json
```

`apps/sim/app/api` 在迁移完成后只允许协议转发、OAuth callback、redirect 和必要的流代理；
不得拥有领域规则、DB repository、Runtime Registry、Executor、Provider SDK 或 Sandbox。

### `apps/api` — TypeScript HTTP API

```text
apps/api/
├─ src/
│  ├─ bootstrap/
│  │  ├─ application/
│  │  ├─ lifecycle/
│  │  └─ readiness/
│  ├─ config/
│  │  ├─ environment/
│  │  ├─ feature-flags/
│  │  └─ validation/
│  ├─ transport/
│  │  ├─ http/
│  │  │  ├─ plugins/
│  │  │  ├─ routes/
│  │  │  │  ├─ core/
│  │  │  │  ├─ integrations/
│  │  │  │  ├─ polaris/
│  │  │  │  ├─ public-v1/
│  │  │  │  └─ compatibility/
│  │  │  └─ serialization/
│  │  ├─ sse/
│  │  ├─ webhooks/
│  │  └─ cron/
│  ├─ middleware/
│  │  ├─ request-context/
│  │  ├─ authentication/
│  │  ├─ authorization/
│  │  ├─ tenant-isolation/
│  │  ├─ idempotency/
│  │  ├─ rate-limit/
│  │  ├─ validation/
│  │  └─ error-mapping/
│  ├─ modules/
│  │  ├─ admin/
│  │  ├─ api-keys/
│  │  ├─ auth/
│  │  ├─ billing/
│  │  ├─ catalog/
│  │  ├─ chat/
│  │  ├─ copilot/
│  │  ├─ credentials/
│  │  ├─ desktop/
│  │  ├─ files/
│  │  ├─ folders/
│  │  ├─ guardrails/
│  │  ├─ integrations/
│  │  ├─ invitations/
│  │  ├─ jobs/
│  │  ├─ knowledge/
│  │  ├─ logs/
│  │  ├─ mcp/
│  │  ├─ memory/
│  │  ├─ mothership/
│  │  ├─ organizations/
│  │  ├─ permissions/
│  │  ├─ providers/
│  │  ├─ replay-debug/
│  │  ├─ schedules/
│  │  ├─ settings/
│  │  ├─ table/
│  │  ├─ telemetry/
│  │  ├─ users/
│  │  ├─ webhooks/
│  │  ├─ workflow-execution-admission/
│  │  ├─ workflows/
│  │  └─ workspaces/
│  ├─ composition/
│  │  ├─ platform/
│  │  ├─ biz/
│  │  │  ├─ identity/
│  │  │  ├─ pm/
│  │  │  ├─ hr/
│  │  │  ├─ approval/
│  │  │  ├─ delivery/
│  │  │  ├─ risk/
│  │  │  └─ operations/
│  │  └─ infra/
│  ├─ persistence/
│  │  ├─ postgres/
│  │  ├─ redis/
│  │  ├─ object-storage/
│  │  └─ repositories/
│  └─ observability/
│     ├─ logging/
│     ├─ metrics/
│     ├─ tracing/
│     └─ audit/
├─ tests/
│  ├─ contract/
│  ├─ auth/
│  ├─ differential/
│  ├─ integration/
│  ├─ security/
│  └─ performance/
├─ scripts/
└─ package.json
```

每个 `apps/api/src/modules/<module>` 使用统一内部布局：

```text
<module>/
├─ interface/
├─ application/
├─ ports/
└─ index.ts
```

Biz 规则不放入 API module；API module 只提供 transport-facing interface 和 orchestration。

### `apps/worker` — Workflow、Integration 与 Sandbox Worker

```text
apps/worker/
├─ src/
│  ├─ bootstrap/
│  │  ├─ trigger-dev/
│  │  ├─ lifecycle/
│  │  └─ readiness/
│  ├─ ingress/
│  │  └─ feishu-persistent-connection/
│  ├─ jobs/
│  │  ├─ workflow-execution/
│  │  ├─ debug-session-command/
│  │  ├─ sandbox-execution/
│  │  ├─ integration-tool/
│  │  ├─ trigger-delivery/
│  │  ├─ scheduled-workflow/
│  │  ├─ webhook-processing/
│  │  ├─ content-processing/
│  │  ├─ notifications/
│  │  ├─ meegle-sync/
│  │  ├─ hr-offboarding/
│  │  └─ operations/
│  ├─ execution/
│  │  ├─ executor/
│  │  ├─ engine/
│  │  ├─ snapshots/
│  │  ├─ replay/
│  │  ├─ debug-sessions/
│  │  ├─ cancellation/
│  │  ├─ recovery/
│  │  ├─ streaming/
│  │  └─ events/
│  ├─ runtime/
│  │  ├─ registry/
│  │  ├─ loader/
│  │  ├─ blocks/
│  │  ├─ tools/
│  │  ├─ triggers/
│  │  └─ integrations/
│  ├─ sandbox/
│  │  ├─ interface/
│  │  ├─ isolated-vm/
│  │  ├─ e2b/
│  │  ├─ daytona/
│  │  ├─ artifacts/
│  │  ├─ resource-limits/
│  │  └─ cleanup/
│  ├─ persistence/
│  │  ├─ job-state/
│  │  ├─ execution-state/
│  │  └─ artifacts/
│  ├─ composition/
│  │  ├─ runtime/
│  │  ├─ biz/
│  │  └─ infra/
│  └─ observability/
│     ├─ logging/
│     ├─ metrics/
│     └─ tracing/
├─ tests/
│  ├─ jobs/
│  ├─ execution/
│  ├─ replay-debug/
│  ├─ runtime/
│  ├─ sandbox/
│  ├─ integration/
│  └─ performance/
├─ scripts/
└─ package.json
```

`apps/worker` 由同一构建产物提供可独立部署的 role。`execution` role 消费执行与 Sandbox
job；`feishu-ingress` role 只维持飞书长连接、归一化事件并提交幂等 ingress job。两个
role 使用独立 deployment、readiness、扩缩容和重启策略，不在同一进程共享
Executor、Runtime Registry 或 Sandbox pool。

### Existing Sim2 Applications

```text
apps/realtime/
├─ src/
│  ├─ auth/
│  ├─ collaboration/
│  ├─ events/
│  ├─ persistence/
│  ├─ protocol/
│  └─ server/
├─ tests/
└─ package.json

apps/desktop/
├─ src/
│  ├─ main/
│  ├─ preload/
│  ├─ renderer/
│  ├─ protocol/
│  └─ terminal/
├─ scripts/
├─ static/
├─ e2e/
└─ package.json

apps/docs/
├─ app/
├─ components/
├─ content/
├─ lib/
├─ public/
└─ package.json

apps/pii/
├─ tests/
├─ server.py
├─ requirements.txt
└─ package.json
```

这些应用保留 upstream 路径和职责，不吸收 API、Runtime Registry 或 Polaris Biz。

### Polaris Content Processor

```text
apps/content-processor/
├─ src/
│  ├─ document/
│  ├─ image/
│  ├─ limits/
│  ├─ redaction/
│  └─ transport/
├─ tests/
├─ server.py
├─ requirements.txt
└─ package.json
```

Polaris Mothership 和 Operations Agent 不建立最终独立应用目录；其行为分别进入 API
Mothership/Copilot Module、Worker jobs 和 Operations Biz Module。

### Shared Packages

```text
packages/
├─ api-contracts/
│  └─ src/
│     ├─ primitives/
│     ├─ core/
│     │  ├─ admin/
│     │  ├─ auth/
│     │  ├─ billing/
│     │  ├─ credentials/
│     │  ├─ files/
│     │  ├─ folders/
│     │  ├─ invitations/
│     │  ├─ knowledge/
│     │  ├─ logs/
│     │  ├─ mcp/
│     │  ├─ organizations/
│     │  ├─ permissions/
│     │  ├─ table/
│     │  ├─ users/
│     │  └─ workspaces/
│     ├─ workflow/
│     │  ├─ definition/
│     │  ├─ execution/
│     │  ├─ deployment/
│     │  ├─ schedules/
│     │  └─ webhooks/
│     ├─ integrations/
│     ├─ public-v1/
│     └─ polaris/
│        ├─ identity/
│        ├─ pm/
│        ├─ hr/
│        ├─ approval/
│        ├─ delivery/
│        ├─ risk/
│        └─ operations/
├─ execution-contracts/
│  └─ src/
│     ├─ jobs/
│     ├─ events/
│     ├─ execution/
│     ├─ replay-debug/
│     ├─ sandbox/
│     └─ errors/
├─ tool-catalog/
│  └─ src/
│     ├─ schemas/
│     ├─ generated/
│     │  ├─ tools/
│     │  ├─ blocks/
│     │  ├─ triggers/
│     │  └─ integrations/
│     ├─ search/
│     ├─ pagination/
│     ├─ compatibility/
│     └─ versioning/
├─ polaris-extension-sdk/
│  └─ src/
│     ├─ manifest/
│     ├─ lifecycle/
│     ├─ health/
│     ├─ capabilities/
│     └─ registration/
├─ audit/
├─ auth/
├─ browser-protocol/
├─ cli/
├─ db/
├─ desktop-bridge/
├─ emcn/
├─ logger/
├─ platform-authz/
├─ python-sdk/
├─ realtime-protocol/
├─ runtime-secrets/
├─ security/
├─ terminal-protocol/
├─ testing/
├─ ts-sdk/
├─ tsconfig/
├─ utils/
├─ workflow-persistence/
├─ workflow-renderer/
└─ workflow-types/
```

现有 Sim2 packages 保留 upstream 原有内部目录。新增 package 统一包含：

```text
src/
tests/
package.json
tsconfig.json
```

禁止新增 `common`、`shared-types`、`helpers` 等无所有权的全局 package。

### Biz Extensions

```text
extensions/biz/
├─ identity/
├─ pm/
├─ hr/
├─ approval/
├─ delivery/
├─ risk/
└─ operations/
```

每个 Biz Extension 完整目录：

```text
extensions/biz/<module>/
├─ src/
│  ├─ domain/
│  │  ├─ entities/
│  │  ├─ value-objects/
│  │  ├─ policies/
│  │  ├─ events/
│  │  └─ errors/
│  ├─ application/
│  │  ├─ commands/
│  │  ├─ queries/
│  │  ├─ handlers/
│  │  └─ projections/
│  ├─ ports/
│  ├─ contracts/
│  ├─ repository/
│  └─ index.ts
├─ tests/
│  ├─ domain/
│  ├─ application/
│  └─ contract/
├─ package.json
└─ tsconfig.json
```

各 Biz 的专属子目录：

```text
identity/src/domain/{people,organizations,external-identities,roles,menu-grants,data-scopes}/
pm/src/domain/{projects,memberships,stages,documents,context,mat,workflow-bindings}/
hr/src/domain/{employees,offboarding-cases,steps,artifacts,signatures,todos}/
approval/src/domain/{definitions,instances,decisions,wait-subscriptions}/
delivery/src/domain/{assignments,todos,notifications,receipts}/
risk/src/domain/{risks,rule-sets,simulations,schedules}/
operations/src/domain/{releases,schedules,sync-jobs,operation-runs,retry-policies}/
```

### Infra Extensions

```text
extensions/infra/
├─ feishu-channel/
│  └─ src/
│     ├─ auth/
│     ├─ credentials/
│     ├─ directory/
│     ├─ external-identity/
│     ├─ messaging/
│     ├─ notifications/
│     ├─ approval/
│     ├─ documents/
│     ├─ webhooks/
│     ├─ triggers/
│     ├─ normalization/
│     ├─ retries/
│     ├─ errors/
│     └─ adapters/
├─ meegle-connector/
│  └─ src/
│     ├─ auth/
│     ├─ credentials/
│     ├─ client/
│     ├─ capabilities/
│     ├─ projects/
│     ├─ work-items/
│     ├─ hierarchy/
│     ├─ normalization/
│     ├─ retries/
│     ├─ errors/
│     └─ adapters/
├─ llm-providers/
│  └─ src/
│     ├─ openai/
│     ├─ anthropic/
│     ├─ google/
│     ├─ azure/
│     ├─ bedrock/
│     ├─ local/
│     └─ adapters/
├─ object-storage/
│  └─ src/
│     ├─ minio/
│     ├─ signed-urls/
│     ├─ streaming/
│     └─ adapters/
├─ vector-search/
│  └─ src/
│     ├─ providers/
│     ├─ indexing/
│     ├─ queries/
│     └─ adapters/
├─ code-host/
│  └─ src/
│     ├─ github/
│     ├─ gitlab/
│     ├─ repositories/
│     └─ adapters/
└─ sandbox/
   └─ src/
      ├─ isolated-vm/
      ├─ e2b/
      ├─ daytona/
      ├─ artifacts/
      ├─ limits/
      ├─ cleanup/
      └─ adapters/
```

每个 Infra Extension 还包含：

```text
tests/
├─ contract/
├─ integration/
└─ recordings/
package.json
tsconfig.json
```

### Tooling, Documentation, Containers, and Helm

```text
scripts/
├─ architecture/
│  ├─ import-boundaries/
│  ├─ dependency-graph/
│  ├─ bundle-budget/
│  └─ build-isolation/
├─ catalog/
│  ├─ generate/
│  ├─ validate/
│  ├─ compatibility/
│  └─ fixtures/
├─ migration/
│  ├─ api-inventory/
│  ├─ contract-generation/
│  ├─ differential-test/
│  └─ cutover-report/
├─ upstream-sync/
│  ├─ impact-report/
│  ├─ module-map/
│  ├─ baseline/
│  └─ report-template/
├─ setup/
└─ tests/

docs/
├─ architecture/
│  ├─ decisions/
│  ├─ diagrams/
│  └─ audits/
├─ specs/
├─ migration/
│  ├─ api/
│  ├─ modules/
│  ├─ upstream-sync/
│  └─ cutovers/
├─ goals/
├─ handoffs/
├─ operations/
└─ testing/

docker/
├─ compose/
├─ scripts/
├─ app.Dockerfile
├─ api.Dockerfile
├─ worker.Dockerfile
├─ realtime.Dockerfile
├─ content-processor.Dockerfile
├─ pii.Dockerfile
└─ db.Dockerfile

helm/sim/
├─ templates/
│  ├─ web/
│  ├─ api/
│  ├─ worker/
│  ├─ realtime/
│  ├─ content-processor/
│  ├─ pii/
│  ├─ ingress/
│  ├─ secrets/
│  └─ observability/
├─ tests/
├─ examples/
└─ .claude/

.github/
├─ workflows/
│  ├─ ci.yml
│  ├─ architecture.yml
│  ├─ api-contracts.yml
│  ├─ performance.yml
│  ├─ security.yml
│  └─ upstream-sync.yml
├─ actions/
└─ pull_request_template/
```

### Directory Dependency Rules

```text
apps/sim
  -> packages/api-contracts
  -> packages/tool-catalog
  -> packages/workflow-types
  -> packages/emcn

apps/api
  -> packages/*
  -> extensions/biz/*
  -> selected extensions/infra/* only through composition

apps/worker
  -> packages/*
  -> extensions/biz/*
  -> extensions/infra/*

extensions/biz/*
  -> pure packages
  -> own ports
  -X-> extensions/infra/*

extensions/infra/*
  -> pure packages
  -> Biz port types when implementing an Adapter
  -X-> apps/*

packages/*
  -X-> apps/*
  -X-> concrete Infra runtime unless package itself owns that runtime
```

## User Stories

1. As a workflow editor user, I want ordinary pages to open without compiling the entire tool system, so that navigation remains responsive.
2. As a workflow editor user, I want the canvas to load only metadata for tools used or searched, so that thousands of integrations do not block first paint.
3. As a workflow editor user, I want historical workflows to continue recognizing existing Tool, Block, and Trigger IDs, so that old automations do not break.
4. As a workflow editor user, I want missing or legacy metadata to be resolved by the API, so that the browser never falls back to Runtime Registry.
5. As a workflow editor user, I want normal runs, Replay, and Debug to expose consistent progress, so that execution state is understandable.
6. As a workflow editor user, I want a failed run to be replayed from the beginning or failed node, so that I can reproduce failures quickly.
7. As a workflow editor user, I want safe replay to reuse successful historical outputs, so that debugging does not repeat external side effects.
8. As a workflow editor user, I want live replay to be clearly distinguished and audited, so that real provider effects are intentional.
9. As a workflow editor user, I want breakpoints, step, continue, and cancel to survive page refresh, so that debugging is not tied to browser memory.
10. As a workflow editor user, I want stream reconnection to restore missed events without rerunning the workflow, so that transient network loss is safe.
11. As a workspace administrator, I want catalog results to be paginated and searchable, so that the interface stays fast as integrations grow.
12. As a workspace administrator, I want credentials and Provider SDK state to remain server-side, so that browser code cannot expose secrets.
13. As a workspace administrator, I want live replay restricted and audited, so that production side effects have accountability.
14. As a PM user, I want projects, memberships, stages, documents, context, MAT, and workflow bindings migrated, so that Polaris PM behavior remains available.
15. As a PM user, I want Meegle synchronization to preserve business mappings and retry history, so that external project state remains reliable.
16. As a PM maintainer, I want PM rules independent of Meegle SDK details, so that another project system can be adapted without rewriting PM.
17. As an HR user, I want offboarding cases, steps, artifacts, signatures, and todos migrated, so that current HR workflows continue.
18. As an HR maintainer, I want HR to request directory, messaging, document, and signature capabilities through interfaces, so that Feishu is not embedded in HR rules.
19. As an Identity administrator, I want people, organizations, external identities, roles, menus, and data scopes to remain canonical business state, so that Feishu IDs are not platform truth.
20. As an Approval user, I want definitions, instances, decisions, and wait subscriptions preserved, so that human-in-the-loop workflows remain compatible.
21. As an Operations user, I want releases, schedules, sync jobs, operation runs, retries, and audit records migrated, so that long-running work is observable.
22. As a Risk user, I want risk rules, simulations, schedules, and notifications migrated, so that risk management behavior is preserved.
23. As a Delivery user, I want assignments, todos, notifications, and receipts preserved, so that work delivery stays traceable.
24. As a channel operator, I want Feishu webhook normalization, idempotency, routing, and replay preserved, so that channel events can be safely reprocessed.
25. As an integration developer, I want a small Catalog interface and a separate runtime interface, so that adding a provider does not enlarge every Web build.
26. As an integration developer, I want provider-specific auth, rate limits, retries, and errors localized in an Infra Extension, so that fixes apply to all callers.
27. As an API developer, I want shared request and response contracts, so that Web, compatibility routes, and independent API cannot drift silently.
28. As an API developer, I want all existing handlers assigned to a target Module and wave before implementation, so that gradual migration does not create hidden omissions.
29. As an API developer, I want old and new implementations compared with the same fixtures, so that behavior changes are explicit.
30. As a Worker developer, I want the execution job interface to hide registry, provider, retry, and sandbox details, so that callers do not learn the execution implementation.
31. As a Worker developer, I want SandboxExecution to normalize isolated-vm, E2B, and Daytona, so that resource cleanup and cancellation are consistent.
32. As a security reviewer, I want authentication, authorization, tenant isolation, replay protection, and secret handling verified at each migrated seam, so that performance work does not weaken security.
33. As a frontend developer, I want CI to reject direct and transitive server-only imports, so that registry leakage cannot return.
34. As a frontend developer, I want route-level bundle and compile budgets, so that performance regressions fail before merge.
35. As a maintainer, I want Web, API, Worker, and Realtime to build independently, so that changing an integration does not compile every page.
36. As a maintainer, I want Sim2 upstream changes mapped to target Modules, so that periodic synchronization is repeatable.
37. As a maintainer, I want each upstream synchronization to record its commit range, changed paths, adaptations, tests, and ignored items, so that alignment is auditable.
38. As a maintainer, I want Polaris treated as a behavior donor instead of an unrelated-history merge, so that the target keeps a coherent Sim2 history.
39. As a maintainer, I want the Desktop, Docs, PII, Realtime, browser protocol, and terminal protocol capabilities from Sim2 preserved, so that refactoring does not narrow the product.
40. As a maintainer, I want Polaris content processing, Mothership, and Operations Agent behavior represented in the migration plan, so that auxiliary capabilities are not forgotten.
41. As a release operator, I want each wave independently feature-flagged and reversible, so that failures can be rolled back without reverting the whole migration.
42. As a release operator, I want health probes and observability before traffic cutover, so that new modules can be compared safely.
43. As a test engineer, I want generated contract/auth smoke tests for all handlers, so that full API coverage is affordable.
44. As a test engineer, I want focused domain, integration, streaming, sandbox, and security tests, so that high-risk behavior is tested at the highest useful seam.
45. As a product owner, I want implementation to be gradual while scope is complete up front, so that value can ship without losing migration accountability.

## Implementation Decisions

- The target inherits Sim2 history and periodically synchronizes Sim2 main; Polaris remains a behavior and test donor.
- The first phase uses TypeScript for Web, API, Worker, workflow execution, and sandbox orchestration. Go is not used to rewrite the execution plane.
- Bun is the package manager, script runner, build tool, and test launcher; it is not the production runtime contract for API, Worker, Feishu persistent connections, or local Sandbox execution.
- API and Worker production processes use Node.js 22.19 or newer. Local isolated-vm execution uses a dedicated Node child process with `--no-node-snapshot`; remote E2B/Daytona images pin a compatible Node version.
- The Web application remains on Next and Turbopack in the first phase. A Vite move would be a later framework migration, not an in-place bundler swap.
- API and Worker are independent applications from the beginning, while legacy Next handlers migrate gradually through compatibility facades.
- Compatibility-facade completion and native-backend completion are tracked separately. A route wave
  may first remove Next compile coupling through a fixed legacy-origin backend port, but it is not
  considered natively migrated until authorization, repositories, and differential fixtures execute
  inside the independent API.
- The API is a modular monolith. HTTP transport, middleware, composition, and observability do not own business rules.
- API routes authenticate before body validation through one versioned request-context seam. Session,
  API key, public token, and internal identities are explicit policies; hybrid policies have no default
  allow-list and never downgrade a failed explicit credential to session.
- Internal/hybrid policies explicitly select user, service, or either actor class; legacy tokens without
  scopes never receive an implicit platform-wide scope.
- Public-token identities authorize only their exact resource, workspace keys cannot cross workspace
  scope, and internal services require explicit target scopes.
- The Worker is the only application allowed to contain the complete execution closure.
- Shared packages contain pure contracts, pure workflow types, browser-safe catalog data, or narrowly scoped infrastructure utilities; they do not become a new global barrel.
- Tool Catalog and Runtime Registry are distinct Modules with distinct interfaces and build outputs.
- Catalog extraction occurs at build time and produces versioned, serializable data that can be paginated and queried.
- Runtime resolution preserves stable Integration IDs and lazily loads the minimum provider implementation needed for a job.
- Biz Modules own canonical business state and capability interfaces.
- Infra Extensions own provider transport, credentials, retries, rate limits, provider ID translation, normalization, and provider errors.
- Composition Root is the only place that binds a Biz capability interface to an Infra Adapter.
- Meegle is an Infra Extension. PM owns project semantics; Operations owns sync job lifecycle and retry/audit state.
- Feishu is one Infra Extension that can satisfy directory, authentication, external identity resolution, messaging, notification, approval, document, and trigger capabilities.
- Feishu persistent connection ingress is not a Sandbox capability. A Node-based `feishu-ingress` Worker role owns connection reconcile and health, then emits normalized, idempotent jobs without importing Executor or Sandbox.
- HR, PM, Approval, Delivery, and Identity never import Feishu or Meegle concrete implementations.
- The extension SDK is extracted from working adapters and remains minimal; provider DTOs and business aggregates are excluded.
- The normative API inventory covers 1,126 paths and 1,377 handlers, including Sim2-only, Polaris-only, common, and diverged routes.
- Each handler has a stable inventory ID, migration wave, risk, target Module, and required test set.
- The 555 integration tool routes migrate by Provider through generated compatibility handlers, not by copying 555 handwritten handlers.
- Diverged routes require explicit behavior selection; Polaris never silently overwrites Sim2 behavior.
- Replay uses current draft canvas semantics by default while loading historical inputs and snapshots, preserving current Polaris behavior.
- A draft hash prevents a paused Debug Session from silently continuing against a changed canvas.
- Debug Session state is server-authoritative, versioned, expiring, and advanced by idempotent commands.
- Safe replay produces no Provider calls for reused successful outputs.
- Stream Replay, Channel Event Replay, and canvas Execution Replay remain separate concepts and metrics.
- The existing server-side replay projection and legacy log normalization are preferred seams and are deepened rather than replaced.
- Upstream synchronization records an exact baseline commit and uses a maintained Module Alignment Matrix.
- Same-path modules are merged normally; extracted modules receive upstream changes through explicit adaptation or split mappings.
- Performance enforcement checks the transitive graph, not only direct imports or `server-only` markers.
- Recommended initial budgets are 300 KB gzip incremental client JavaScript for ordinary pages, 150 KB gzip first catalog response, 10 seconds ordinary cold compile, 1 second hot update, 20 seconds editor cold compile, and 4 GB stable Web development RSS.

## Testing Decisions

- Tests exercise Module interfaces and externally observable behavior; they do not reach through interfaces to assert implementation structure.
- Contract and authentication smoke tests are generated for every HTTP handler.
- Authentication tests cover missing, expired, revoked, ambiguous and disallowed credentials, plus
  cross-workspace/organization access and direct-API/compatibility-facade identity parity.
- Each migrated handler receives old/new differential tests until cutover is complete.
- Common and diverged routes use normalized fixtures that compare status, headers, response body, error body, idempotency, and side effects.
- API Modules receive focused integration tests for database, Redis, object storage, transactions, and authorization.
- Provider Adapters receive contract tests, recorded fixtures, credential isolation, timeout, rate-limit, retry, and error-mapping tests.
- Workflow execution is tested through the job/execution interface for queue duplication, retry, cancel, timeout, resume, snapshot compatibility, and cleanup.
- SandboxExecution is tested once as a common interface and separately for each actual Adapter.
- Runtime compatibility tests execute the API and Worker build artifacts under Node, execute the local isolated-vm worker under the pinned Node version, and fail if production entrypoints invoke Bun.
- Replay/Debug uses golden fixtures for legacy block executions and recursive trace spans.
- Replay/Debug covers start modes, input overrides, safe/live behavior, breakpoints, step, continue, cancel, refresh recovery, version conflicts, duplicate commands, and stream reconnect.
- Safe replay tests assert zero external Provider effects.
- Biz Modules receive domain state-machine and application-interface tests using fake capability Adapters.
- Feishu and Meegle integration tests run outside Biz tests and prove their capability Adapter contracts.
- Feishu persistent-connection tests cover connect, reconnect, credential rotation, duplicate event delivery, fast card acknowledgement, DB outage recovery, independent readiness, and the absence of Executor/Sandbox imports.
- Import graph tests fail when Web reaches runtime registry, executor, sandbox, database, server auth/encryption, or Provider SDK code.
- Bundle and compile performance tests use a fixed machine profile, fixed workflow fixture, and fixed catalog dataset.
- Upstream synchronization tests are selected from changed-path mappings and always include stable Integration ID compatibility.
- Critical user journeys receive E2E coverage; the plan does not create one fragile UI E2E for every API path.
- Every migration wave includes a feature-flag rollback exercise and observability check.

## Current Migration Checkpoint

- W1 has three native independent API routes with lightweight Next compatibility facades.
- W2 tenant-read has an exact first slice of 22 GET routes across workspaces, organizations, users,
  invitations, permission-groups, workspace-events, and stars.
- Those 22 Next routes are generated lightweight facades and pass isolated build checks with a largest
  entry of 1,485 gzip bytes and zero DB/Auth runtime/Executor/Registry markers.
- The standalone API owns W2 route selection, authentication policy, request identity, observability,
  and a backend port. Backend selection is recorded per inventory ID; `API-0137 /api/invitations`,
  `API-0209 /api/organizations/[id]/data-drains/[drainId]/runs`,
  `API-0235 /api/organizations/[id]/roster`,
  `API-0241 /api/organizations/[id]/workspaces`,
  `API-0243 /api/permission-groups/user`, `API-0294 /api/stars`,
  `API-1031 /api/workspaces/[id]/fork/availability`,
  `API-1041 /api/workspaces/[id]/host-context`,
  `API-1057 /api/workspaces/[id]/members`,
  `API-1058 /api/workspaces/[id]/metrics/executions`, and Polaris
  `API-1060 /api/workspaces/[id]/personal-profile`, plus
  `API-1124 /api/workspaces/invitations` are native, while the other 10 routes currently target a
  fixed pre-refactor legacy origin.
- The invitations Module owns a token-free V1 response contract, application use case and repository
  port. Its PostgreSQL adapter uses two batched queries and has passed a disposable PostgreSQL 16
  differential fixture for email normalization, pending/unexpired filtering and grant hydration.
- The workspaces Module owns the lightweight member V1 contract and reuses standalone workspace
  authorization. Its real PostgreSQL fixture proves explicit permission, organization-admin
  inheritance, cross-workspace/archived denial, and that derived admins are not added to the explicit
  member display list.
- The Identity Module owns the Polaris personal-profile V1 contract. Its Biz model carries provider
  aliases as opaque identifiers and imports no Feishu SDK, database, application, or infrastructure
  code. The API compatibility boundary alone restores legacy `providerUserId/openId/unionId` fields.
- Target migration `0275_polaris_external_identity_read_model.sql` introduces the missing
  `external_identity` read model without reusing Polaris migration numbers that conflict with Sim2
  history. A disposable PostgreSQL 16 test executes the migration and proves alias whitelisting,
  stable provider ordering, tenant scoping, and `rawProfile` non-disclosure.
- Identity-provider configuration, directory synchronization, credential reconcile, Feishu
  persistent connection ingress, and identity lifecycle writes are not part of this read slice.
  Feishu ingress remains an independent Node 22.19+ backend role and does not invoke Sandbox
  directly; Sandbox production workers remain Node because the isolated-vm native runtime is not a
  supported Bun execution boundary.
- Workspace invitation management has a separate native read port from the invitee-facing
  invitation list. API-0137 remains token-free and pending/unexpired; API-1124 preserves the
  existing management token and all-status behavior while restricting rows to explicit active
  workspace access or organization owner/admin-derived active workspace access. Archived
  workspaces and users with no accessible workspace return no rows.
- The Organizations Module owns API-0241 through separate organization authorization,
  access-control entitlement, and workspace-read ports. The entitlement adapter preserves
  billing-disabled and self-host flag behavior without importing the legacy Billing barrel, then
  checks owner billing-block and active enterprise subscription in hosted billing mode. The
  workspace projection intentionally retains archived rows because the donor route does not filter
  them.
- The Organizations Module also owns API-0235 through a single roster use-case interface. It keeps
  the member/admin projection, derived organization-admin workspace access, external-member
  grouping, and invitation hydration behind that interface. The donor GET-side stale-invitation
  update is isolated as an explicit best-effort housekeeping port, so it can later be replaced by a
  periodic job without editing the HTTP interface. The PostgreSQL adapter scopes grants to active
  workspaces in the target organization, hardening a donor cross-organization dirty-data leak.
- The Permission Groups Module owns API-0243 through a workspace-context/group-winner read port.
  Its contract normalizer is pure data code and is the only permission-group config surface that
  browser-compatible consumers may import. The module reuses workspace access and organization
  entitlement ports, but never imports the donor EE permission-check, Executor, Block, Provider
  parser, Billing barrel, or runtime registry. Group resolution preserves explicit-member,
  empty/all-members, default precedence and oldest-created tie-breaking within the workspace's
  owning organization.
- The Workspaces Module owns API-1041 through one host-context snapshot port. The port hides active
  workspace identity, owning-organization membership, payer subscription, and billing-block reads;
  application code derives the versioned public projection. Organization workspaces use their
  exact organization payer, personal workspaces use `billedAccountUserId`, and neither path consults
  the session active organization. The native chain imports no React cache, Next runtime, legacy
  workspace helper, or Billing Core. API-1011 credit availability and API-1122 usage gate must reuse
  this seam rather than rebuilding payer selection. A dedicated Workspaces boundary gate enforces
  the Module/adapter/contract import allowlists.
- The Workspaces Module also owns API-1058 through a three-operation execution-metrics read port.
  Application code owns query normalization, all-time range resolution, bucketing, success counts,
  averages, and donor-compatible percentile projection. The PostgreSQL adapter owns
  workspace-scoped workflow selection, trigger/level/paused-state filtering, UTC-normalized
  aggregate bounds, and bounded samples. Neither the Module nor its browser contract imports
  Drizzle, DB, execution payloads, Executor, Registry, or Sandbox.
- The Data Drains Module owns API-0209 through separate entitlement and organization-scoped run-read
  ports. Its application interface preserves membership, deployment/enterprise, owner/admin,
  validation, drain existence, and bounded newest-first query ordering. The PostgreSQL adapters and
  contract import no Next runtime, Auth implementation, legacy Billing/Data Drain helper,
  destination registry, Executor, or Sandbox. A dedicated boundary gate enforces this closure.
- The Workspace Forking Module owns API-1031 through a non-sensitive availability interface and
  three narrow backend ports: active workspace context, Enterprise entitlement, and rollout
  evaluation. The application preserves donor ordering across self-host deployment flags, hosted
  billing entitlement, and hosted AppConfig rollout while collapsing gate failures to
  `{available:false}`. The donor route loaded workspace permission but never inspected
  `hasAccess`; the native compatibility slice removes that redundant read without changing the
  observable session + active-workspace behavior. Tightening availability to workspace members is
  a separate security decision, not an implicit migration change.
- AWS AppConfig is isolated in the server-only `extensions/infra/appconfig` package. It owns the
  profile transport, cold-request coalescing, stale-while-revalidate cache, last-good retention, and
  pure OR-clause rule primitives. It does not own a universal feature registry:
  `workspace-forking`, its fallback, and admin-resolution scheduling remain inside the Forking
  composition. The AWS SDK is dynamically loaded only on actual backend profile access and is
  unreachable from Web facades.
- API-1011 credit availability and API-1122 usage gate remain legacy until a separate Billing
  read-model foundation versions payer attribution, payer/member usage ledgers, daily refresh,
  plan-limit rules, and enforcement/display projections. Copying `checkAttributedUsageLimits` or
  the legacy Billing Core into either Workspaces or Data Drains is prohibited.
- Remaining W2 native read repositories, workspace/organization tenant authorization, real database
  fixtures for the other 10 routes, and removal of the legacy-origin dependency are incomplete; the
  normative per-route status is `docs/testing/api-w2-tenant-read-coverage.json`.

## Out of Scope

- Rewriting the complete API, Executor, or Runtime Registry in Go.
- Replacing Trigger.dev before execution seams and compatibility tests are stable.
- Replacing Next with Vite in the first API/Worker separation project.
- Designing a universal plugin framework before a real Feishu or Meegle Adapter proves the interface.
- Deleting Sim2 integrations to improve compile performance.
- Rewriting all 555 Tool routes by hand.
- Merging unrelated Sim2 and Polaris Git histories.
- Changing historical Tool, Block, Trigger, workflow, or execution identifiers without an explicit migration.
- Combining Stream Replay, Channel Event Replay, and Execution Replay into one generic replay abstraction.
- Moving PII or content processing into the browser.
- Removing legacy compatibility routes before traffic and differential evidence support deletion.

## Further Notes

- The engineering directory plan is the normative source for physical folder ownership.
- The Module Alignment Matrix is the normative source for periodic Sim2 upstream synchronization and
  Polaris capability destinations.
- The API inventory is the normative source for route-level completeness, priority, risk, and tests.
- Current direct same-directory route test coverage is only about 16.5%; generated smoke coverage and
  Module-level tests are mandatory before cutover.
- The currently proposed performance numbers remain adjustable after a fixed baseline run, but zero
  Web reachability to server-only Modules is a non-negotiable acceptance condition.
- This Spec is published locally according to repository policy; no external issue-tracker mutation
  is required for this delivery.
