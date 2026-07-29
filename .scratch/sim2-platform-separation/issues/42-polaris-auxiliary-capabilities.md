# 迁移 Polaris 非路由辅助能力

What to build: 迁移 Content Processor、Mothership 与 Operations Agent 的有效行为，不复制其旧聚合边界。
Blocked by: 18, 31, 40, 41
Status: ready-for-agent

## What to build

Content Processor 进入独立后端应用；Mothership 行为进入 API orchestration/Worker jobs；Operations Agent 能力进入 Operations Biz 与 Worker。

## Acceptance criteria

- 对齐表列出的 Polaris-only 非路由能力逐项有 target、keep/adapt/drop 决策和测试证据。
- Content Processor 独立构建、部署、健康检查、队列/存储集成与失败恢复通过。
- 不建立新的通用“mothership”或“agent”大注册表。
- 原 Polaris golden fixtures 与关键 E2E 行为通过。

## Blocked by

18、31、40、41。
