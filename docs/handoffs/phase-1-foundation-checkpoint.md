# Phase 1 工程拓扑与边界门禁检查点

> 日期：2026-07-30
> 状态：本地验证与远端 push 完成，完整 Next 冷构建待 workflow_dispatch 验证

## 本检查点已落地

- 独立的 `apps/api` 与 `apps/worker` Node 22.19+ 可构建入口；
- `apps/content-processor` Python ownership root；
- Biz、Infra、API contract、Execution contract、Tool Catalog 与 Polaris Extension SDK
  workspace roots；
- 包、Biz、Infra、Feishu ingress 的导入边界；
- 浏览器传递依赖闭包扫描、历史债务 ratchet 与新前端目录零预算；
- Next trace、RSS、compile-path、chunk 的机器可读基线和 CI 采集器；
- Node/Bun 运行时矩阵与 Feishu persistent connection 独立 role 的 ADR。

目录创建遵循 ownership：当前只建立拥有真实 package interface、entrypoint、test 或 validator
的 Module root；Spec 中的行为叶目录由对应迁移 ticket 创建，不使用 `.gitkeep` 伪造数百个
空模块。

## 本地验证

| 检查 | 结果 |
| --- | --- |
| Frozen offline install | 通过 |
| Target structure | 33 roots、15 required files，通过 |
| Monorepo boundary | Package/Biz/Infra/Feishu ingress，通过 |
| 新 workspace type-check | 20/20 通过 |
| API/Worker tests | 2 files、2 tests 通过 |
| API/Worker Node builds | 2/2 通过，23.29 KB / 22.61 KB |
| API/Worker Node runtime smoke | 启动、响应/存活、SIGINT shutdown 通过 |
| Browser runtime closure | ratchet 通过，新目录污染为 0 |
| Biome 与 `git diff --check` | 通过 |

## 已量化的历史债务

- Client roots：588；
- 可达 Executor：297；
- 可达 execution/sandbox：267；
- 可达 runtime Tool/Block/Trigger：200；
- 可达 database/auth/secrets：71；
- Polaris 活跃 trace 的最新快照：281 次 compile、累计 4,922.1 秒、19 次内存阈值重启；
- 一方 Blocks 与 Tools 开发 chunk 分别约 1.43 MB 与 0.91 MB gzip。

这些数字是只能下降的迁移基线，不是目标预算。最终目标均为 0 个浏览器 root 可达服务端
runtime。

## 未关闭项

1. 现有 Client 污染要在 Tool Catalog、Auth seam、Replay/Debug 迁移中归零；
2. bundle deny list 在上述闭包归零后切换为严格门禁；
3. 完整 Next 冷构建预计峰值约 51 GB，由既有 `Build App` CI job 验证；
4. Phase 0 `98a10537d` 与 Phase 1 `1cb2be8a5` 已推送到
   `origin/codex/frontend-backend-refactor`；远端没有自动触发 branch workflow，需要显式
   dispatch `Test and Build`。

## 下一实施入口

先完成 Ticket 04 的 contract package foundation，再执行 Ticket 05/06，将浏览器可消费的
Tool Catalog 与 Worker-only Runtime Registry 物理拆开。Feishu ingress 的具体连接、租约、
durable inbox 与 fake adapter 行为由 Ticket 36 落地，且不得接触 Sandbox。
