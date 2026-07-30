# Sim2 Refactor 文档索引

## 正式规格

- [Sim2 前后端分离与 Polaris 能力迁移 Spec](./specs/sim2-platform-separation-and-polaris-migration.md)

## 架构与证据

- [前后端分离与注册表重构审计](./architecture/frontend-backend-separation-audit.md)
- [目标工程结构与迁移规划](./architecture/target-engineering-structure-and-migration-plan.md)
- [API 全量兼容与迁移清单](./architecture/api-migration-inventory.md)
- [Infra/Biz Extension Topology ADR](./architecture/decisions/ADR-0003-infra-biz-extension-topology.md)
- [Node Runtime 与飞书长连接隔离 ADR](./architecture/decisions/ADR-0004-node-runtime-and-feishu-ingress-isolation.md)
- [Node 22、Next 与开发性能边界 ADR](./architecture/decisions/ADR-0005-node22-next-development-performance-boundary.md)
- [Sim2 Node 22 启动与开发性能解决方案](./architecture/node22-development-performance-solution.md)
- [Node 22 开发性能问题清单与根因报告](./reviews/node22-development-performance-root-cause.md)

## 主线同步与能力对齐

- [Sim2 主线同步与 Polaris 能力迁移对齐表](./migration/module-alignment-matrix.md)
- [当前 upstream/donor 基线](./migration/upstream-sync-state.json)

## 测试与性能基线

- [浏览器运行时闭包基线](./testing/browser-runtime-closure-baseline.json)
- [性能与构建产物基线](./testing/performance-baseline.json)
- [浏览器 Bundle 策略](./testing/browser-bundle-policy.json)
- [W1 API 路由覆盖](./testing/api-w1-route-coverage.json)
- [W1 API Node 冷启动基线](./testing/api-w1-performance-baseline.json)
- [Node 22 开发性能机器可读证据](./testing/evidence/node22-development-performance.json)
- [W2 租户只读接口覆盖](./testing/api-w2-tenant-read-coverage.json)

## Goal

- [Sim2 Refactor Goal Prompt](./goals/sim2-refactor-goal-prompt.md)

## 实施检查点

- [Sim2 Node 22 与 Next.js 开发性能专项完整改造说明](./handoffs/sim2-node22-performance-complete-change-guide.md)
- [Phase 1 工程拓扑与边界门禁检查点](./handoffs/phase-1-foundation-checkpoint.md)
- [Phase 2 Contract Foundation 检查点](./handoffs/phase-2-contract-foundation.md)
- [Phase 2 Browser-safe Tool Catalog 检查点](./handoffs/phase-2-tool-catalog.md)
- [Phase 2 Worker-only Runtime Registry 检查点](./handoffs/phase-2-runtime-registry.md)
- [Phase 3 W1 独立 API 检查点](./handoffs/phase-3-w1-api.md)
- [Phase 3 Worker Job 与 Sandbox 骨架检查点](./handoffs/phase-3-worker-sandbox-skeleton.md)
- [Phase 3 认证与请求上下文 seam 检查点](./handoffs/phase-3-auth-request-context.md)
- [Node 22 开发性能重构与运行手册](./handoffs/node22-development-performance-runbook.md)
- [Phase 4 W2 租户只读兼容平面检查点](./handoffs/phase-4-w2-tenant-read-compatibility.md)
- [Phase 4 W2 原生路由与 Stars 检查点](./handoffs/phase-4-w2-native-stars.md)
- [Phase 4 W2 原生邀请读取检查点](./handoffs/phase-4-w2-native-invitations.md)
- [Phase 4 W2 原生 Workspace Members 检查点](./handoffs/phase-4-w2-native-workspace-members.md)
- [Phase 4 W2 原生 Polaris Personal Profile 检查点](./handoffs/phase-4-w2-native-polaris-personal-profile.md)
- [Phase 4 W2 原生 Workspace Invitations 检查点](./handoffs/phase-4-w2-native-workspace-invitations.md)
- [Phase 4 W2 原生 Organization Workspaces 检查点](./handoffs/phase-4-w2-native-organization-workspaces.md)
- [Phase 4 W2 原生 Organization Roster 检查点](./handoffs/phase-4-w2-native-organization-roster.md)
- [Phase 4 W2 原生 User Permission Group 检查点](./handoffs/phase-4-w2-native-user-permission-group.md)
- [Phase 4 W2 原生 Workspace Host Context 检查点](./handoffs/phase-4-w2-native-workspace-host-context.md)
- [Phase 4 W2 原生 Data Drain Runs 检查点](./handoffs/phase-4-w2-native-data-drain-runs.md)
- [Phase 4 W2 原生 Workspace Execution Metrics 检查点](./handoffs/phase-4-w2-native-workspace-execution-metrics.md)

## 阅读顺序

1. 先读正式 Spec，确认目标行为、范围和验收；
2. 再读目标工程结构，确认具体文件夹；
3. API 实施时使用全量 API inventory；
4. 同步 Sim2 `main` 或迁移 Polaris 能力时使用 Module Alignment Matrix；
5. 发现新耦合、性能证据或行为差异时，先更新审计文档，再更新 Spec/对齐表。
