# Phase 3 认证与请求上下文 seam 检查点

> 日期：2026-07-30
> Ticket：09
> 状态：实现完成，等待提交

## 结果

独立 API 现在有一个统一的认证深模块。路由只声明凭证 policy，认证模块隐藏凭证优先级、
Better Auth、API key hash 查询、public share token、internal JWT 和租户授权。

```text
HTTP request
  -> explicit route authentication policy
  -> credential ambiguity / downgrade guard
  -> verifier port
     -> Better Auth session adapter
     -> Drizzle API key adapter
     -> Drizzle public token adapter
     -> internal JWT adapter
  -> redacted AuthenticatedRequestContext
  -> workspace / organization / workflow / exact-resource authorization
  -> route application logic
```

## 契约与 fail-closed 规则

`@sim/api-contracts/auth` 定义：

- SessionRequestContext；
- ApiKeyRequestContext；
- PublicTokenRequestContext；
- InternalRequestContext；
- AuthenticatedRequestContext union；
- AuthenticationError 与 RequestAuthenticationResult。

所有 context 都包含 `authContextVersion = 1`、request ID、已验证 actor 和最小权限信息。
任何原始 Cookie、API key、public token 或 JWT 都不会写入 context。

安全默认值：

- 路由必须传 policy，不存在“未声明即允许”；
- Hybrid 必须传非空 allow-list；
- 同时出现两种凭证直接拒绝；
- public-token-only 路由忽略浏览器随请求附带的 ambient session Cookie，但绝不回退该
  session；
- 显式 API key/internal token 失败后不回退 session；
- 未配置 verifier 返回 503，不伪装成匿名用户；
- public token 只允许读取它绑定的精确资源，不允许读取同 workspace/org 的其他资源；
- workspace key 跨 workspace 直接拒绝，之后仍校验 key actor 的有效权限；
- internal service 必须有匹配的显式 scope。
- internal/hybrid 路由必须声明接受 `user`、`service` 或 `either` actor；Hybrid 允许
  internal 却未声明 actor class 时 fail-closed。

## 兼容现有数据

- Session adapter 继续使用相同 Better Auth secret、base URL、Drizzle schema 和 session 表；
- API key adapter 继续使用 `sha256` 的 `key_hash` 索引，保留 personal/workspace key 语义，
  检查到期时间、用户 ban 和 workspace scope；
- public token adapter 继续读取 `public_share.token/is_active`，并拒绝 archived workspace；
- internal JWT 继续校验 HS256、issuer `sim-internal`、audience `sim-api` 和 `type=internal`；
  secret fallback 只在 API composition root 读取，不进入 auth core。

旧 internal JWT 没有 scope claim 时仍能完成身份验证，但不能通过租户资源授权。W6/W7
切流前必须让 token minting 写入最小 scope，或在具体兼容路由显式实现有时限的映射；不能
给旧 token 默认补 `platform:*`。

Better Auth 已删除或到期的 session 对外统一表现为无效凭证，避免泄露凭证生命周期状态；
API key 的 expired/banned 状态在内部 verifier 中区分，但 wire message 仍保持通用。

## W1 集成

`/api/environment` 已从私有 `EnvironmentSessionResolver` 改为统一
`RequestAuthenticator` session policy。认证在 `request.json()` 之前执行，审计事件获得：

- authentication method；
- authentication request ID；
- 已验证 actor。

Next route 仍是小型代理，只转发 Cookie/Header/Body。定向 parity 测试让同一 valid 或
revoked session 分别走直接 verifier 与 Next facade，返回的 identity/error 完全一致。
Next 不初始化 Better Auth、Drizzle 或授权 resolver。

## 边界与体积

专用门禁同时检查 `packages/auth/src` 和 API authentication/authorization middleware 的
import：

- 禁止 Next、React、Executor、execution contracts、Tool Catalog、Runtime Secrets；
- 禁止 Webhook、MCP、Registry、Sandbox、UI、Feishu SDK；
- request-context core 单独 Node build 的上限为 256 KiB gzip。

当前 core 为 65,660 gzip bytes，forbidden marker 为 0。API production adapters 保持在
配置完整后的动态 chunk，startup entry 为 18.89 KiB。

## 验证证据

| Gate | 结果 |
| --- | --- |
| Auth tests | 16/16 |
| API tests | 12/12 |
| API Contract tests | 5/5 |
| Next W1 proxy tests | 5/5 |
| Auth/API/contract type-check | 通过 |
| API split build entry | 18.89 KiB |
| Auth core isolated build | 65,660 gzip bytes |
| Auth forbidden closure markers | 0 |
| W1 Node cold start | 2,772.04 ms / 222.1 MiB RSS |
| Contract generation | 36 schemas，clean |
| Target cycles | 22 packages / 90 source nodes，0 cycle |

## 后续 API 波次的使用规则

1. 每条 route 在解析 body 前调用统一 authenticator；
2. session-only、api-key-only、public-token-only、internal-only 优先使用显式 policy；
3. 只有确实兼容多种调用方的 route 才能使用 hybrid，并列出 allow-list；
4. 资源访问继续调用 `authorizeRequestContext`，不在 route 内手写 workspace 比较；
5. application 层只接收 redacted context，禁止重新读取 Cookie/token；
6. 新 auth 行为先扩展 contract/test，再扩展 adapter。

OAuth callback、SSO 注册、session 创建/吊销的 HTTP 路由仍属于 W7；Ticket 09 只建立后续
迁移统一消费的验证与授权 seam，不宣称完整 Auth 路由已迁移。
