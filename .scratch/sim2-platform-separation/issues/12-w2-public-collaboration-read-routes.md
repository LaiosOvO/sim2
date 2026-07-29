# 迁移 W2 其余只读接口

What to build: 迁移 W2 除 Tickets 10–11 外的 37 条只读接口。
Blocked by: 09
Status: ready-for-agent

## What to build

以 `Wave = W2 AND NOT ticket-10-selector AND NOT ticket-11-selector` 为筛选器，覆盖 v1
以及协作、计费、桌面等只读入口。

## Acceptance criteria

- 补集精确为 37 条；W2 三个 coverage report 合并后恰为 95 条且互斥。
- API key/session/manual-review 各认证模式保持原行为。
- 所有接口完成 contract、facade、日志/指标和清单指定测试。
- W2 全量切到独立 API 后，Next route compile 不加载其服务实现。

## Blocked by

09。
