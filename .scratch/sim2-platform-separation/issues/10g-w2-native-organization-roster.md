# Ticket 10g：W2 原生 Organization Roster

## 范围

- Inventory：`API-0235`
- 方法：`GET`
- 路径：`/api/organizations/[id]/roster`
- Donor：
  - `D:\workspace\workflow\sim2\apps\sim\app\api\organizations\[id]\roster\route.ts`
  - `D:\polaris\apps\sim\app\api\organizations\[id]\roster\route.ts`
- 目标：
  - `packages/api-contracts/src/organizations.ts`
  - `apps/api/src/modules/organizations/**`
  - `apps/api/src/infrastructure/postgres/repositories/**`

Sim2 与 Polaris donor 文件 SHA-256 都是
`B42498CA8C44A4C658946F8BD84C5FB74948A9B8D169D3DB5B4C3A73C556DE7E`，当前没有
二开差分。

## 已确认兼容语义

1. 只接受 session；无 session 返回 `401 { error: "Unauthorized" }`。
2. path id 为空或无法解码返回 `400 { error: "Invalid route parameters" }`。
3. caller 必须是目标 organization 的 member；否则返回
   `403 { error: "Forbidden - Not a member of this organization" }`。
4. 普通 member 能看到全部 organization members 的姓名、邮箱、头像、角色和加入时间，但：
   - 每个 member 的 `workspaces` 固定为空；
   - `pendingInvitations` 固定为空；
   - 顶层 `workspaces` 固定为空。
5. owner/admin 能看到管理 projection：
   - active organization workspaces；
   - owner/admin 对全部 active workspaces 派生 `admin`；
   - 普通 member 只显示显式 workspace permissions；
   - 没有 organization membership、但拥有 active organization workspace permission 的用户
     合并为 `external`，`createdAt` 取其最早 permission 时间；
   - pending organization invitations 与 invitation workspace grants。
6. `membershipIntent === "external"` 时 invitation 的展示 role 强制为 `external`。
7. 未知 workspace name 的兼容 fallback 是 `"Workspace"`。
8. donor 没有稳定排序；本阶段不伪造新的排序契约。
9. 未处理异常返回
   `500 { error: "Failed to fetch organization roster" }`，不附加 request ID。

## 已确认的混合职责问题

旧 route 在一个约 280 行 HTTP handler 中同时承担：

- session 与 organization membership；
- role-based projection；
- 六组 PostgreSQL read；
- organization admin 的 workspace 权限派生；
- external user 合并；
- invitation/grant hydration；
- GET 请求中的 stale invitation update。

这会让 Next route 直接导入 Drizzle、Auth、platform-authz 与 Invitations Core，并扩大浏览器开发
编译图。一处 roster 展示改动也需要理解数据库、权限和邀请生命周期的全部实现。

## 目标 seam

按 deep module 原则，外部 interface 保持为一个
`ListOrganizationRosterUseCase.execute(context, organizationId)`。复杂度藏在 Organizations
Module 内部：

1. HTTP interface：只做 path/session/error/wire protocol。
2. Application：只做 caller role、member/admin projection 和 DTO 白名单映射。
3. `OrganizationRosterReadRepository` port：以 member/admin 两种 snapshot 隐藏批量查询。
4. `OrganizationInvitationHousekeeping` port：显式表达旧 GET 的 best-effort 写副作用。
5. Drizzle adapters：实现批量 read 和 stale invitation update；不被 Next facade import。

Housekeeping 必须在 admin snapshot 读取前完成，失败不能令 GET 失败。这是兼容期 seam，不是最终
理想状态。后续可把 update 移到定时 job，同时让 read query 按 `expiresAt > now` 防御性过滤；
在完成旧状态依赖审计前不直接删除状态更新。

## 数据隔离决定

donor 的 invitation grants 查询只按 invitation id，理论上会把错误关联到其他 organization
workspace 的 grant 显示为 `"Workspace"`。目标 adapter 会将 grant 限定在本 organization 的
active workspace ids；这是显式 tenant-isolation hardening。正常数据 wire 不变，跨 organization
或 archived 的脏 grant 不再暴露。

## 测试清单

- session auth、invalid path、non-member 403；
- member redacted projection 与 admin-only dependency short circuit；
- admin/owner workspace 派生、普通 member 显式权限；
- external user 合并及 earliest permission timestamp；
- pending invitation hydration 与 external intent role；
- housekeeping best-effort failure；
- generic 500 compatibility；
- full W2 routed backend；
- disposable PostgreSQL：active/archive/cross-tenant scope、stale expiration、grant scope；
- contract generation、facade isolation、target graph、API build、全仓 type-check。

## 验证结果

| Gate | 结果 |
| --- | --- |
| Native backend | 7/22 |
| Legacy compatibility | 15/22 |
| Focused roster tests | 6/6 |
| API full tests | 84 passed；1 disposable DB test 默认跳过 |
| W2 focused tests | 72 passed；1 disposable DB test 默认跳过 |
| Real PostgreSQL 16 | 1/1；stale/archive/cross-organization scope |
| API contract tests | 12/12 |
| Platform contract | 61 schemas |
| Full repository type-check | 43/43 tasks |
| API build | entry 25.73 KiB；roster adapter 3.10 KiB；housekeeping 0.69 KiB |
| Next facade isolation | 22 entries；最大 1,485 gzip bytes |
| Target structure | 47 roots / 47 required files |
| Target cycles | 22 packages / 131 source nodes；0 cycle |

## 后续

兼容期仍同步执行 housekeeping。迁移 W3 invitation commands 和定时任务时，应审计所有依赖
`invitation.status` 的 seat/billing/read path，再把 stale expiration 改为周期 job，并让所有
read path 以 `status = pending AND expiresAt > now` 防御性过滤。不得直接删除状态更新。
