# Worker Job 与后端 Sandbox 骨架

What to build: 建立 Worker 生命周期、版本化 Job/Event 协议和纯后端 Sandbox adapter。
Blocked by: 04, 06
Status: ready-for-agent

## What to build

完成 job admission/ack/retry/cancel 的最小 tracer，Sandbox 仅以 port 暴露给 Worker，先支持受限测试执行。

## Acceptance criteria

- API 可提交版本化测试 job，Worker 消费后产生有序事件与终态。
- duplicate delivery、retry、cancel、timeout 和 poison job 有自动测试。
- Sandbox 网络、文件、CPU/内存/时间限制和 secret injection 有策略与审计。
- Web/API contract 包不导出 Sandbox 实现；客户端闭包不含 Sandbox SDK。
- Worker 与 Sandbox 可分别部署并有健康检查。

## Blocked by

04、06。
