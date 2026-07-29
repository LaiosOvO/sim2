# Phase 2 Browser-safe Tool Catalog 检查点

> 日期：2026-07-30
> Ticket：05 completed

## 已建立的边界

浏览器不再通过代表性画布消费者读取完整 Block Registry。Catalog 生成器只在构建期用
TypeScript AST 读取声明，不执行 Registry，也不加载 Executor、鉴权、加密、secrets 或
Provider SDK。

```text
apps/sim/blocks/registry-maps.ts + BlockConfig declarations
  -> scripts/catalog/generate-tool-catalog.ts
  -> packages/tool-catalog/generated/
     ├─ browser-summary.json
     ├─ catalog.manifest.json
     └─ providers/*.json
  -> apps/sim/lib/catalog/client.ts
  -> canvas integration matcher / Copilot mention data
```

## 稳定产物与接口

- Catalog version：`1`
- Catalog hash：
  `sha256:18ffa91faaf8b0911ce6d8cc90451d2e324ed382b134124d4340f08449d6d53b`
- Catalog items：313
- Provider shards：280
- 旧 UI metadata differential comparison：231/231
- Browser summary：15,127 bytes gzip
- Browser reader：`get`、`all`、`search`
- 查询条件：ID/legacy alias、provider、query、cursor、limit

生成命令为 `bun run catalog:generate`；CI 使用 `bun run catalog:check` 逐字节验证
summary、manifest 和全部 provider shards。

## 已迁移的真实消费者

- `apps/sim/blocks/integration-matcher.ts`
- `apps/sim/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/copilot/components/user-input/hooks/use-mention-data.ts`

两处都通过 `apps/sim/lib/catalog/client.ts` 访问 metadata。integration matcher 继续保留
toolbar hidden、preview、kill switch、icon availability 和去重行为；定向测试覆盖 Slack
metadata 与 kill switch。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Catalog clean-tree generation | 313 items、280 shards、231/231 differential match |
| Tool Catalog unit/type tests | 2/2 tests，type-check 通过 |
| Canvas consumer tests | 2/2 tests 通过 |
| Catalog consumer import gate | 2 个真实消费者通过 |
| Catalog browser isolation | 80,140 raw / 14,425 gzip，forbidden marker 0 |
| Contract purity | 4/4 packages 通过 |
| Target cycles | 20 packages、35 source nodes，0 cycle |
| Monorepo boundaries | packages、Biz、Infra、Feishu ingress 全部通过 |
| Full browser closure ratchet | 通过；0 个 zero-budget violation |

## 尚未完成的性能结论

全局浏览器闭包仍是 588 个 client root；Executor、execution/sandbox 和 runtime
tools/blocks/triggers 分类分别仍有 297、267、200 个可达入口。原因是同一页面还有其他旧
依赖链，不代表这两个消费者仍 import Registry。当前只能确认 consumer seam 与独立
browser artifact 安全，不能宣称整个画布 bundle 已完成瘦身。

## 下一步

Ticket 06 建立 Worker-only Runtime Registry：把执行 binding、SDK client factory、
credential resolution 与 trigger runtime 藏在 Worker composition root 后，并提供 lazy
loader/allowlist。随后继续把剩余画布消费者逐个从 Registry 闭包迁出，使全局 ratchet
实际下降。
