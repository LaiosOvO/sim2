# 演练 Sim2 Upstream 同步并完成交付

What to build: 验证重构后能持续吸收 Sim2 main 更新，并形成最终运维/开发 handoff。
Blocked by: 45
Status: ready-for-agent

## What to build

用模块对齐表执行一次真实或模拟 upstream delta 分类、落位、冲突处理、回归与状态更新；补齐 runbook、owner 和回滚说明。

## Acceptance criteria

- 对 upstream 新增/修改/删除模块能判定目标目录、同步策略、owner 和所需测试。
- `upstream-sync-state.json` 仅在同步与验证完成后更新 commit。
- 演练覆盖 Web、API contract、Worker runtime、tool adapter 与 upstream-only route 变化。
- 所有阶段 commit 已 push，工作树 clean，CI 与最终验收报告通过。
- handoff 文档包含架构边界、部署、监控、故障处理、迁移剩余项为 0。

## Blocked by

45。
