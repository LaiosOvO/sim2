# Phase 2 Worker-only Runtime Registry 检查点

> 日期：2026-07-30
> Ticket：06 completed

## 已建立的深模块

Worker Runtime Registry 隐藏 provider loader、执行 binding、credential resolution 和输入
校验。调用方只看到：

- `capability(toolId)`：不加载 Provider 的静态能力查询；
- `execute(request)`：返回 versioned success/failure，不暴露 Provider 对象；
- `loadedProviderIds()`：仅用于健康检查和测试的加载诊断。

Worker package 没有 `exports`，公共 Registry 入口只允许
`apps/worker/src/bootstrap/composition` 导入。application/job handler 只引用内部 type
contract；Web、API、共享 packages 与 Catalog 都不能导入 Worker Registry。

## 首个真实迁移切片

| 项目 | 值 |
| --- | --- |
| Provider | Notion |
| Canonical ID | `notion_add_database_row_v2` |
| Historical alias | `notion_add_database_row` |
| Credential | job 携带 opaque `credentialRef`，Worker port 返回 bearer token |
| Transport | 固定 `https://api.notion.com/v1/pages` 的后端 adapter |
| 输入校验 | `databaseId` 非空字符串、`properties` object |

定向集成测试从 `ExecutionJobV1` 使用历史 ID 进入 Worker application，经 lazy loader、
credential resolver 和 fake Notion transport，最终返回 canonical ID 和旧工具一致的
page output 字段。

## Versioned contract

`@sim/execution-contracts/runtime-tools` 新增：

- `RuntimeToolInvocationV1`
- `RuntimeToolExecutionErrorV1`
- `RuntimeToolExecutionResultV1`

错误码覆盖 job payload、tool/provider lookup、Provider export、参数、credential 和执行
失败。OpenAPI/contract manifest 从 10 个 schema 扩展到 13 个 schema，仍由
`contracts:check` 做 clean-tree 验证。

## Catalog 与 Registry 的关系

Runtime Registry 不 import `@sim/tool-catalog` 或生成 JSON。构建期
`check-runtime-catalog-consistency.ts` 读取两侧数据，确认：

- 1 个 runtime declaration；
- 1 个 canonical ID；
- 1 个 historical alias；
- 两个 ID 都存在于 Notion Catalog capability；
- provider shard hash 与 Catalog manifest 一致。

这使 metadata 与执行 binding 可独立部署，同时防止 ID 漂移。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| Execution contract tests | 5/5 |
| Worker tests | 7/7 |
| Worker/contract type-check | 2/2 workspace |
| Worker split build | 3 outputs；entry 0.49 MB，Provider chunk 3.92 KB |
| Lazy-build marker | Provider 不在 startup entry |
| Runtime/Catalog consistency | 1 declaration、2 IDs 通过 |
| Registry boundary | 无 package export、composition bypass 或浏览器/API/Catalog import |
| Target module cycles | 20 packages、43 source nodes、0 cycle |
| Browser runtime closure | `api-or-worker` 0，zero-budget violation 0 |

## 尚未完成

旧 `apps/sim/tools/registry.ts` 与旧 Executor 调用链仍在生产路径。本检查点只固定首个
Provider 的正确模块边界；后续按 provider 波次迁移更多工具，并在 job/Executor facade
切换完成后删除旧 Registry，而不是一次复制 8,000+ 行静态注册表。

## 下一步

Ticket 07 建立 API skeleton 与 W1 health/ready/version admission；Ticket 08 建立 Worker
job/Sandbox skeleton。两者使用本阶段的 execution contract 和 Registry seam，不允许
把 Provider 或 Sandbox 再塞回 Web。
