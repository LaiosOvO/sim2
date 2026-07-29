# Phase 2 Contract Foundation 检查点

> 日期：2026-07-30
> Ticket：04 completed

## 稳定接口

- `@sim/api-contracts/errors`
- `@sim/api-contracts/identity`
- `@sim/api-contracts/pagination`
- `@sim/api-contracts/tracing`
- `@sim/execution-contracts/jobs`
- `@sim/execution-contracts/events`
- `@sim/execution-contracts/debug`
- `@sim/tool-catalog`
- `@sim/polaris-extension-sdk`

所有 wire object 带显式版本；Zod object 对新增未知字段采用 strip 策略，破坏性变更必须新增
版本。Debug command 通过 `commandId + expectedVersion` 表达幂等和并发控制，不把 Executor
对象暴露给浏览器。

## 生成物

- `packages/api-contracts/generated/platform.openapi.json`
- `packages/api-contracts/generated/contract-versions.json`

`bun run contracts:generate` 生成，`bun run contracts:check` 在 CI 中逐字节验证。TypeScript
wire types 由相同 Zod schema 使用 `z.infer` 推导。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Contract purity | 4/4 package 通过 |
| Target cycles | 20 packages、34 source nodes，0 cycle |
| Contract/application tests | 9 tests 通过 |
| Type-check | 6/6 workspace 通过 |
| API/Worker build | 2/2 通过 |
| OpenAPI/manifest clean tree | 10 schemas 通过 |
| Web trace browser build | 200 bytes，forbidden marker 为 0 |

## 下一步

Ticket 05 使用 `@sim/tool-catalog` 建立生成期 Catalog、稳定 hash、provider 分片、搜索分页与
legacy ID alias，并迁移一个画布消费者。Catalog 生成器只能读取声明文件或隔离进程输出，
最终 browser artifact 不能 import Runtime Registry。
