# ADR-0004：Node 生产运行时与飞书长连接隔离

- 状态：Accepted
- 日期：2026-07-30
- 范围：Web、API、Worker、Feishu Persistent Connection、Sandbox

## Context

Polaris 的开发命令表面上从 `bun run dev` 启动，但脚本实际用
`node --import tsx` 运行，并由 Node 启动 Next。生产镜像也按 Node ABI 重编译
`isolated-vm`，最终以 Node 启动。

飞书 Bot 长连接由 Next 的 `instrumentation-node.ts` 创建。连接 handler 本身不使用
Sandbox，但会直接调用 webhook processor，后者可进入 workflow execution。这使连接管理、
Web 请求、Executor 与 Sandbox 形成同进程故障域和导入闭包。Web 健康不代表 Bot 已连接，
Sandbox/Executor 压力也可能影响长连接。

Polaris 当前的静态依赖链已经能复现这项耦合，不需要飞书事件真的触发 Sandbox：

```text
instrumentation-node.ts
  -> lib/polaris/integrations/feishu/ws-trigger.ts
  -> lib/webhooks/processor.ts
  -> background/webhook-execution.ts
  -> lib/workflows/executor/execution-core.ts
  -> executor/execution/executor.ts
  -> executor/orchestrators/loop.ts
  -> lib/execution/isolated-vm.ts
```

其中 `ws-trigger.ts` 既维护连接生命周期，又负责业务卡片动作、审批、channel wait 和
workflow dispatch，形成了一个浅 interface、大 implementation 的协调器。目标不是把这段
implementation 原样搬进另一个进程，而是在飞书 ingress 与 workflow admission 之间建立
窄 seam。

本地代码 Sandbox 还明确要求 Node：宿主检查 `node --version`，再用
`node --no-node-snapshot` 启动 `isolated-vm-worker.cjs`。强行改为 Bun 会引入 native ABI、
IPC 和 V8 行为风险，且对前端编译问题没有帮助。

2026-07-30 的本机运行时探针进一步区分了两个问题：

- Bun 1.3.11 可以导入 `@larksuiteoapi/node-sdk` 1.71.1、构造 `WSClient`、读取 idle
  connection status 并关闭 client；因此不能把当前服务不能用 Bun 简化成“飞书 SDK
  完全不支持 Bun”。这只是构造级探针，不代表生产长连接、自动重连、代理、TLS 和信号
  处理已经获得 Bun 兼容性保证。
- `isolated-vm` 6.0.2 的 package engine 明确是 Node `>=22.0.0`。同一安装产物在
  Node 22.20.0 下加载后得到 `Isolate` constructor；在 Bun 1.3.11 下执行
  `require('isolated-vm')` 会明确失败：安装产物使用 Node module ABI 127，而该 Bun
  兼容层要求 ABI 137。它不能作为 Bun 进程内 native addon 使用。

所以 Node 决策既来自当前部署事实，也来自 Sandbox 的确定性兼容边界；不依赖于对飞书
SDK 的猜测。

## Decision

1. Bun 是 monorepo 的 package manager、script runner、build tool 和 test launcher。
   `bun run dev` 只是外层脚本入口；Polaris 的 `apps/sim` 开发脚本实际执行
   `node --import tsx scripts/dev-node.ts`，并继续由 Node 启动 Next。
2. Next Web、独立 API、Worker、飞书 persistent connection 与 local Sandbox 的生产
   runtime 固定为 Node.js 22.19+。
3. `apps/worker` 的同一构建产物提供独立 deployment role：
   - `execution`：Executor、Runtime Registry、Sandbox 和执行 jobs；
   - `feishu-ingress`：WSClient、credential reconcile、connection health、event
     normalization、dedupe 与 job admission。
4. `feishu-ingress` 通过 `extensions/infra/feishu-channel/src/triggers` 的小 interface
   使用连接 Module；不得 import Executor、Runtime Registry、Sandbox 或 Next。
5. 飞书事件进入 durable inbox/job 后才交给 workflow execution。卡片动作在飞书时限内
   只等待 durable claim/queue acknowledgement。
6. Web/API、Feishu ingress、Execution Worker 和 Sandbox 使用独立 readiness、指标、
   扩缩容与回滚开关。
7. local isolated-vm adapter 继续使用 Node child process；E2B/Daytona 镜像显式 pin
   兼容 Node 版本。

## Interface and adapters

连接 Module 的 interface 只暴露：

- `start()` / `stop()` 生命周期；
- `reconcile()` 凭证目标对账；
- `status()` 脱敏连接状态；
- 归一化事件提交 callback。

生产 adapter 使用 Lark Node SDK、数据库 credential source 与 durable job sink。测试
adapter 使用 fake credential source、fake WS client 和 in-memory job sink。调用者不需要
知道 Lark payload、重连 timer、Executor 或 Sandbox。

## Consequences

- 不能再用 `bun run ...` 的外层命令推断生产 runtime。
- 飞书 SDK 的 Bun 构造级探针通过，不构成把 ingress 切换到 Bun 的授权或兼容性承诺；
  生产 runtime 仍统一固定为 Node，避免为无业务收益的双运行时矩阵付费。
- API/Worker Dockerfile、Helm command、runtime smoke test 必须明确执行 `node`。
- 飞书连接可以独立滚动和扩缩容；必须通过租约或 leader election 保证同一 credential
  只有受控消费者。
- Web/API 正常而飞书离线时，readiness 与告警会明确区分故障域。
- Sandbox 的 Node/native 约束被收口到后端，不影响浏览器 bundle。
- 不把 `ws-trigger.ts` 的现有大协调器原样迁移。连接生命周期、事件归一化、幂等 admission
  与审批/channel-wait 消费分别通过窄 interface 组合，workflow execution 只在队列消费者
  一侧出现。

## Rejected alternatives

- 让飞书长连接继续由 Next instrumentation 托管：保留了错误故障域与执行闭包。
- 让 Feishu ingress 与 Sandbox 共用一个 Worker role：无法独立扩缩容和判定健康。
- 为统一技术栈而强制 Bun 运行 isolated-vm：收益不足以覆盖 native ABI 与 V8 风险。
- 立即新增一个独立 app：当前同一 Worker 构建产物的 role 已能形成部署 seam；若未来运维
  数据证明需要不同发布周期，再通过 ADR 拆成独立 app。
