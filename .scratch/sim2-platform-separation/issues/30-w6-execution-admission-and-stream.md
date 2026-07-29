# 迁移 W6 Execution Admission、Job 与 Stream

What to build: 迁移 API-0124、API-0138、API-0991、API-0992、API-0993、API-0994 共 6 条。
Blocked by: 08, 29
Status: ready-for-agent

## What to build

API 只做鉴权、验证、幂等 admission 与 projection；Worker 持有 Executor/Runtime，事件流支持断线续传。

## Acceptance criteria

- 六个 ID 的 selector 精确匹配且无其他 W6 路由。
- normal run、cancel、status、job polling、SSE reconnect/backpressure 与 duplicate command 测试通过。
- API-0991/0994 的 Sim2/Polaris 分叉行为有明确兼容结果。
- Web/API import closure 不含 Executor，C/A/D/I/E/P/R/S 测试通过。

## Blocked by

08、29。
