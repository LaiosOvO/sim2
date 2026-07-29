# 迁移 W3 Organization 与成员命令接口

What to build: 迁移 W3 中 organizations/users/invitations/pinned-items/audit-logs 的 36 条接口。
Blocked by: 10
Status: ready-for-agent

## What to build

按身份与组织 application service 迁移写路径，保留现有邀请、权限与审计语义。

## Acceptance criteria

- selector 精确命中 22 + 7 + 4 + 2 + 1 = 36 条。
- 邀请重复投递、权限提升、跨组织访问、成员移除与审计一致性测试通过。
- 所有接口有共享 contract、facade 和可回滚 route flag。
- coverage report 与清单指定测试通过。

## Blocked by

10。
