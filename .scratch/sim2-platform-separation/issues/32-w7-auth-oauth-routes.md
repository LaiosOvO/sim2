# 迁移 W7 Auth、OAuth、CLI 与 Desktop 路由

What to build: 迁移 W7 中 auth 26、cli 2、desktop 1，共 29 条。
Blocked by: 09, 31
Status: ready-for-agent

## What to build

覆盖 Better Auth catch-all、账户、密码、OAuth/OIDC/SSO、socket token、CLI poll 与桌面 handoff。

## Acceptance criteria

- selector 精确为 29 条。
- redirect/state/PKCE/token refresh/revocation/session fixation/CSRF 与 secret 泄漏测试通过。
- Sim2-only 与分叉入口保持可用，客户端不导入 server crypto。
- C/A/D/I/S/E 和 rate-limit/性能测试通过。

## Blocked by

09、31。
