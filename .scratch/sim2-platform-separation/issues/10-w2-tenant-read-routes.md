# 迁移 W2 租户与成员只读接口

What to build: 迁移 W2 中 workspace/organization/user/access 相关的 22 条低风险只读接口。
Blocked by: 09
Status: compatibility-plane-complete / native-read-model-in-progress

## 精确范围

规范选择器是 `Wave = W2`，且顶级领域属于：

- `workspaces`
- `organizations`
- `users`
- `invitations`
- `permission-groups`
- `workspace-events`
- `stars`

选择结果必须始终为 22 条。规范 ID、方法、路径、鉴权模式和 C/A/D/I 证据记录在：

- `packages/api-contracts/src/w2-tenant-read.ts`
- `docs/testing/api-w2-tenant-read-coverage.json`

## 已完成：兼容读取平面

- 22 条 Next route 已生成成 7 行兼容 facade，不再导入数据库、Better Auth、业务
  repository、Executor 或 Registry；
- 独立 API 拥有路由选择、request ID、统一认证 policy、错误映射和观测标签；
- API 通过 `TenantReadCompatibilityBackend` port 调用固定的旧服务 origin；
- Cookie、API key、Authorization、query、状态码、响应体和旧响应头保持透传；
- `SIM_API_W2_TENANT_READ_MODE=api|legacy|off` 支持逐平面切流和关闭；
- API transport 失败时可用 `SIM_API_PROXY_FALLBACK_LEGACY=true` 回滚到固定旧服务；
- API 和旧服务 origin 都拒绝同 origin 递归代理；
- Polaris-only `API-1060 /api/workspaces/[id]/personal-profile` 已进入相同契约和 facade。

鉴权分类：

- `session`：17 条；
- `hybrid-all`：`API-0885`；
- `session-internal`：`API-0887`；
- `public`：`API-0294`；
- `legacy-cron`：`API-1006`。

`public` 和 `legacy-cron` 当前继续由旧实现验证公开/CRON 语义；其他路由先经过
Ticket 09 的统一 request authenticator，再进入旧服务。旧服务仍会进行原有第二次
认证和租户授权。

## 尚未完成：原生读模型

兼容读取平面解决 Next 编译边界，但不是 22 条接口的最终后端实现。当前 backend 状态为
11 条 native（API-0137 invitee invitations、API-0209 data drain runs、
API-0235 organization roster、
API-0241 organization workspaces、API-0243 user permission group、API-0294 stars、
API-1041 workspace host context、API-1057 workspace members、API-1058 workspace execution
metrics、API-1060 Polaris personal profile、API-1124 workspace invitation management）和 11 条
legacy-origin-compatibility。完成本 Ticket 仍需：

1. 按领域建立 organization/workspace/user read repository ports；
2. 在独立 API 内实现 tenant authorization，不再依赖旧服务二次验证；
3. 将 roster、fork diff、execution metrics、inbox tasks 等查询逐条替换为原生 adapter；
4. 为 pagination/filter、not-found、跨 workspace/org 拒绝建立真实 DB integration fixtures；
5. 每替换一条，用同一 fixture 对旧服务和原生实现做状态码、header、body 差分；
6. 22/22 都变为 `native` backend 后，才允许删除固定旧服务依赖和旧实现回滚入口。

## 当前验收证据

| Gate | 结果 |
| --- | --- |
| Inventory/coverage | 22/22，C/A/D/I 无遗漏、无重复 |
| W2 API tests | 100 passed、1 disposable PostgreSQL test 默认跳过 |
| W2 Next proxy tests | 25/25 |
| API Contract tests | 16/16 |
| Full repository type-check | 43/43 tasks |
| Next facade isolated build | 22 entries；最大 1,485 gzip bytes |
| Next facade forbidden marker | 0 |
| Platform Contract | 80 schemas；生成产物 clean |
| API validation audit | 991/991 contract-backed；non-contract 0 |
| Identity boundary | 3 boundaries / 9 files；0 provider/DB 反向依赖 |
| Data Drains boundary | 5 module files / 2 adapters / 1 contract；0 violation |
| Workspaces boundary | 10 module files / 3 adapters / 1 contract；0 violation |
| Target structure | 53 roots / 70 required files |
| Target cycles | 22 packages / 154 source nodes；0 cycle |

旧 route 同目录的 8 个测试随实现移出 Next 一并删除；覆盖职责已迁到独立 API 的
22 路差分/鉴权/集成测试和 HTTP legacy adapter 测试。原生 adapter 替换时必须补回
真实 repository 行为测试，不能把当前 fake backend 差分测试当成最终数据层证据。

