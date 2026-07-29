# 建立跨 Web/API/Worker 的契约基础

What to build: 建立 API、execution、tool-catalog、extension SDK 的浏览器安全 contract primitives。
Blocked by: 02, 03
Status: ready-for-agent

## What to build

提供纯数据 schema、错误 envelope、分页、身份上下文、job/event/debug-session 版本策略和 contract test helper。

## Acceptance criteria

- Contract packages 不依赖 Next、React、DB、Executor、registry、Provider SDK 或 Node-only secret/runtime。
- Web/API/Worker 使用同一 wire type，生成 OpenAPI/类型产物可重复且 clean tree。
- schema 兼容性检查覆盖 optional/nullable、错误状态、版本演进和未知字段策略。
- 至少一个 Web→API→Worker tracer contract 通过类型、序列化与兼容性测试。

## Blocked by

02、03。
