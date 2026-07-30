# ADR-0005：Node 22、Next 与开发性能边界

- 状态：Accepted
- 日期：2026-07-30
- 范围：Next Web、Realtime、API、Worker、Tool Catalog、Runtime Registry

## Context

开发入口长期同时存在 Bun 调度、Next shebang、Bun Realtime 和 Node API/Worker，日志无法
直接证明各服务的实际 runtime。另一方面，浏览器展示 metadata 的代码可传递导入 Runtime
Registry 和服务端实现，Next 开发编译器会按访问路由放大该依赖闭包。

`dev:minimal` 通过替换完整注册表可以快速验证闭包假设，但会精简可用 Integration，不能
成为最终开发方案。直接切换 webpack 或迁移 Vite 也不会自动修复 client/server 污染。

## Decision

1. Node.js `>=22.19.0` 是根目录、Next、Realtime、API 和 Worker 的应用运行时契约。
2. Bun 继续负责安装、构建、测试和脚本编排；它不得直接执行四个服务的应用入口。
3. Next 16 保留。`apps/sim/scripts/run-next.mjs` 通过 `process.execPath` 加载 Next CLI，
   避免依赖 Bun 或平台 shebang 的隐式行为。
4. Realtime 开发使用 Node + `tsx`，生产使用 `bun build --target=node` 的产物和
   `node dist/index.js`。
5. API 与 Worker 保留 Node 入口，并与 Next/Realtime 统一预加载版本 guard。启动日志必须
   包含 service、runtime、version 和 execPath。
6. `@sim/tool-catalog` 是浏览器可消费的 presentation metadata 边界；Runtime Registry、
   Executor、Sandbox、Provider SDK、DB/Auth 和服务端加密不得进入新浏览器根。
7. Runtime Registry 保持 Worker-only，并按稳定工具 ID 懒加载。性能优化不得删除
   Integration 或修改稳定 ID。
8. 完整 Turbopack 是默认和验收模式；minimal 与 webpack 仅用于归因。
9. 时间 SLA 只在固定 Node 22 runner、固定旅程和隔离开发缓存中硬验收。CI 阻断确定性的
   runtime、边界、体积、类型和测试回归，不用共享 runner 的抖动阻断时间 SLA。

## Consequences

- `bun run dev:full` 的外层仍是 Bun，但四个子服务必须分别打印 Node runtime proof。
- 浏览器需要新 metadata 时，优先扩展 versioned Catalog projection；不能从 UI 重新导入
  Registry 实现。
- 编辑器完整配置按 ID 懒加载属于后续独立 seam；Catalog 不承载 Executor 或 Provider
  实现。
- 框架迁移只有在闭包、API 和数据库问题被排除后才能立项，避免用换 bundler 掩盖架构债。

## Rejected alternatives

- 以 `dev:minimal` 作为默认：破坏完整工具与区块能力。
- 用 Bun 直接运行 Realtime/Worker：扩大 native addon 和双运行时兼容矩阵。
- 立刻迁移 Vite：同时改变框架与架构边界，无法归因且风险过大。
- 把完整 Block/Tool Registry 序列化给浏览器：泄漏执行实现并继续放大 bundle。