`API-0137` 已补真实 disposable PostgreSQL 16 fixture，覆盖 invitee email normalization、
pending/unexpired filter、batched grant hydration 和 token 不泄露。

`API-1057` 复用统一 workspace authorization seam，并用相同 disposable PostgreSQL fixture
验证显式权限、组织管理员继承、跨租户/归档拒绝，以及“派生权限不自动加入轻量成员列表”。

`API-1060` 将 Polaris personal profile 迁入 provider-neutral Identity Biz/API Module，并
通过目标 `0275` migration 建立 `external_identity` read model。真实 fixture 验证 migration、
多 provider 排序、identifier 白名单和 `rawProfile` 不泄露；Biz 不含 Feishu/DB 依赖。

`API-1124` 复用 Invitations Module，但将 invitee token-free port 与 workspace management
token-bearing port 分开。真实 fixture 验证显式 workspace 权限、组织 owner/admin 派生权限、
无权限空结果和 archived workspace 排除。

`API-0241` 建立 Organizations Module、organization admin authorization 和窄 enterprise
entitlement port。真实 fixture 覆盖 active enterprise、owner billing-block、self-host flag
和 billing-disabled 分支，并保留旧 route 包含 archived workspace 的行为。

`API-0235` 将 organization roster 的 member/admin projection 收进 Organizations Module，
把过期邀请更新隔离为显式 best-effort housekeeping port，并用一个 admin snapshot interface
隐藏 members/workspaces/permissions/invitations/grants 的批量读取。真实 fixture 验证归档
workspace 排除、stale invitation 状态更新以及跨 organization grant 不泄露。

`API-0243` 将 user permission-group config 收进独立 Permission Groups Module。旧 route
为读取 metadata/config 直接进入 EE `permission-check`，继而可达 Executor、Block、Provider
与运行时环境逻辑；新 contract normalizer 是纯数据函数，application 只消费 workspace access、
organization entitlement 与 winner read port。真实 fixture 验证 explicit member group >
empty/all-members group > default group 的优先级、oldest tie-break 与 owning organization
scope，不再 import 旧 EE permission-check。

`API-1041` 将 workspace host identity、viewer effective permission 与 owner billing
projection 收进 Workspaces Module。单一 snapshot port 隐藏 active workspace、owning
organization membership、payer subscription 和 billing block 读取；application 保留
organization/personal payer、enterprise > team > pro、paid status/block 与 billing interval
规则。真实 fixture 验证 organization newest subscription、personal plan priority、owner/
personal block source 与 archived concealment，且不 import React cache 或旧 Billing Core。
专用 boundary gate 固定 7 个 Workspaces Module 文件、1 个 adapter 和 1 个纯 contract 的
允许依赖。

`API-0209` 将 Data Drain run history 收进独立 Data Drains Module。Application 固定
membership -> deployment/enterprise -> owner/admin -> validation -> organization-scoped drain
-> bounded runs 顺序，两个 PostgreSQL adapters 分别隐藏 entitlement 与 run persistence。
专用 boundary gate 禁止 Next/Auth、legacy Billing/Data Drain helper、destination registry、
Executor 与 Sandbox 回流；真实 fixture 验证 newest-first、limit、跨 organization concealment
与 owner billing-block。API-1011/API-1122 暂不复制旧 `checkAttributedUsageLimits`，必须先
建立 billing attribution/ledger/limit-policy read-model foundation。

`API-1058` 将 253 行 workspace execution metrics route 收进 Workspaces Module。
Application 拥有 query normalization、all-time bounds、bucket、success/avg/percentile
projection；三方法 read port 隐藏 workspace-scoped workflow、filtered bounds 与 sample
查询。真实 fixture 验证 folder/workflow/trigger/level/pending filter、跨 workspace scope、
空 filter 以及 aggregate timestamp UTC 解码；Workspaces boundary 扩展为覆盖全部 3 个
PostgreSQL adapters。

其余 11 条仍必须补相应的数据库/Provider integration gate。

## Acceptance criteria

- [x] 筛选结果精确为 22 条，coverage report 无遗漏、重复；
- [x] 每条有共享 contract、独立 API compatibility handler、Next facade 和观测标签；
- [x] 清单要求的 C/A/D/I 有机器可追踪结果；
- [x] Next route 编译闭包不含 DB/Auth runtime/Executor/Registry；
- [ ] 每条拥有独立 API 原生 read handler/repository adapter；
- [ ] tenant isolation、pagination/filter、not-found/error 通过真实数据层差分；
- [ ] 22 条全部取消对 `SIM_LEGACY_API_BASE_URL` 的运行时依赖。
