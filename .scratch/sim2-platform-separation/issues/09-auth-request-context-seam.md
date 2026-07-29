# 抽离认证、授权与请求上下文 seam

What to build: 为后续所有迁移接口提供独立 API 可复用的 session/API-key/tenant/authz 验证层。
Blocked by: 04, 07
Status: completed

## What to build

保留现有 Better Auth 数据与 secret 兼容，抽出身份验证、workspace/workflow 权限与审计上下文，避免 auth 导入 workflow lifecycle/executor/registry。

## Acceptance criteria

- auth verifier 的依赖闭包不含 webhooks、MCP、Executor、Runtime Registry 与 UI。
- session、API key、public token、internal/hybrid 四类 request context 有契约和拒绝默认值。
- 认证先于 body validation；跨 workspace/组织访问、撤销、过期与缺失凭证有测试。
- Next 兼容门面与独立 API 对同一凭证返回一致身份/错误。

## Blocked by

04、07。

## Implementation design log

- `@sim/auth/request-context` 是唯一凭证分类与降级防护入口；路由必须显式声明
  `session/api-key/public-token/internal/hybrid` policy，Hybrid 没有默认 allow-list。
- 同一请求出现多种凭证时返回 `ambiguous_credentials`，显式 API key/internal token 验证
  失败后不会回退到 session。
- 四种 context 只包含已验证后的 actor、credential ID、tenant/resource scope 与 audit
  request ID；Cookie、API key、public token、JWT 明文不会进入 context 或日志。
- Better Auth、Drizzle API key/public share、internal JWT 都是 API infrastructure adapter；
  request-context/authorization core 不读取环境变量、不 import DB、Next、Executor、Registry。
- public token 的授权只允许它绑定的精确 `resourceType/resourceId` 读取，不授予
  workspace/organization 级权限。
- public-token-only 路由忽略浏览器 ambient session Cookie，确保登录用户仍能打开公链；
  Token 失败时不会回退到该 session。
- internal/hybrid policy 必须声明接受 `user/service/either` 哪类 actor；Hybrid 允许
  internal 却未声明 actor 类型时 fail-closed。
- environment W1 已切到统一 session policy，并在读取 JSON body 前认证；Next facade
  只透传 Cookie/Header，与独立 API 使用相同 request-context core。

## Implementation evidence

- Platform Contract 从 29 增至 36 个 schema，覆盖四种 context、统一 error/result；
- Auth tests 16/16、API tests 12/12、API Contract tests 5/5；
- 定向测试覆盖 missing、expired、revoked、invalid、ambiguous、disallowed、跨
  workspace/organization、missing workflow、public resource exact-scope；
- Next W1 proxy 定向测试 5/5，valid/revoked session 的 identity/error 与直接 API 一致；
- authentication core 独立构建 65,660 gzip bytes，Executor/Registry/MCP/Sandbox/UI/
  Feishu marker 为 0；
- API split build startup entry 18.89 KiB；生产认证 composition 保持配置后动态加载；
- W1 Node 冷启动 2,772.04 ms、222.1 MiB RSS，仍低于 5 秒/384 MiB 门槛；
- 目标结构为 20 个 required files，cycle gate 覆盖 22 个 package、90 个 source nodes。
