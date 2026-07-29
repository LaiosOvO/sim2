# Worker Job 与后端 Sandbox 骨架

What to build: 建立 Worker 生命周期、版本化 Job/Event 协议和纯后端 Sandbox adapter。
Blocked by: 04, 06
Status: completed

## What to build

完成 job admission/ack/retry/cancel 的最小 tracer，Sandbox 仅以 port 暴露给 Worker，先支持受限测试执行。

## Acceptance criteria

- API 可提交版本化测试 job，Worker 消费后产生有序事件与终态。
- duplicate delivery、retry、cancel、timeout 和 poison job 有自动测试。
- Sandbox 网络、文件、CPU/内存/时间限制和 secret injection 有策略与审计。
- Web/API contract 包不导出 Sandbox 实现；客户端闭包不含 Sandbox SDK。
- Worker 与 Sandbox 可分别部署并有健康检查。
- Worker 构建产物在 Node.js 22.19+ 启动；生产 entrypoint 不使用 Bun。

## Blocked by

04、06。

## Implementation design log

- `executionJobV1` 继续是 API -> Worker 的唯一版本化 job envelope；新增 admission、
  cancellation、Sandbox test payload/policy/result contract，不把 Sandbox adapter 暴露给 API。
- Worker 的 job coordinator 只暴露 `submit/cancel/start/stop/status`，内部隐藏 queue delivery、
  idempotency ledger、retry、event sequence、timeout 与 Sandbox 选择。
- Ticket 08 使用受限测试 Sandbox，只支持 `echo/delay/transient-failure/fatal-failure`，
  不接收任意 JavaScript，不在 Worker 主进程执行用户代码。
- Sandbox policy 固定 network deny、ephemeral filesystem、credential reference only，并对
  wall-clock、CPU、memory/input bytes 设上限；后续 isolated-vm/E2B/Daytona 都实现同一 port。
- `apps/worker` 的同一 Node build 提供 `execution` 与 `sandbox` 独立 role；两者有独立
  liveness/readiness，生产 entrypoint 明确执行 Node 22.19+，Bun 只负责 build/test。
- Ticket 08 的 queue adapter 是可测试的内存 adapter，用于证明 delivery state machine；
  它不是生产 durable queue。后续 Redis/Trigger.dev adapter 必须替换 port，不能改变
  coordinator 或 contract。

## Implementation evidence

- `@sim/execution-contracts/job-control` 已生成 admission、cancel、Sandbox policy、
  restricted payload、command/result/failure；Platform Contract 共 29 schemas；
- API 内部 admission 只依赖 `ExecutionJobSubmitter`，production HTTP adapter 不 import
  Worker/Sandbox 实现；
- Worker coordinator 自动测试覆盖真正的 duplicate redelivery、transient retry、retry
  exhaustion、active cancel、timeout 和 poison delivery；
- Sandbox secret object 使用 strict schema，明文 `values` 被拒绝；network deny、
  ephemeral filesystem、CPU/memory/wall/input budgets 和 credential refs 会写入结构化 audit；
- execution 与 sandbox role 可独立启动、独立 readiness；Sandbox 独立构建为 87,228 gzip
  bytes，Runtime Registry/Notion/execution coordinator/飞书 SDK marker 为 0；
- Node build-artifact smoke 已真实跑通
  `API -> execution Worker -> Sandbox role -> started/completed`；
- API tests 11/11、Worker tests 17/17、Execution Contract tests 6/6，相关 type-check/build
  通过；browser closure 的 `api-or-worker` 保持 0；
- 当前内存 queue/state 和 restricted Sandbox 明确不是 production cutover 产物；durable
  queue/lease/crash recovery 与 isolated-vm/E2B/Daytona 是后续 Ticket 的阻断条件。
