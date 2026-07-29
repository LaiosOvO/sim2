# 迁移 W3 剩余 Core CRUD

What to build: 迁移 W3 不属于 Tickets 13–18 selector 的剩余 23 条接口。
Blocked by: 13, 14, 15, 16, 17, 18
Status: ready-for-agent

## What to build

通过补集 selector 覆盖 billing、schedules、guardrails、help、desktop、proxy 等较小领域。

## Acceptance criteria

- 补集精确为 23 条；W3 七个 report 合并后恰为 263 条且互斥。
- 每条具备 contract、API handler、Next facade、观测和清单指定测试。
- 人工 review 项均有明确 auth/dependency 决策，不保留 `Pure/other` 未解释状态。
- W3 切流后相关 Next route 不再编译服务实现。

## Blocked by

13、14、15、16、17、18。
