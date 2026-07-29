# 独立 API 骨架与 W1 三接口

What to build: 建立独立 TypeScript API 进程、兼容代理与 W1 的 3 个探针接口。
Blocked by: 04
Status: ready-for-agent

## What to build

实现启动/关闭、配置、日志、request ID、错误 envelope、健康与环境探针；Next 保留同路径兼容门面。

## Acceptance criteria

- Inventory 中 `Wave = W1` 的精确 3 条全部生成 route coverage 记录。
- 独立 API 可单独启动并通过 readiness/liveness；Next Web 不必编译 route 实现即可访问。
- 新旧 wire contract/status/header differential test 通过。
- 反向代理支持逐路由开关、超时、回滚和 request ID 透传。
- W1 的 C/D/I/P 测试以及 API 冷启动/内存基线通过。

## Blocked by

04。
