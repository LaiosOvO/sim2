# W2 原生化：Workspace Fork Availability（API-1031）

## 阶段目标

- 将 `GET /api/workspaces/[id]/fork/availability` 从
  `legacy-origin-compatibility` 迁到独立 TypeScript API。
- 本阶段不复制旧 `workspace-forking/authz.ts`；建立后续
  API-1009、API-1032、API-1034、API-1037 可复用的 Forking 深模块边界。
- 浏览器只接收 `{ available: boolean }` 合同，不接触数据库、Billing、
  AppConfig AWS SDK、Executor、Sandbox、工具注册表或 Fork 实现。

## 已核对的旧行为

1. 路由仅接受 session；未登录返回 `401 {"error":"Unauthorized"}`。
2. 旧路由先读取 active workspace，再调用统一 workspace permission resolver。
   donor 的 `checkWorkspaceAccess` 即使无权限也会携带 workspace，但本路由只判断
   `exists/workspace`，没有判断 `hasAccess`。因此旧接口实际上会向知道 workspace id
   的任意登录用户返回一个布尔 gate verdict；本阶段必须通过 differential test
   明确冻结或修正该问题，不能无意改变。
3. availability 是非抛错查询：部署关闭、个人 workspace、非 Enterprise、
   AppConfig 未命中和 AppConfig/数据库异常全部折叠成 `{available:false}`。
4. Gate 顺序：
   - Billing 关闭时要求 `FORKING_ENABLED`，同时保留
     `ENTERPRISE_ENABLED -> forking legacy default(false)` 的三态解析。
   - Billing 开启时忽略 deployment forking flag，以组织 Enterprise entitlement
     为准；个人 workspace 固定不可用。
   - 仅 hosted 且同时配置 `APPCONFIG_APPLICATION` /
     `APPCONFIG_ENVIRONMENT` 时再应用 `workspace-forking` rollout。
5. Enterprise entitlement 兼容旧语义：
   - billing off 直接允许；
   - `ACCESS_CONTROL_ENABLED && !hosted` 允许；
   - 组织 owner 被 billing block 时拒绝；
   - 仅 active Enterprise subscription 允许；
   - 查询异常 fail closed。
6. AppConfig gate 是 OR 规则：global、user allowlist、org allowlist、
   platform admin 任一命中即可；admin 数据库读取必须惰性发生。
7. AppConfig profile 冷启动只阻塞一次，之后 stale-while-revalidate；轮询或
   JSON 解析失败保留 last-good，首次失败回退 `FORKING_ENABLED`。

## 新边界

```text
HTTP handler
  -> Fork Availability use case
      -> RequestAccessResolver（只解析 workspace permission）
      -> WorkspaceForkContextReader（只读 active workspace 的 organizationId）
      -> ForkEntitlementReader（只读组织订阅/owner billing block）
      -> ForkRolloutReader（只求值 workspace-forking）
          -> AppConfigProfileReader（AWS 数据面，后端 Infra）
          -> PlatformAdminReader（仅 adminEnabled 且前置规则未命中时读取）
```

- Forking Module 拥有业务顺序和 fail-closed 决策。
- PostgreSQL adapter 只实现窄端口，不暴露 Drizzle row。
- AppConfig 作为 `extensions/infra/appconfig` 独立后端包；不创建全平台 feature
  registry，只提供 profile cache、规则解析和匹配原语。
- `workspace-forking` 名称及 fallback 归 Forking Module 所有。
- AWS SDK 只在 AppConfig profile 真正读取时动态加载，API 未配置 AppConfig 时
  不初始化 AWS client。

## 待确认并在测试中冻结

- API-1031 donor 未检查 `hasAccess`。为兼容迁移，优先保持“任意 session + active
  workspace id 可查询布尔值”的响应，不泄露错误原因或任何 workspace metadata；
  后续若要收紧应作为独立安全变更，而不是混入迁移。
- target 当前只有 PostgreSQL infrastructure；新增 AppConfig 包必须保持
  `sideEffects:false`，且不能被 web 工程依赖。

## 验证清单

- 合同：params/response。
- 单元：部署 flag、billing personal/org、Enterprise、rollout、
  AppConfig fallback、admin 惰性求值、所有错误 fail closed。
- API：401、active/missing/archived、无 workspace permission 的 donor 兼容行为、
  API-1031 native routing。
- PostgreSQL：workspace context、owner billing block、subscription、
  platform admin。
- 边界：Forking Module 禁止 Next、legacy alias、Billing Core、
  Executor、Sandbox、registry 和 AWS SDK 直连。
- 全量：contracts、API、W2、real PostgreSQL、type-check、build、
  structure/graph/facade/route inventory。

## 进度日志

- 2026-07-30：完成 donor route、authz、env gate、AppConfig rule/cache 和目标
  Infra 包布局审计；开始冻结合同与端口。
- 2026-07-30：完成 API-1031 native 切流。实现刻意删除 donor 无效的 permission read，
  但保持任意 session 对 active workspace 只读取布尔值的 observable compatibility。
- 2026-07-30：`extensions/infra/appconfig` 落地为 server-only 深模块；没有迁移旧
  `FEATURE_FLAGS` 注册表，Forking composition 单独拥有 `workspace-forking`。
- 2026-07-30：专项 12/12、API full 124 passed（1 skipped）、W2 112 passed
  （1 skipped）、Contract 16/16、真实 PostgreSQL 1/1、全仓 TypeScript 44/44。
- 2026-07-30：API build 1,141 modules、entry 33.77 KiB；AWS SDK 为约 0.95 MiB
  server lazy chunk。22 个 Next facade 最大仍为 1,485 gzip bytes；browser closure 中
  Infra Extensions 与 API/Worker client roots 均为 0。
- 2026-07-30：目标结构 57 roots/85 required files，目标图 23 packages/167 source
  nodes、0 cycle；Forking boundary 为 6 module files/4 adapters/1 AppConfig Infra/
  1 contract，0 violation。
