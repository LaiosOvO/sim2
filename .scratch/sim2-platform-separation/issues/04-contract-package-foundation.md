# 建立跨 Web/API/Worker 的契约基础

What to build: 建立 API、execution、tool-catalog、extension SDK 的浏览器安全 contract primitives。
Blocked by: 02, 03
Status: completed

## What to build

提供纯数据 schema、错误 envelope、分页、身份上下文、job/event/debug-session 版本策略和 contract test helper。

## Acceptance criteria

- Contract packages 不依赖 Next、React、DB、Executor、registry、Provider SDK 或 Node-only secret/runtime。
- Web/API/Worker 使用同一 wire type，生成 OpenAPI/类型产物可重复且 clean tree。
- schema 兼容性检查覆盖 optional/nullable、错误状态、版本演进和未知字段策略。
- 至少一个 Web→API→Worker tracer contract 通过类型、序列化与兼容性测试。

## Blocked by

02、03。

## Implementation evidence

- `@sim/api-contracts` 提供 versioned error envelope、pagination、identity 与 W3C trace
  context schema；
- `@sim/execution-contracts` 提供 versioned job、event、debug session 与幂等 command schema；
- `@sim/tool-catalog` 只提供可序列化 metadata primitive，`@sim/polaris-extension-sdk` 只提供
  lifecycle/descriptor，不包含 Provider DTO 或业务 aggregate；
- pure-contract gate 验证 4 个包没有 Next、React、DB、Executor、Registry、Provider SDK、
  Node builtin、secret 或环境变量依赖；
- 10 个 schema 可重复生成 OpenAPI 3.1 与版本清单，`contracts:check` 验证 clean tree；
- optional/nullable、错误状态、未知字段剥离、版本拒绝、JSON roundtrip 和
  Web→API→Worker trace 兼容性测试通过；
- Web trace adapter 只做 type-only import，独立 browser build 为 200 bytes，Zod、Executor、
  Registry 与 Node runtime marker 均为 0；
- API/Worker type-check、9 个 contract/application tests 和两个 Node target build 通过。
