# Phase 4 Handoff：W2 原生 Organization Roster

## 本阶段完成

`API-0235 GET /api/organizations/[id]/roster` 已从固定 legacy origin 切为独立 API 原生
Organizations Module。W2 当前为 native `7/22`、legacy `15/22`。

Sim2 与 Polaris donor route SHA-256 相同，本阶段没有丢失二开差分。

## 新 seam

```text
Next generated facade
  -> versioned organization roster contract
  -> standalone API handler
  -> ListOrganizationRosterUseCase
      -> RequestAccessResolver.organizationRole
      -> OrganizationInvitationHousekeeping
      -> OrganizationRosterReadRepository
          -> Drizzle roster snapshot adapter
```

HTTP interface 只处理 path、session、状态码和 wire envelope。Organizations Module 隐藏：

- 普通 member 与 owner/admin 的不同 projection；
- organization admin 对全部 active workspaces 的派生 admin access；
- 普通 member 的显式 workspace permissions；
- external workspace users 的合并及 earliest permission timestamp；
- pending invitation 和 grants hydration。

管理员读取前仍执行 donor 的 stale invitation update，但副作用已成为显式、best-effort
`OrganizationInvitationHousekeeping` port。失败不影响 GET。后续可将 adapter 替换成周期 job，
不需要再修改 HTTP interface 或 roster projection。

## Tenant isolation hardening

donor 只按 invitation id 读取 grants，脏数据可能关联到其他 organization 或 archived
workspace。新 adapter 同时限定目标 organization 的 active workspace ids。正常 wire 不变，
非法 grant 不再暴露。

## 验证

| Gate | 结果 |
| --- | --- |
| Native / legacy | 7/22 / 15/22 |
| Focused roster tests | 6/6 |
| API full tests | 84 passed；1 skipped |
| W2 focused tests | 72 passed；1 skipped |
| PostgreSQL 16 integration | 1/1 |
| API contract tests | 12/12 |
| Platform contract | 61 schemas |
| Full repository type-check | 43/43 tasks |
| API build | entry 25.73 KiB |
| Organization lazy chunks | roster 3.10 KiB；housekeeping 0.69 KiB |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Target structure | 47 roots / 47 files |
| Target graph | 22 packages / 131 source nodes；0 cycle |
| API validation | 991/991；non-contract 0 |
| Standalone Node API | health 200；unconfigured readiness 503 |

## 下一步

继续迁移高优先级 W2 organization/permission-group read。优先选择能够复用现有 organization
role seam、且不引入 command side effect 的接口；带写事务的 members/invitations routes 保持
在 W3，不能因为 roster 已原生化而提前混入 W2。
