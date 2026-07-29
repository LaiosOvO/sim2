# Phase 4 W2 原生 Workspace Invitations 检查点

> 日期：2026-07-30
> Ticket：10e
> 状态：完成

## 结果

`API-1124 GET /api/workspaces/invitations` 已切换到 Invitations Module 原生 PostgreSQL
读取。W2 当前为 5 条 native、17 条 compatibility：

```text
TenantReadModule
  -> API-0137: invitee pending invitations (token-free)
  -> API-0294: GitHub stars
  -> API-1057: workspace members
  -> API-1060: Polaris personal profile
  -> API-1124: workspace invitation management list
  -> other 17: fixed legacy-origin compatibility backend
```

## 两个邀请读取边界

API-0137 和 API-1124 不能共用一个宽 DTO。前者是当前账号收到的 pending/unexpired
邀请，token 必须从 port 消失；后者是 workspace 管理列表，旧 UI 的 cancel/resend 流程需要
token，并且旧 route 不只返回 pending 状态。本次保留两个窄 repository port 和两个独立
response schema，只共享同一个 Drizzle adapter。

## 租户可见性

Adapter 保留 `listAccessibleWorkspaceRowsForUser` 的旧语义：

- 显式 workspace permissions；
- 当前组织 owner/admin 对 active workspaces 的派生 admin 可见性；
- 显式与派生 workspace 去重；
- archived workspace 即使有遗留 permission 也排除；
- 无任何 workspace access 时不读取全量 invitations，直接返回空数组。

真实 PostgreSQL fixture 证明普通 viewer 只看到显式 workspace 的邀请；组织 admin 可看到
组织内两个 active workspace 的邀请；无权限 inviter 看不到任何邀请；archived workspace
邀请对两者都不可见。

## 验证

| Gate | 结果 |
| --- | --- |
| Native routes | 5/22 |
| Legacy routes | 17/22 |
| API tests | 72 passed；1 skipped |
| W2 focused tests | 60 passed；1 skipped |
| PostgreSQL integration | 1/1 |
| API contract tests | 10/10 |
| Platform contract | 52 schemas |
| API build | entry 23.36 KiB；invitation adapter 4.25 KiB |
| Full repository type-check | 43/43 tasks |
| W2 facade build | 22 entries；最大 1,485 gzip bytes |
| Target structure | 44 roots / 36 files |
| Target graph | 22 packages / 116 source nodes；0 cycle |

## 未包含

同目录 `POST /api/workspaces/invitations/batch` 是 W3 command，不属于本次只读迁移。邮件、
审计、billing、seat reconciliation 和 transaction/locking 必须在后续 command Ticket
单独迁移，不能把旧 `invitations/core` 巨型闭包导入独立 API read path。
