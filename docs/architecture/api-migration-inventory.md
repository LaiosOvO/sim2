# Sim2 目标平台 API 全量兼容与 Polaris 迁移清单

> 状态：机器盘点基线，持续人工校正
> 生成日期：2026-07-30
> 目标：以 Sim2 为目标平台，覆盖 Sim2 与 Polaris 合并后的全部 Route，不遗漏任何兼容路径
> Route 总数：1126；HTTP handler 方法总数：1377

## 1. 口径

- Sim2：990 个 Route，1202 个 handler。
- Polaris：1110 个 Route，1359 个 handler。
- 唯一路径：1126 个 Route，覆盖共有同实现、共有已分叉、Sim2 独有、Polaris 独有。
- `S` 表示 Sim2，`P` 表示 Polaris。
- “当前测试”仅表示 Route 同目录存在直接 `route.test.ts`/`route.spec.ts`；跨目录测试将在人工校正阶段补录。
- Target、Wave、Risk、Auth 是第一版迁移分类，不替代逐领域人工审阅。

## 2. 来源状态

| 状态 | Route 数 |
| --- | ---: |
| 共有同实现 | 887 |
| 仅 Polaris | 136 |
| 共有已分叉 | 87 |
| 仅 Sim2 | 16 |

## 3. 迁移波次

| 波次 | Route 数 | 目标 |
| --- | ---: | --- |
| W1 | 3 | 健康检查、运行环境与新 API 骨架 |
| W2 | 95 | 只读查询和低风险接口 |
| W3 | 263 | Core CRUD、文件与数据接口 |
| W4 | 555 | Integration Tool Adapter 全量生成式迁移 |
| W5 | 29 | Workflow authoring、部署与定义管理 |
| W6 | 11 | Executor、Job、Sandbox、暂停/恢复/取消 |
| W7 | 61 | Auth、OAuth、Webhook、Cron 与公网边缘入口 |
| W8 | 109 | Polaris PM、HR、Approval、Identity 等业务域 |

每个波次执行统一顺序：冻结契约 → 建立新 Module/Adapter → 双实现差异测试 → 灰度路由 → 观察 → 切流 → 删除旧实现。

## 4. 测试代码

| 代码 | 含义 |
| --- | --- |
| C | Wire contract 与状态码测试 |
| A | 鉴权、授权、租户隔离测试 |
| D | 旧/新实现差异测试 |
| I | 数据库、缓存、对象存储或 Provider 集成测试 |
| E | 关键用户流程 E2E |
| P | 延迟、吞吐、冷启动、内存或流式性能测试 |
| S | 签名、重放、SSRF、注入、密钥泄露等安全测试 |
| R | 幂等、重试、取消、恢复与重复投递测试 |
| B | 二进制、Range、Content-Type、文件大小和流式回压测试 |

## 5. 领域汇总

| 领域 | Route 数 |
| --- | ---: |
| tools | 555 |
| workspaces | 120 |
| v1 | 82 |
| organizations | 41 |
| auth | 26 |
| table | 25 |
| workflows | 25 |
| polaris | 24 |
| copilot | 23 |
| knowledge | 19 |
| mcp | 19 |
| files | 16 |
| mothership | 13 |
| cron | 11 |
| providers | 10 |
| webhooks | 10 |
| approvals | 9 |
| users | 9 |
| logs | 8 |
| billing | 6 |
| chat | 6 |
| credentials | 5 |
| folders | 5 |
| invitations | 5 |
| settings | 4 |
| custom-blocks | 3 |
| desktop | 3 |
| resume | 3 |
| schedules | 3 |
| audit-logs | 2 |
| cli | 2 |
| guardrails | 2 |
| help | 2 |
| hr | 2 |
| memory | 2 |
| pinned-items | 2 |
| skills | 2 |
| admin | 1 |
| blocks | 1 |
| contact | 1 |
| demo-requests | 1 |
| emails | 1 |
| environment | 1 |
| function | 1 |
| health | 1 |
| integrations | 1 |
| jobs | 1 |
| link-preview | 1 |
| mat | 1 |
| permission-groups | 1 |
| proxy | 1 |
| speech | 1 |
| stars | 1 |
| status | 1 |
| superuser | 1 |
| telemetry | 1 |
| usage | 1 |
| wand | 1 |
| workspace-events | 1 |

## 6. 逐路由清单

### admin

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0001 | DELETE,GET,POST | `/api/admin/mothership` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |

### approvals

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0002 | POST | `/api/approvals/[approvalId]/decisions` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P✓ | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-0003 | POST | `/api/approvals/[approvalId]/resume` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-0004 | GET | `/api/approvals/audit-logs` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-0005 | POST | `/api/approvals/definitions/[definitionId]/versions/[versionId]/publish` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-0006 | POST | `/api/approvals/definitions/[definitionId]/versions` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-0007 | GET,POST | `/api/approvals/definitions` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0008 | GET,POST | `/api/approvals/public/[token]` | 仅 Polaris | Public Callback/Token Edge | Session/Middleware | S–/P✓ | S–/P– | Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0009 | GET | `/api/approvals` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-0010 | POST | `/api/approvals/start` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |

### audit-logs

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0011 | GET | `/api/audit-logs/export` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API File Module | W3 | High | CADISB |
| API-0012 | GET | `/api/audit-logs` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |

### auth

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0013 | GET,POST | `/api/auth/[...all]` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S–/P– | S✓/P✓ | Auth | API Auth | W7 | Critical | CADISE |
| API-0014 | GET | `/api/auth/accounts` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Auth | W7 | Critical | CADISE |
| API-0015 | POST | `/api/auth/forget-password` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Auth | W7 | Critical | CADISE |
| API-0016 | GET | `/api/auth/instagram/authorize` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Auth | W7 | Critical | CADISE |
| API-0017 | GET | `/api/auth/oauth/connections` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Auth | W7 | Critical | CADISE |
| API-0018 | GET | `/api/auth/oauth/credentials` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Auth | W7 | Critical | CADISE |
| API-0019 | POST | `/api/auth/oauth/disconnect` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Auth | W7 | Critical | CADISE |
| API-0020 | GET | `/api/auth/oauth/microsoft/file` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Auth | W7 | Critical | CADISE |
| API-0021 | GET | `/api/auth/oauth/microsoft/files` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Auth | W7 | Critical | CADISE |
| API-0022 | GET,POST | `/api/auth/oauth/token` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Auth | W7 | Critical | CADISE |
| API-0023 | GET | `/api/auth/oauth/wealthbox/item` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Auth | W7 | Critical | CADISE |
| API-0024 | GET | `/api/auth/oauth/wealthbox/items` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Auth | W7 | Critical | CADISE |
| API-0025 | GET | `/api/auth/oauth2/authorize` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Auth | W7 | Critical | CADISE |
| API-0026 | GET | `/api/auth/oauth2/callback/instagram` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0027 | GET | `/api/auth/oauth2/callback/shopify` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Edge Ingress | W7 | Critical | CADISR |
| API-0028 | GET | `/api/auth/oauth2/shopify/store` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Runtime | API Auth | W7 | Critical | CADISE |
| API-0029 | GET | `/api/auth/providers` | 共有同实现 | Auth/OAuth Edge | Manual review | S✓/P✓ | S–/P– | Pure/other | API Auth | W7 | Critical | CADISE |
| API-0030 | POST | `/api/auth/reset-password` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Auth | W7 | Critical | CADISE |
| API-0031 | GET | `/api/auth/shopify/authorize` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Auth | W7 | Critical | CADISE |
| API-0032 | POST | `/api/auth/socket-token` | 共有已分叉 | Auth/OAuth Edge | Session/Middleware | S–/P– | S–/P– | Auth | API Auth | W7 | Critical | CADISE |
| API-0033 | GET | `/api/auth/sso/providers` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Security | API Auth | W7 | Critical | CADISE |
| API-0034 | POST | `/api/auth/sso/register` | 共有已分叉 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Security | API Auth | W7 | Critical | CADISE |
| API-0035 | GET | `/api/auth/trello/authorize` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Auth | W7 | Critical | CADISE |
| API-0036 | GET | `/api/auth/trello/callback` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S–/P– | Pure/other | API Edge Ingress | W7 | Critical | CADISR |
| API-0037 | POST | `/api/auth/trello/store` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Auth | W7 | Critical | CADISE |
| API-0038 | GET,POST | `/api/auth/webhook/stripe` | 共有同实现 | Auth/OAuth Edge | Session/Middleware | S–/P– | S–/P– | Auth | API Auth | W7 | Critical | CADISE |

### billing

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0039 | GET,POST | `/api/billing/credits` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | High | CADI |
| API-0040 | GET | `/api/billing/invoices` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, External SDK | API Core Module | W2 | High | CADI |
| API-0041 | POST | `/api/billing/portal` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | High | CADI |
| API-0042 | GET | `/api/billing` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W2 | High | CADI |
| API-0043 | POST | `/api/billing/switch-plan` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | High | CADI |
| API-0044 | POST | `/api/billing/update-cost` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | Pure/other | API Core Module | W3 | High | CADI |

### blocks

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0045 | GET | `/api/blocks/visibility` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W5 | Medium | CADI |

### chat

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0046 | POST,PUT | `/api/chat/[identifier]/otp` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB, Security | API Core Module | W3 | Medium | CADI |
| API-0047 | GET,POST | `/api/chat/[identifier]` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB, Executor, Security, Storage | API Core Module | W3 | Medium | CADI |
| API-0048 | POST | `/api/chat/[identifier]/sso` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB, Security | API Core Module | W3 | Medium | CADI |
| API-0049 | DELETE,GET,PATCH | `/api/chat/manage/[id]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Security | API Core Module | W3 | Medium | CADI |
| API-0050 | GET,POST | `/api/chat` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0051 | GET | `/api/chat/validate` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W2 | Medium | CADI |

### cli

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0052 | POST | `/api/cli/auth/approve` | 仅 Sim2 | Auth/OAuth Edge | Session/Middleware | S✓/P– | S✓/P– | Auth | API Auth | W7 | Critical | CADISE |
| API-0053 | POST | `/api/cli/auth/poll` | 仅 Sim2 | Auth/OAuth Edge | Manual review | S✓/P– | S✓/P– | Pure/other | API Auth | W7 | Critical | CADISE |

### contact

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0054 | POST | `/api/contact` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Security | API Core Module | W3 | Medium | CADI |

### copilot

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0055 | POST | `/api/copilot/api-keys/generate` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0056 | DELETE,GET | `/api/copilot/api-keys` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0057 | POST | `/api/copilot/api-keys/validate` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0058 | DELETE,GET,POST | `/api/copilot/byok` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0059 | POST | `/api/copilot/byok/validate` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0060 | POST | `/api/copilot/chat/abort` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0061 | DELETE | `/api/copilot/chat/delete` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0062 | PATCH | `/api/copilot/chat/rename` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0063 | DELETE,PATCH,POST | `/api/copilot/chat/resources` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W3 | Medium | CADI |
| API-0064 | GET,POST | `/api/copilot/chat` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0065 | POST | `/api/copilot/chat/stop` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0066 | GET | `/api/copilot/chat/stream` | 共有同实现 | Streaming | Manual review | S✓/P✓ | S✓/P✓ | Stream | API Streaming | W2 | Medium | CADIEP |
| API-0067 | POST | `/api/copilot/chat/update-messages` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0068 | GET,POST | `/api/copilot/chats` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0069 | POST | `/api/copilot/checkpoints/revert` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB, Executor | API Core Module | W3 | Medium | CADI |
| API-0070 | GET,POST | `/api/copilot/checkpoints` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0071 | POST | `/api/copilot/confirm` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0072 | GET | `/api/copilot/credentials` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0073 | GET,POST | `/api/copilot/feedback` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0074 | GET | `/api/copilot/models` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0075 | POST | `/api/copilot/tool-permission` | 仅 Sim2 | Core Command/Query | Manual review | S✓/P– | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0076 | POST | `/api/copilot/training/examples` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0077 | POST | `/api/copilot/training` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |

### credentials

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0078 | DELETE,GET,POST | `/api/credentials/[id]/members` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | High | CADI |
| API-0079 | DELETE,GET,PUT | `/api/credentials/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | High | CADI |
| API-0080 | POST | `/api/credentials/draft` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | High | CADI |
| API-0081 | DELETE,GET | `/api/credentials/memberships` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | High | CADI |
| API-0082 | GET,POST | `/api/credentials` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | High | CADI |

### cron

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0083 | GET | `/api/cron/cleanup-soft-deletes` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0084 | GET | `/api/cron/cleanup-stale-executions` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S–/P– | DB, Auth, Storage | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0085 | GET | `/api/cron/cleanup-tasks` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0086 | GET | `/api/cron/process-approval-timeouts` | 仅 Polaris | Scheduled Job Ingress | Session/Middleware | S–/P✓ | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0087 | GET | `/api/cron/process-polaris-assignment-workflows` | 仅 Polaris | Scheduled Job Ingress | Session/Middleware | S–/P✓ | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0088 | GET | `/api/cron/process-polaris-notifications` | 仅 Polaris | Scheduled Job Ingress | Session/Middleware | S–/P✓ | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0089 | GET | `/api/cron/process-polaris-risk-schedules` | 仅 Polaris | Scheduled Job Ingress | Session/Middleware | S–/P✓ | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0090 | GET | `/api/cron/reconcile-billing-seats` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S✓/P✓ | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0091 | GET | `/api/cron/reconcile-inbox-entitlement` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S–/P– | DB, Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0092 | GET | `/api/cron/renew-subscriptions` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S✓/P✓ | DB, Auth | API Job Ingress + Worker | W7 | Critical | CADISR |
| API-0093 | GET | `/api/cron/run-data-drains` | 共有同实现 | Scheduled Job Ingress | Session/Middleware | S–/P– | S–/P– | Auth | API Job Ingress + Worker | W7 | Critical | CADISR |

### custom-blocks

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0094 | DELETE,PATCH | `/api/custom-blocks/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |
| API-0095 | GET | `/api/custom-blocks/[id]/usages` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W5 | Medium | CADI |
| API-0096 | GET,POST | `/api/custom-blocks` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |

### demo-requests

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0097 | POST | `/api/demo-requests` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |

### desktop

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0098 | POST | `/api/desktop/auth/handoff` | 仅 Sim2 | Auth/OAuth Edge | Session/Middleware | S–/P– | S✓/P– | Auth | API Auth | W7 | Critical | CADISE |
| API-0099 | POST | `/api/desktop/tool/authorize` | 仅 Sim2 | Core Command/Query | Manual review | S✓/P– | S✓/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0100 | GET | `/api/desktop/update/latest-mac.yml` | 仅 Sim2 | Core Command/Query | Manual review | S–/P– | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |

### emails

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0101 | GET | `/api/emails/preview` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |

### environment

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0102 | GET,POST | `/api/environment` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Security | API Core Module | W1 | Medium | CADI |

### files

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0103 | POST | `/api/files/delete` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0104 | POST | `/api/files/download` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0105 | GET | `/api/files/export/[id]` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0106 | POST | `/api/files/multipart` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0107 | POST | `/api/files/parse` | 共有同实现 | File/Binary | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Executor, Storage | API File Module | W3 | High | CADISB |
| API-0108 | POST | `/api/files/presigned/batch` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0109 | POST | `/api/files/presigned` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0110 | GET | `/api/files/public/[token]/content` | 共有已分叉 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Security, Storage | API Edge Ingress | W7 | Critical | CADISR |
| API-0111 | GET | `/api/files/public/[token]/inline` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Security, Storage | API Edge Ingress | W7 | Critical | CADISR |
| API-0112 | POST,PUT | `/api/files/public/[token]/otp` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Security | API Edge Ingress | W7 | Critical | CADISR |
| API-0113 | GET,POST | `/api/files/public/[token]` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Security | API Edge Ingress | W7 | Critical | CADISR |
| API-0114 | POST | `/api/files/public/[token]/sso` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Security | API Edge Ingress | W7 | Critical | CADISR |
| API-0115 | GET | `/api/files/serve/[...path]` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0116 | GET | `/api/files/storage-status` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0117 | POST | `/api/files/upload` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor, Storage | API File Module | W3 | High | CADISB |
| API-0118 | GET | `/api/files/view/[id]` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |

### folders

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0119 | POST | `/api/folders/[id]/duplicate` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0120 | POST | `/api/folders/[id]/restore` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0121 | DELETE,PUT | `/api/folders/[id]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0122 | PUT | `/api/folders/reorder` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0123 | GET,POST | `/api/folders` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |

### function

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0124 | POST | `/api/function/execute` | 共有已分叉 | Execution Control | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Executor, Sandbox, Security, Storage | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |

### guardrails

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0125 | POST | `/api/guardrails/mask-batch` | 共有同实现 | Core Command/Query | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0126 | POST | `/api/guardrails/validate` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |

### health

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0127 | GET | `/api/health` | 共有同实现 | Core Command/Query | Public | S–/P– | S✓/P✓ | Pure/other | API Core Module | W1 | Medium | CADI |

### help

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0128 | POST | `/api/help/integration-request` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0129 | POST | `/api/help` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API Core Module | W3 | Medium | CADI |

### hr

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0130 | GET | `/api/hr/offboarding/sign/[token]/document` | 仅 Polaris | Public Callback/Token Edge | Public + signature/token | S–/P✓ | S–/P– | Pure/other | API Edge Ingress | W7 | Critical | CADISR |
| API-0131 | GET,POST | `/api/hr/offboarding/sign/[token]` | 仅 Polaris | Public Callback/Token Edge | Public + signature/token | S–/P✓ | S–/P– | Pure/other | API Edge Ingress | W7 | Critical | CADISR |

### integrations

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0132 | POST | `/api/integrations/feishu/approval/callback` | 仅 Polaris | Public Callback/Token Edge | Public + signature/token | S–/P✓ | S–/P✓ | Pure/other | API Edge Ingress | W7 | Critical | CADISR |

### invitations

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0133 | POST | `/api/invitations/[id]/accept` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0134 | POST | `/api/invitations/[id]/reject` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0135 | POST | `/api/invitations/[id]/resend` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0136 | DELETE,GET,PATCH | `/api/invitations/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0137 | GET | `/api/invitations` | 仅 Sim2 | Core Command/Query | Session/Middleware | S✓/P– | S–/P– | Auth | API Core Module | W2 | Medium | CADI |

### jobs

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0138 | GET | `/api/jobs/[jobId]` | 共有同实现 | Execution Control | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |

### knowledge

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0139 | GET,PATCH | `/api/knowledge/[id]/connectors/[connectorId]/documents` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API File Module | W3 | High | CADISB |
| API-0140 | DELETE,GET,PATCH | `/api/knowledge/[id]/connectors/[connectorId]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0141 | POST | `/api/knowledge/[id]/connectors/[connectorId]/sync` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0142 | GET,POST | `/api/knowledge/[id]/connectors` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0143 | DELETE,GET,PUT | `/api/knowledge/[id]/documents/[documentId]/chunks/[chunkId]` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-0144 | GET,PATCH,POST | `/api/knowledge/[id]/documents/[documentId]/chunks` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-0145 | DELETE,GET,PUT | `/api/knowledge/[id]/documents/[documentId]` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API File Module | W3 | High | CADISB |
| API-0146 | DELETE,GET,POST | `/api/knowledge/[id]/documents/[documentId]/tag-definitions` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-0147 | GET,PATCH,POST | `/api/knowledge/[id]/documents` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API File Module | W3 | High | CADISB |
| API-0148 | POST | `/api/knowledge/[id]/documents/upsert` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API File Module | W3 | High | CADISB |
| API-0149 | GET | `/api/knowledge/[id]/next-available-slot` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0150 | POST | `/api/knowledge/[id]/restore` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0151 | DELETE,GET,PUT | `/api/knowledge/[id]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0152 | DELETE | `/api/knowledge/[id]/tag-definitions/[tagId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0153 | GET,POST | `/api/knowledge/[id]/tag-definitions` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0154 | GET | `/api/knowledge/[id]/tag-usage` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0155 | GET | `/api/knowledge/connectors/sync` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0156 | GET,POST | `/api/knowledge` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0157 | POST | `/api/knowledge/search` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |

### link-preview

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0158 | GET | `/api/link-preview` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Core Module | W2 | Medium | CADI |

### logs

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0159 | GET | `/api/logs/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0160 | GET | `/api/logs/by-execution/[executionId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0161 | GET | `/api/logs/cleanup` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0162 | GET | `/api/logs/execution/[executionId]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0163 | GET | `/api/logs/export` | 共有已分叉 | Streaming | Session/Middleware | S–/P– | S–/P– | DB, Auth, Stream | API Streaming | W2 | Medium | CADIEP |
| API-0164 | GET | `/api/logs` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-0165 | GET | `/api/logs/stats` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0166 | GET | `/api/logs/triggers` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |

### mat

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0167 | POST | `/api/mat/chat` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |

### mcp

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0168 | GET | `/api/mcp/copilot/.well-known/oauth-authorization-server` | 共有同实现 | Core Command/Query | Manual review | S–/P– | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0169 | GET | `/api/mcp/copilot/.well-known/oauth-protected-resource` | 共有同实现 | Core Command/Query | Manual review | S–/P– | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0170 | DELETE,GET,POST | `/api/mcp/copilot` | 共有同实现 | Core Command/Query | Manual review | S–/P– | S✓/P✓ | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0171 | GET | `/api/mcp/discover` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0172 | GET | `/api/mcp/events` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0173 | GET | `/api/mcp/oauth/callback` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0174 | GET | `/api/mcp/oauth/start` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, External SDK | API Core Module | W2 | Medium | CADI |
| API-0175 | DELETE,GET,POST | `/api/mcp/serve/[serverId]` | 共有同实现 | Streaming | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Stream, External SDK | API Streaming | W3 | Medium | CADIEP |
| API-0176 | POST | `/api/mcp/servers/[id]/refresh` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0177 | PATCH | `/api/mcp/servers/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0178 | DELETE,GET,POST | `/api/mcp/servers` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0179 | POST | `/api/mcp/servers/test-connection` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0180 | GET,POST | `/api/mcp/tools/discover` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth, External SDK | API Core Module | W3 | Medium | CADI |
| API-0181 | POST | `/api/mcp/tools/execute` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth, External SDK | API Core Module | W3 | Medium | CADI |
| API-0182 | GET | `/api/mcp/tools/stored` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0183 | DELETE,GET,PATCH | `/api/mcp/workflow-servers/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0184 | DELETE,GET,PATCH | `/api/mcp/workflow-servers/[id]/tools/[toolId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0185 | GET,POST | `/api/mcp/workflow-servers/[id]/tools` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0186 | GET,POST | `/api/mcp/workflow-servers` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |

### memory

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0187 | DELETE,GET,PUT | `/api/memory/[id]` | 共有同实现 | Core Command/Query | Internal/Hybrid | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0188 | DELETE,GET,POST | `/api/memory` | 共有同实现 | Core Command/Query | Internal/Hybrid | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |

### mothership

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0189 | POST | `/api/mothership/chat/abort` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0190 | DELETE,PATCH,POST | `/api/mothership/chat/resources` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0191 | GET,POST | `/api/mothership/chat` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0192 | POST | `/api/mothership/chat/stop` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0193 | GET | `/api/mothership/chat/stream` | 共有同实现 | Streaming | Manual review | S✓/P✓ | S–/P– | Pure/other | API Streaming | W2 | Medium | CADIEP |
| API-0194 | POST | `/api/mothership/chats/[chatId]/fork` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0195 | POST | `/api/mothership/chats/[chatId]/restore` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0196 | DELETE,GET,PATCH | `/api/mothership/chats/[chatId]` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0197 | POST | `/api/mothership/chats/read` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0198 | GET,POST | `/api/mothership/chats` | 共有已分叉 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB | API Core Module | W3 | Medium | CADI |
| API-0199 | GET | `/api/mothership/events` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0200 | POST | `/api/mothership/execute` | 共有已分叉 | Streaming | Internal/Hybrid | S✓/P✓ | S✓/P– | Auth, Stream | API Streaming | W3 | Medium | CADIEP |
| API-0201 | POST | `/api/mothership/local-files/stage` | 仅 Sim2 | Core Command/Query | Manual review | S✓/P– | S✓/P– | DB, Storage | API Core Module | W3 | Medium | CADI |

### organizations

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0202 | DELETE,GET,POST,PUT | `/api/organizations/[id]/business-access/bindings` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0203 | GET | `/api/organizations/[id]/business-access/me` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0204 | GET | `/api/organizations/[id]/business-access/menus` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0205 | DELETE,PUT | `/api/organizations/[id]/business-access/roles/[roleId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0206 | GET,POST | `/api/organizations/[id]/business-access/roles` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0207 | DELETE,GET,PUT | `/api/organizations/[id]/data-drains/[drainId]` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W3 | Medium | CADI |
| API-0208 | POST | `/api/organizations/[id]/data-drains/[drainId]/run` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W3 | Medium | CADI |
| API-0209 | GET | `/api/organizations/[id]/data-drains/[drainId]/runs` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W2 | Medium | CADI |
| API-0210 | POST | `/api/organizations/[id]/data-drains/[drainId]/test` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0211 | GET,POST | `/api/organizations/[id]/data-drains` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W3 | Medium | CADI |
| API-0212 | GET,PUT | `/api/organizations/[id]/data-retention` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0213 | DELETE | `/api/organizations/[id]/domains/[domainId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0214 | POST | `/api/organizations/[id]/domains/[domainId]/verify` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0215 | GET,POST | `/api/organizations/[id]/domains` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0216 | GET | `/api/organizations/[id]/identity/audit` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0217 | POST | `/api/organizations/[id]/identity/import-batches/[batchId]/rollback` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0218 | GET | `/api/organizations/[id]/identity/import-batches/[batchId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0219 | GET | `/api/organizations/[id]/identity/import-batches` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0220 | POST | `/api/organizations/[id]/identity/import` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0221 | PATCH | `/api/organizations/[id]/identity/people/[userId]/lifecycle` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0222 | GET | `/api/organizations/[id]/identity/people` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0223 | DELETE,PATCH | `/api/organizations/[id]/identity/providers/[providerKey]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0224 | GET,POST | `/api/organizations/[id]/identity/providers` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0225 | GET | `/api/organizations/[id]/identity/role-options` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0226 | POST | `/api/organizations/[id]/identity/sync` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0227 | GET,POST | `/api/organizations/[id]/invitations` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0228 | DELETE,GET,PUT | `/api/organizations/[id]/members/[memberId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0229 | GET,PUT | `/api/organizations/[id]/members/[memberId]/usage-limit` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0230 | GET,POST | `/api/organizations/[id]/members` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0231 | POST | `/api/organizations/[id]/permission-groups/[groupId]/members/bulk` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0232 | DELETE,GET,POST | `/api/organizations/[id]/permission-groups/[groupId]/members` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0233 | DELETE,GET,PUT | `/api/organizations/[id]/permission-groups/[groupId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0234 | GET,POST | `/api/organizations/[id]/permission-groups` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0235 | GET | `/api/organizations/[id]/roster` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0236 | GET,PUT | `/api/organizations/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0237 | GET,PUT | `/api/organizations/[id]/session-policy` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0238 | POST | `/api/organizations/[id]/sessions/revoke` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0239 | POST | `/api/organizations/[id]/transfer-ownership` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0240 | GET,PUT | `/api/organizations/[id]/whitelabel` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0241 | GET | `/api/organizations/[id]/workspaces` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0242 | GET,POST | `/api/organizations` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |

### permission-groups

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0243 | GET | `/api/permission-groups/user` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |

### pinned-items

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0244 | DELETE | `/api/pinned-items/[resourceType]/[resourceId]` | 仅 Sim2 | Core Command/Query | Session/Middleware | S✓/P– | S✓/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0245 | GET,POST | `/api/pinned-items` | 仅 Sim2 | Core Command/Query | Session/Middleware | S✓/P– | S✓/P– | DB, Auth | API Core Module | W3 | Medium | CADI |

### polaris

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0246 | GET | `/api/polaris/api-write-logs` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0247 | GET | `/api/polaris/event-logs` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0248 | GET,POST | `/api/polaris/event-types` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0249 | POST | `/api/polaris/events` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0250 | POST | `/api/polaris/hr/offboarding/sla/process` | 仅 Polaris | Polaris Business | Internal/Hybrid | S–/P– | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0251 | GET | `/api/polaris/notification-logs` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0252 | DELETE,PATCH | `/api/polaris/notification-rules/[ruleId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0253 | POST | `/api/polaris/notification-rules/[ruleId]/test` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0254 | GET,POST | `/api/polaris/notification-rules` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0255 | PATCH | `/api/polaris/notifications/[notificationId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0256 | POST | `/api/polaris/notifications/process` | 仅 Polaris | Polaris Business | Internal/Hybrid | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0257 | GET | `/api/polaris/notifications` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0258 | POST | `/api/polaris/operations/callback` | 仅 Polaris | Public Callback/Token Edge | Public + signature/token | S–/P✓ | S–/P– | Pure/other | API Edge Ingress | W7 | Critical | CADISR |
| API-0259 | POST | `/api/polaris/risk-rules/[ruleSetId]/versions/[versionId]/activate` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0260 | POST | `/api/polaris/risk-rules/[ruleSetId]/versions/[versionId]/simulate` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0261 | POST | `/api/polaris/risk-rules/[ruleSetId]/versions` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0262 | GET,PATCH,POST | `/api/polaris/risk-rules` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0263 | PATCH | `/api/polaris/risk-schedules/[scheduleId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0264 | POST | `/api/polaris/risk-schedules/[scheduleId]/run` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0265 | GET,POST | `/api/polaris/risk-schedules` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0266 | GET | `/api/polaris/risks` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0267 | POST | `/api/polaris/todos/[todoId]/action-receipt` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0268 | GET,PATCH | `/api/polaris/todos/[todoId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-0269 | GET,POST | `/api/polaris/todos` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |

### providers

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0270 | GET | `/api/providers/base/models` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0271 | GET | `/api/providers/baseten/models` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-0272 | GET | `/api/providers/fireworks/models` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0273 | GET | `/api/providers/litellm/models` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0274 | GET | `/api/providers/ollama-cloud/models` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-0275 | GET | `/api/providers/ollama/models` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0276 | GET | `/api/providers/openrouter/models` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |
| API-0277 | POST | `/api/providers` | 共有同实现 | Streaming | Internal/Hybrid | S✓/P✓ | S✓/P✓ | DB, Auth, Executor, Stream | API Streaming | W3 | Medium | CADIEP |
| API-0278 | GET | `/api/providers/together/models` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-0279 | GET | `/api/providers/vllm/models` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |

### proxy

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0280 | POST | `/api/proxy/tts/stream` | 共有同实现 | Streaming | Manual review | S✓/P✓ | S–/P– | DB, Security, Stream | API Streaming | W3 | Medium | CADIEP |

### resume

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0281 | GET,POST | `/api/resume/[workflowId]/[executionId]/[contextId]` | 共有已分叉 | Execution Control | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0282 | GET | `/api/resume/[workflowId]/[executionId]` | 共有同实现 | Execution Control | Manual review | S✓/P✓ | S–/P– | Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0283 | GET | `/api/resume/poll` | 共有同实现 | Execution Control | Session/Middleware | S–/P– | S✓/P✓ | DB, Auth, Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |

### schedules

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0284 | DELETE,GET,PUT | `/api/schedules/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0285 | GET | `/api/schedules/execute` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Executor, Security | API Core Module | W2 | Medium | CADI |
| API-0286 | GET,POST | `/api/schedules` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |

### settings

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0287 | GET | `/api/settings/allowed-integrations` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0288 | GET | `/api/settings/allowed-mcp-domains` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0289 | GET | `/api/settings/allowed-providers` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0290 | GET | `/api/settings/voice` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |

### skills

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0291 | DELETE,GET,POST | `/api/skills/[id]/members` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0292 | DELETE,GET,POST | `/api/skills` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |

### speech

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0293 | POST | `/api/speech/token` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Security | API Core Module | W3 | Medium | CADI |

### stars

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0294 | GET | `/api/stars` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W2 | Medium | CADI |

### status

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0295 | GET | `/api/status` | 共有同实现 | Core Command/Query | Public | S✓/P✓ | S–/P– | Pure/other | API Core Module | W1 | Medium | CADI |

### superuser

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0296 | POST | `/api/superuser/import-workflow` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |

### table

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0297 | POST | `/api/table/[tableId]/cancel-runs` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0298 | DELETE,PATCH,POST | `/api/table/[tableId]/columns` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0299 | POST | `/api/table/[tableId]/columns/run` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0300 | POST | `/api/table/[tableId]/delete-async` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor | API Core Module | W3 | Medium | CADI |
| API-0301 | GET | `/api/table/[tableId]/dispatches` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-0302 | GET | `/api/table/[tableId]/events/stream` | 共有同实现 | Streaming | Session/Middleware | S✓/P✓ | S–/P– | Auth, Stream | API Streaming | W2 | Medium | CADIEP |
| API-0303 | POST | `/api/table/[tableId]/export-async` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor | API Core Module | W3 | Medium | CADI |
| API-0304 | GET | `/api/table/[tableId]/export/download` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-0305 | GET | `/api/table/[tableId]/export` | 共有已分叉 | Streaming | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Stream | API Streaming | W2 | Medium | CADIEP |
| API-0306 | DELETE,PATCH,POST | `/api/table/[tableId]/groups` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0307 | POST | `/api/table/[tableId]/import-async` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor | API Core Module | W3 | Medium | CADI |
| API-0308 | POST | `/api/table/[tableId]/import` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0309 | POST | `/api/table/[tableId]/job/cancel` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0310 | PUT | `/api/table/[tableId]/metadata` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0311 | POST | `/api/table/[tableId]/restore` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0312 | DELETE,GET,PATCH | `/api/table/[tableId]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0313 | GET | `/api/table/[tableId]/rows/[rowId]/enrichment/[groupId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-0314 | DELETE,GET,PATCH | `/api/table/[tableId]/rows/[rowId]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0315 | GET | `/api/table/[tableId]/rows/find` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-0316 | DELETE,GET,PATCH,POST,PUT | `/api/table/[tableId]/rows` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0317 | POST | `/api/table/[tableId]/rows/upsert` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-0318 | POST | `/api/table/import-async` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor | API Core Module | W3 | Medium | CADI |
| API-0319 | POST | `/api/table/import-csv` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W3 | Medium | CADI |
| API-0320 | GET | `/api/table/jobs` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0321 | GET,POST | `/api/table` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P– | Auth | API Core Module | W3 | Medium | CADI |

### telemetry

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0322 | POST | `/api/telemetry` | 仅 Sim2 | Core Command/Query | Manual review | S✓/P– | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |

### tools

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0323 | POST | `/api/tools/a2a/cancel-task` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0324 | POST | `/api/tools/a2a/get-agent-card` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0325 | POST | `/api/tools/a2a/get-task` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0326 | POST | `/api/tools/a2a/send-message` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0327 | POST | `/api/tools/agiloft/attach` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0328 | POST | `/api/tools/agiloft/attachment_info` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0329 | POST | `/api/tools/agiloft/create_record` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0330 | POST | `/api/tools/agiloft/delete_record` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0331 | POST | `/api/tools/agiloft/get_choice_line_id` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0332 | POST | `/api/tools/agiloft/lock_record` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0333 | POST | `/api/tools/agiloft/read_record` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0334 | POST | `/api/tools/agiloft/remove_attachment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0335 | POST | `/api/tools/agiloft/retrieve` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0336 | POST | `/api/tools/agiloft/saved_search` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0337 | POST | `/api/tools/agiloft/search_records` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0338 | POST | `/api/tools/agiloft/select_records` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0339 | POST | `/api/tools/agiloft/update_record` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0340 | POST | `/api/tools/airtable/bases` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0341 | POST | `/api/tools/airtable/tables` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0342 | POST | `/api/tools/appconfig/create-application` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0343 | POST | `/api/tools/appconfig/create-configuration-profile` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0344 | POST | `/api/tools/appconfig/create-environment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0345 | POST | `/api/tools/appconfig/create-hosted-configuration-version` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0346 | POST | `/api/tools/appconfig/delete-application` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0347 | POST | `/api/tools/appconfig/delete-configuration-profile` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0348 | POST | `/api/tools/appconfig/delete-environment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0349 | POST | `/api/tools/appconfig/delete-hosted-configuration-version` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0350 | POST | `/api/tools/appconfig/get-application` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0351 | POST | `/api/tools/appconfig/get-configuration-profile` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0352 | POST | `/api/tools/appconfig/get-configuration` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0353 | POST | `/api/tools/appconfig/get-deployment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0354 | POST | `/api/tools/appconfig/get-environment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0355 | POST | `/api/tools/appconfig/get-hosted-configuration-version` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0356 | POST | `/api/tools/appconfig/list-applications` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0357 | POST | `/api/tools/appconfig/list-configuration-profiles` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0358 | POST | `/api/tools/appconfig/list-deployment-strategies` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0359 | POST | `/api/tools/appconfig/list-deployments` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0360 | POST | `/api/tools/appconfig/list-environments` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0361 | POST | `/api/tools/appconfig/list-hosted-configuration-versions` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0362 | POST | `/api/tools/appconfig/start-deployment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0363 | POST | `/api/tools/appconfig/stop-deployment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0364 | POST | `/api/tools/appconfig/update-application` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0365 | POST | `/api/tools/appconfig/update-configuration-profile` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0366 | POST | `/api/tools/appconfig/update-environment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0367 | POST | `/api/tools/asana/add-comment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0368 | POST | `/api/tools/asana/add-followers` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0369 | POST | `/api/tools/asana/create-project` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0370 | POST | `/api/tools/asana/create-section` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0371 | POST | `/api/tools/asana/create-subtask` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0372 | POST | `/api/tools/asana/create-task` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0373 | POST | `/api/tools/asana/delete-task` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0374 | POST | `/api/tools/asana/get-project` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0375 | POST | `/api/tools/asana/get-projects` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0376 | POST | `/api/tools/asana/get-task` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0377 | POST | `/api/tools/asana/list-sections` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0378 | POST | `/api/tools/asana/list-workspaces` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0379 | POST | `/api/tools/asana/search-tasks` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0380 | PUT | `/api/tools/asana/update-task` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0381 | POST | `/api/tools/asana/workspaces` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0382 | POST | `/api/tools/athena/batch-get-query-execution` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0383 | POST | `/api/tools/athena/create-named-query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0384 | POST | `/api/tools/athena/delete-named-query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0385 | POST | `/api/tools/athena/get-named-query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0386 | POST | `/api/tools/athena/get-query-execution` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0387 | POST | `/api/tools/athena/get-query-results` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0388 | POST | `/api/tools/athena/list-databases` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0389 | POST | `/api/tools/athena/list-named-queries` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0390 | POST | `/api/tools/athena/list-query-executions` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0391 | POST | `/api/tools/athena/list-table-metadata` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0392 | POST | `/api/tools/athena/start-query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0393 | POST | `/api/tools/athena/stop-query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0394 | POST | `/api/tools/attio/lists` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0395 | POST | `/api/tools/attio/objects` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0396 | POST | `/api/tools/box/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0397 | POST | `/api/tools/brex/upload-receipt` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0398 | POST | `/api/tools/buffer/create-post` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0399 | POST | `/api/tools/buffer/edit-post` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0400 | POST | `/api/tools/calcom/event-types` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0401 | POST | `/api/tools/calcom/schedules` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0402 | POST | `/api/tools/clickhouse/count-rows` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0403 | POST | `/api/tools/clickhouse/create-database` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0404 | POST | `/api/tools/clickhouse/create-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0405 | POST | `/api/tools/clickhouse/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0406 | POST | `/api/tools/clickhouse/describe-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0407 | POST | `/api/tools/clickhouse/drop-database` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0408 | POST | `/api/tools/clickhouse/drop-partition` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0409 | POST | `/api/tools/clickhouse/drop-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0410 | POST | `/api/tools/clickhouse/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0411 | POST | `/api/tools/clickhouse/insert-rows` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0412 | POST | `/api/tools/clickhouse/insert` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0413 | POST | `/api/tools/clickhouse/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0414 | POST | `/api/tools/clickhouse/kill-query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0415 | POST | `/api/tools/clickhouse/list-clusters` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0416 | POST | `/api/tools/clickhouse/list-databases` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0417 | POST | `/api/tools/clickhouse/list-mutations` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0418 | POST | `/api/tools/clickhouse/list-partitions` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0419 | POST | `/api/tools/clickhouse/list-running-queries` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0420 | POST | `/api/tools/clickhouse/list-tables` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0421 | POST | `/api/tools/clickhouse/optimize-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0422 | POST | `/api/tools/clickhouse/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0423 | POST | `/api/tools/clickhouse/rename-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0424 | POST | `/api/tools/clickhouse/show-create-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0425 | POST | `/api/tools/clickhouse/table-stats` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0426 | POST | `/api/tools/clickhouse/truncate-table` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0427 | POST | `/api/tools/clickhouse/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0428 | POST | `/api/tools/clickup/folders` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0429 | POST | `/api/tools/clickup/lists` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0430 | POST | `/api/tools/clickup/spaces` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0431 | POST | `/api/tools/clickup/upload-attachment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0432 | POST | `/api/tools/clickup/workspaces` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0433 | POST | `/api/tools/cloudformation/cancel-update-stack` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0434 | POST | `/api/tools/cloudformation/create-change-set` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0435 | POST | `/api/tools/cloudformation/create-stack` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0436 | POST | `/api/tools/cloudformation/delete-stack` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0437 | POST | `/api/tools/cloudformation/describe-change-set` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0438 | POST | `/api/tools/cloudformation/describe-stack-drift-detection-status` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0439 | POST | `/api/tools/cloudformation/describe-stack-events` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0440 | POST | `/api/tools/cloudformation/describe-stacks` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0441 | POST | `/api/tools/cloudformation/detect-stack-drift` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0442 | POST | `/api/tools/cloudformation/execute-change-set` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0443 | POST | `/api/tools/cloudformation/get-template-summary` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0444 | POST | `/api/tools/cloudformation/get-template` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0445 | POST | `/api/tools/cloudformation/list-stack-resources` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0446 | POST | `/api/tools/cloudformation/update-stack` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0447 | POST | `/api/tools/cloudformation/validate-template` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0448 | POST | `/api/tools/cloudwatch/describe-alarm-history` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0449 | POST | `/api/tools/cloudwatch/describe-alarms` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0450 | POST | `/api/tools/cloudwatch/describe-log-groups` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0451 | POST | `/api/tools/cloudwatch/describe-log-streams` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0452 | POST | `/api/tools/cloudwatch/filter-log-events` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0453 | POST | `/api/tools/cloudwatch/get-log-events` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0454 | POST | `/api/tools/cloudwatch/get-metric-statistics` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0455 | POST | `/api/tools/cloudwatch/list-metrics` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0456 | POST | `/api/tools/cloudwatch/mute-alarm` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0457 | POST | `/api/tools/cloudwatch/put-log-group-retention` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0458 | POST | `/api/tools/cloudwatch/put-metric-data` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0459 | POST | `/api/tools/cloudwatch/query-logs` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0460 | POST | `/api/tools/cloudwatch/unmute-alarm` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0461 | POST | `/api/tools/codepipeline/disable-stage-transition` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0462 | POST | `/api/tools/codepipeline/enable-stage-transition` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0463 | POST | `/api/tools/codepipeline/get-pipeline-execution` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0464 | POST | `/api/tools/codepipeline/get-pipeline-state` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0465 | POST | `/api/tools/codepipeline/get-pipeline` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0466 | POST | `/api/tools/codepipeline/list-action-executions` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0467 | POST | `/api/tools/codepipeline/list-pipeline-executions` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0468 | POST | `/api/tools/codepipeline/list-pipelines` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0469 | POST | `/api/tools/codepipeline/put-approval-result` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0470 | POST | `/api/tools/codepipeline/retry-stage-execution` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0471 | POST | `/api/tools/codepipeline/start-execution` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0472 | POST | `/api/tools/codepipeline/stop-execution` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0473 | DELETE | `/api/tools/confluence/attachment` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0474 | GET | `/api/tools/confluence/attachments` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0475 | DELETE,GET,POST,PUT | `/api/tools/confluence/blogposts` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0476 | DELETE,PUT | `/api/tools/confluence/comment` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0477 | GET,POST | `/api/tools/confluence/comments` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0478 | POST | `/api/tools/confluence/create-page` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0479 | DELETE,GET,POST | `/api/tools/confluence/labels` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0480 | POST | `/api/tools/confluence/page-ancestors` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0481 | POST | `/api/tools/confluence/page-children` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0482 | POST | `/api/tools/confluence/page-descendants` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0483 | DELETE,GET,POST,PUT | `/api/tools/confluence/page-properties` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0484 | POST | `/api/tools/confluence/page-versions` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0485 | DELETE,POST,PUT | `/api/tools/confluence/page` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0486 | GET | `/api/tools/confluence/pages-by-label` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0487 | POST | `/api/tools/confluence/pages` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0488 | POST | `/api/tools/confluence/search-in-space` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0489 | POST | `/api/tools/confluence/search` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0490 | POST | `/api/tools/confluence/selector-spaces` | 共有已分叉 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0491 | POST | `/api/tools/confluence/space-blogposts` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0492 | GET | `/api/tools/confluence/space-labels` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0493 | POST | `/api/tools/confluence/space-pages` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0494 | POST | `/api/tools/confluence/space-permissions` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0495 | POST | `/api/tools/confluence/space-properties` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0496 | DELETE,GET,POST,PUT | `/api/tools/confluence/space` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0497 | GET | `/api/tools/confluence/spaces` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0498 | POST | `/api/tools/confluence/tasks` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0499 | POST | `/api/tools/confluence/upload-attachment` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0500 | POST | `/api/tools/confluence/user` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0501 | POST | `/api/tools/crowdstrike/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0502 | POST | `/api/tools/cursor/download-artifact` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0503 | DELETE,GET,POST | `/api/tools/custom` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0504 | POST | `/api/tools/daytona/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0505 | POST | `/api/tools/deployments/deploy` | 共有同实现 | Integration Tool Adapter | Manual review | S✓/P✓ | S–/P– | Pure/other | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0506 | POST | `/api/tools/deployments/promote` | 共有同实现 | Integration Tool Adapter | Manual review | S✓/P✓ | S–/P– | Pure/other | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0507 | POST | `/api/tools/deployments/undeploy` | 共有同实现 | Integration Tool Adapter | Manual review | S✓/P✓ | S–/P– | Pure/other | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0508 | GET | `/api/tools/deployments/version` | 共有同实现 | Integration Tool Adapter | Manual review | S✓/P✓ | S–/P– | Pure/other | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0509 | GET | `/api/tools/deployments/versions` | 共有同实现 | Integration Tool Adapter | Manual review | S✓/P✓ | S–/P– | Pure/other | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0510 | POST | `/api/tools/discord/channels` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0511 | POST | `/api/tools/discord/send-message` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0512 | POST | `/api/tools/discord/servers` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0513 | POST | `/api/tools/docusign` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0514 | GET | `/api/tools/drive/file` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0515 | GET | `/api/tools/drive/files` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0516 | POST | `/api/tools/dropbox/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0517 | POST | `/api/tools/dynamodb/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0518 | POST | `/api/tools/dynamodb/get` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0519 | POST | `/api/tools/dynamodb/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0520 | POST | `/api/tools/dynamodb/put` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0521 | POST | `/api/tools/dynamodb/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0522 | POST | `/api/tools/dynamodb/scan` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0523 | POST | `/api/tools/dynamodb/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0524 | POST | `/api/tools/elevenlabs/audio` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0525 | POST | `/api/tools/enrichment/run` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0526 | POST | `/api/tools/evernote/copy-note` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0527 | POST | `/api/tools/evernote/create-note` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0528 | POST | `/api/tools/evernote/create-notebook` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0529 | POST | `/api/tools/evernote/create-tag` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0530 | POST | `/api/tools/evernote/delete-note` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0531 | POST | `/api/tools/evernote/get-note` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0532 | POST | `/api/tools/evernote/get-notebook` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0533 | POST | `/api/tools/evernote/list-notebooks` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0534 | POST | `/api/tools/evernote/list-tags` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0535 | POST | `/api/tools/evernote/search-notes` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0536 | POST | `/api/tools/evernote/update-note` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0537 | POST | `/api/tools/extend/parse` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0538 | POST | `/api/tools/file/manage` | 共有已分叉 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Executor, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0539 | POST | `/api/tools/firecrawl/parse` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0540 | POST | `/api/tools/github/latest-commit` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0541 | POST | `/api/tools/gmail/add-label` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0542 | POST | `/api/tools/gmail/archive` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0543 | POST | `/api/tools/gmail/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0544 | POST | `/api/tools/gmail/draft` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0545 | POST | `/api/tools/gmail/edit-draft` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0546 | GET | `/api/tools/gmail/label` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0547 | GET | `/api/tools/gmail/labels` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0548 | POST | `/api/tools/gmail/mark-read` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0549 | POST | `/api/tools/gmail/mark-unread` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0550 | POST | `/api/tools/gmail/move` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0551 | POST | `/api/tools/gmail/remove-label` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0552 | POST | `/api/tools/gmail/send` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0553 | POST | `/api/tools/gmail/unarchive` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0554 | POST | `/api/tools/google_bigquery/datasets` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0555 | POST | `/api/tools/google_bigquery/tables` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0556 | GET | `/api/tools/google_calendar/calendars` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0557 | POST | `/api/tools/google_drive/download` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0558 | POST | `/api/tools/google_drive/export` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0559 | POST | `/api/tools/google_drive/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0560 | GET | `/api/tools/google_sheets/sheets` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0561 | POST | `/api/tools/google_slides/export-presentation` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0562 | POST | `/api/tools/google_tasks/task-lists` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0563 | POST | `/api/tools/google_vault/download-export-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0564 | POST | `/api/tools/grafana/update_alert_rule` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0565 | POST | `/api/tools/grafana/update_dashboard` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0566 | POST | `/api/tools/grafana/update_folder` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0567 | GET | `/api/tools/hubspot/lists` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0568 | GET | `/api/tools/hubspot/owners` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0569 | GET | `/api/tools/hubspot/pipelines` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0570 | GET | `/api/tools/hubspot/properties` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0571 | POST | `/api/tools/iam/add-user-to-group` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0572 | POST | `/api/tools/iam/attach-role-policy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0573 | POST | `/api/tools/iam/attach-user-policy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0574 | POST | `/api/tools/iam/create-access-key` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0575 | POST | `/api/tools/iam/create-role` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0576 | POST | `/api/tools/iam/create-user` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0577 | POST | `/api/tools/iam/delete-access-key` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0578 | POST | `/api/tools/iam/delete-role` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0579 | POST | `/api/tools/iam/delete-user` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0580 | POST | `/api/tools/iam/detach-role-policy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0581 | POST | `/api/tools/iam/detach-user-policy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0582 | POST | `/api/tools/iam/get-role` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0583 | POST | `/api/tools/iam/get-user` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0584 | POST | `/api/tools/iam/list-attached-role-policies` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0585 | POST | `/api/tools/iam/list-attached-user-policies` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0586 | POST | `/api/tools/iam/list-groups` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0587 | POST | `/api/tools/iam/list-policies` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0588 | POST | `/api/tools/iam/list-roles` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0589 | POST | `/api/tools/iam/list-users` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0590 | POST | `/api/tools/iam/remove-user-from-group` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0591 | POST | `/api/tools/iam/simulate-principal-policy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0592 | POST | `/api/tools/identity-center/check-assignment-deletion-status` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0593 | POST | `/api/tools/identity-center/check-assignment-status` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0594 | POST | `/api/tools/identity-center/create-account-assignment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0595 | POST | `/api/tools/identity-center/delete-account-assignment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0596 | POST | `/api/tools/identity-center/describe-account` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0597 | POST | `/api/tools/identity-center/get-group` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0598 | POST | `/api/tools/identity-center/get-user` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0599 | POST | `/api/tools/identity-center/list-account-assignments` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0600 | POST | `/api/tools/identity-center/list-accounts` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0601 | POST | `/api/tools/identity-center/list-groups` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0602 | POST | `/api/tools/identity-center/list-instances` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0603 | POST | `/api/tools/identity-center/list-permission-sets` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0604 | GET,POST | `/api/tools/image` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0605 | POST | `/api/tools/imap/mailboxes` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0606 | POST | `/api/tools/instagram/download-media` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Executor, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0607 | POST | `/api/tools/instagram/publish-carousel` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0608 | POST | `/api/tools/instagram/publish-image` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0609 | POST | `/api/tools/instagram/publish-reel` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0610 | POST | `/api/tools/instagram/publish-story` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0611 | POST | `/api/tools/instagram/publish-video` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0612 | POST | `/api/tools/jira/add-attachment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0613 | GET,POST | `/api/tools/jira/issues` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0614 | GET,POST | `/api/tools/jira/projects` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0615 | PUT | `/api/tools/jira/update` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0616 | POST | `/api/tools/jira/write` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0617 | POST | `/api/tools/jsm/approvals` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0618 | POST | `/api/tools/jsm/assets/attributes` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0619 | POST | `/api/tools/jsm/assets/object-types` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0620 | POST | `/api/tools/jsm/assets/object/create` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0621 | POST | `/api/tools/jsm/assets/object/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0622 | POST | `/api/tools/jsm/assets/object/get` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0623 | POST | `/api/tools/jsm/assets/object/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0624 | POST | `/api/tools/jsm/assets/schema` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0625 | POST | `/api/tools/jsm/assets/schemas` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0626 | POST | `/api/tools/jsm/assets/search` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0627 | POST | `/api/tools/jsm/comment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0628 | POST | `/api/tools/jsm/comments` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0629 | POST | `/api/tools/jsm/customers` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0630 | POST | `/api/tools/jsm/forms/answers` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0631 | POST | `/api/tools/jsm/forms/attach` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0632 | POST | `/api/tools/jsm/forms/copy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0633 | POST | `/api/tools/jsm/forms/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0634 | POST | `/api/tools/jsm/forms/externalise` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0635 | POST | `/api/tools/jsm/forms/get` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0636 | POST | `/api/tools/jsm/forms/internalise` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0637 | POST | `/api/tools/jsm/forms/issue` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0638 | POST | `/api/tools/jsm/forms/reopen` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0639 | POST | `/api/tools/jsm/forms/save` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0640 | POST | `/api/tools/jsm/forms/structure` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0641 | POST | `/api/tools/jsm/forms/submit` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0642 | POST | `/api/tools/jsm/forms/templates` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0643 | POST | `/api/tools/jsm/organization` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0644 | POST | `/api/tools/jsm/organizations` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0645 | POST | `/api/tools/jsm/participants` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0646 | POST | `/api/tools/jsm/queues` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0647 | POST | `/api/tools/jsm/request` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0648 | POST | `/api/tools/jsm/requests` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0649 | POST | `/api/tools/jsm/requesttypefields` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0650 | POST | `/api/tools/jsm/requesttypes` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0651 | POST | `/api/tools/jsm/selector-requesttypes` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0652 | POST | `/api/tools/jsm/selector-servicedesks` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0653 | POST | `/api/tools/jsm/servicedesks` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0654 | POST | `/api/tools/jsm/sla` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0655 | POST | `/api/tools/jsm/transition` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0656 | POST | `/api/tools/jsm/transitions` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0657 | POST | `/api/tools/jupyter/proxy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0658 | POST | `/api/tools/jupyter/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0659 | POST | `/api/tools/latex` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0660 | POST | `/api/tools/linear/projects` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0661 | POST | `/api/tools/linear/teams` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0662 | POST | `/api/tools/linq/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0663 | POST | `/api/tools/mail/send` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0664 | GET | `/api/tools/managed-agent/list` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0665 | POST | `/api/tools/microsoft-dataverse/upload-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0666 | POST | `/api/tools/microsoft-teams/channels` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0667 | POST | `/api/tools/microsoft-teams/chats` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0668 | POST | `/api/tools/microsoft-teams/teams` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0669 | POST | `/api/tools/microsoft_excel/drives` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0670 | GET | `/api/tools/microsoft_excel/sheets` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0671 | POST | `/api/tools/microsoft_planner/plans` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0672 | POST | `/api/tools/microsoft_planner/tasks` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0673 | POST | `/api/tools/microsoft_teams/delete_chat_message` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0674 | POST | `/api/tools/microsoft_teams/write_channel` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0675 | POST | `/api/tools/microsoft_teams/write_chat` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0676 | POST | `/api/tools/mistral/parse` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0677 | POST | `/api/tools/monday/boards` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0678 | POST | `/api/tools/monday/groups` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0679 | POST | `/api/tools/mongodb/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0680 | POST | `/api/tools/mongodb/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0681 | POST | `/api/tools/mongodb/insert` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0682 | POST | `/api/tools/mongodb/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0683 | POST | `/api/tools/mongodb/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0684 | POST | `/api/tools/mongodb/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0685 | POST | `/api/tools/mysql/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0686 | POST | `/api/tools/mysql/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0687 | POST | `/api/tools/mysql/insert` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0688 | POST | `/api/tools/mysql/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0689 | POST | `/api/tools/mysql/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0690 | POST | `/api/tools/mysql/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0691 | POST | `/api/tools/neo4j/create` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0692 | POST | `/api/tools/neo4j/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0693 | POST | `/api/tools/neo4j/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0694 | POST | `/api/tools/neo4j/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0695 | POST | `/api/tools/neo4j/merge` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0696 | POST | `/api/tools/neo4j/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0697 | POST | `/api/tools/neo4j/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0698 | POST | `/api/tools/notion/databases` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0699 | POST | `/api/tools/notion/pages` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0700 | POST | `/api/tools/onedrive/download` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0701 | GET | `/api/tools/onedrive/files` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0702 | GET | `/api/tools/onedrive/folder` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0703 | GET | `/api/tools/onedrive/folders` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0704 | POST | `/api/tools/onedrive/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0705 | POST | `/api/tools/onepassword/create-item` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0706 | POST | `/api/tools/onepassword/delete-item` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0707 | POST | `/api/tools/onepassword/get-item-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0708 | POST | `/api/tools/onepassword/get-item` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0709 | POST | `/api/tools/onepassword/get-vault` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0710 | POST | `/api/tools/onepassword/list-items` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0711 | POST | `/api/tools/onepassword/list-vaults` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0712 | POST | `/api/tools/onepassword/replace-item` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0713 | POST | `/api/tools/onepassword/resolve-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0714 | POST | `/api/tools/onepassword/update-item` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0715 | POST | `/api/tools/outlook/copy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0716 | POST | `/api/tools/outlook/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0717 | POST | `/api/tools/outlook/draft` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0718 | GET | `/api/tools/outlook/folders` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0719 | POST | `/api/tools/outlook/mark-read` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0720 | POST | `/api/tools/outlook/mark-unread` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0721 | POST | `/api/tools/outlook/move` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0722 | POST | `/api/tools/outlook/send` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0723 | POST | `/api/tools/persona/import-accounts` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0724 | POST | `/api/tools/pipedrive/get-files` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0725 | POST | `/api/tools/pipedrive/pipelines` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0726 | POST | `/api/tools/polaris/feishu/approval` | 仅 Polaris | Integration Tool Adapter | Internal/Hybrid | S–/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0727 | POST | `/api/tools/polaris/identity/person` | 仅 Polaris | Integration Tool Adapter | Internal/Hybrid | S–/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0728 | POST | `/api/tools/polaris/identity/roles` | 仅 Polaris | Integration Tool Adapter | Internal/Hybrid | S–/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0729 | POST | `/api/tools/polaris/identity/users-by-role` | 仅 Polaris | Integration Tool Adapter | Internal/Hybrid | S–/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0730 | POST | `/api/tools/postgresql/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0731 | POST | `/api/tools/postgresql/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0732 | POST | `/api/tools/postgresql/insert` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0733 | POST | `/api/tools/postgresql/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0734 | POST | `/api/tools/postgresql/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0735 | POST | `/api/tools/postgresql/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0736 | POST | `/api/tools/pulse/parse` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0737 | POST | `/api/tools/quiver/image-to-svg` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0738 | POST | `/api/tools/quiver/text-to-svg` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0739 | POST | `/api/tools/rds/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0740 | POST | `/api/tools/rds/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0741 | POST | `/api/tools/rds/insert` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0742 | POST | `/api/tools/rds/introspect` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0743 | POST | `/api/tools/rds/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0744 | POST | `/api/tools/rds/update` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0745 | POST | `/api/tools/redis/execute` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0746 | POST | `/api/tools/reducto/parse` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0747 | POST | `/api/tools/s3/copy-object` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0748 | POST | `/api/tools/s3/create-bucket` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0749 | POST | `/api/tools/s3/delete-bucket` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0750 | POST | `/api/tools/s3/delete-object` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0751 | POST | `/api/tools/s3/delete-objects` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0752 | POST | `/api/tools/s3/head-object` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0753 | POST | `/api/tools/s3/list-buckets` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0754 | POST | `/api/tools/s3/list-objects` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0755 | POST | `/api/tools/s3/presigned-url` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0756 | POST | `/api/tools/s3/put-object` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0757 | POST | `/api/tools/sap_concur/proxy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S–/P– | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0758 | POST | `/api/tools/sap_concur/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S–/P– | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0759 | POST | `/api/tools/sap_s4hana/proxy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0760 | POST | `/api/tools/search` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0761 | POST | `/api/tools/secrets_manager/create-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0762 | POST | `/api/tools/secrets_manager/delete-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0763 | POST | `/api/tools/secrets_manager/describe-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0764 | POST | `/api/tools/secrets_manager/get-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0765 | POST | `/api/tools/secrets_manager/list-secrets` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0766 | POST | `/api/tools/secrets_manager/restore-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0767 | POST | `/api/tools/secrets_manager/rotate-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0768 | POST | `/api/tools/secrets_manager/tag-resource` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0769 | POST | `/api/tools/secrets_manager/untag-resource` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0770 | POST | `/api/tools/secrets_manager/update-secret` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0771 | POST | `/api/tools/sendgrid/send-mail` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0772 | POST | `/api/tools/servicenow/upload-attachment` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0773 | POST | `/api/tools/ses/create-configuration-set` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0774 | POST | `/api/tools/ses/create-email-identity` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0775 | POST | `/api/tools/ses/create-template` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0776 | POST | `/api/tools/ses/delete-email-identity` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0777 | POST | `/api/tools/ses/delete-suppressed-destination` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0778 | POST | `/api/tools/ses/delete-template` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0779 | POST | `/api/tools/ses/get-account` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0780 | POST | `/api/tools/ses/get-email-identity` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0781 | POST | `/api/tools/ses/get-suppressed-destination` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0782 | POST | `/api/tools/ses/get-template` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0783 | POST | `/api/tools/ses/list-identities` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0784 | POST | `/api/tools/ses/list-suppressed-destinations` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0785 | POST | `/api/tools/ses/list-templates` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0786 | POST | `/api/tools/ses/put-suppressed-destination` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0787 | POST | `/api/tools/ses/send-bulk-email` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0788 | POST | `/api/tools/ses/send-custom-verification-email` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0789 | POST | `/api/tools/ses/send-email` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0790 | POST | `/api/tools/ses/send-templated-email` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0791 | POST | `/api/tools/ses/update-template` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0792 | POST | `/api/tools/sftp/delete` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0793 | POST | `/api/tools/sftp/download` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0794 | POST | `/api/tools/sftp/mkdir` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0795 | POST | `/api/tools/sftp/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0796 | POST | `/api/tools/sharepoint/download-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0797 | POST | `/api/tools/sharepoint/lists` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0798 | GET | `/api/tools/sharepoint/site` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0799 | POST | `/api/tools/sharepoint/sites` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0800 | POST | `/api/tools/sharepoint/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0801 | POST | `/api/tools/slack/add-reaction` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0802 | POST | `/api/tools/slack/channels` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0803 | POST | `/api/tools/slack/delete-message` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0804 | POST | `/api/tools/slack/download` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0805 | POST | `/api/tools/slack/read-messages` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0806 | POST | `/api/tools/slack/remove-reaction` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0807 | POST | `/api/tools/slack/send-ephemeral` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0808 | POST | `/api/tools/slack/send-message` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0809 | POST | `/api/tools/slack/update-message` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0810 | POST | `/api/tools/slack/users` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0811 | POST | `/api/tools/sms/send` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0812 | POST | `/api/tools/smtp/send` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0813 | POST | `/api/tools/sqs/send` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0814 | POST | `/api/tools/square/catalog-image` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0815 | POST | `/api/tools/ssh/check-command-exists` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0816 | POST | `/api/tools/ssh/check-file-exists` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0817 | POST | `/api/tools/ssh/create-directory` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0818 | POST | `/api/tools/ssh/delete-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0819 | POST | `/api/tools/ssh/download-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0820 | POST | `/api/tools/ssh/execute-command` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0821 | POST | `/api/tools/ssh/execute-script` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0822 | POST | `/api/tools/ssh/get-system-info` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0823 | POST | `/api/tools/ssh/list-directory` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0824 | POST | `/api/tools/ssh/move-rename` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0825 | POST | `/api/tools/ssh/read-file-content` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0826 | POST | `/api/tools/ssh/upload-file` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0827 | POST | `/api/tools/ssh/write-file-content` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0828 | POST | `/api/tools/stagehand/agent` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0829 | POST | `/api/tools/stagehand/extract` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0830 | POST | `/api/tools/sts/assume-role-with-saml` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0831 | POST | `/api/tools/sts/assume-role-with-web-identity` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0832 | POST | `/api/tools/sts/assume-role` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0833 | POST | `/api/tools/sts/get-access-key-info` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0834 | POST | `/api/tools/sts/get-caller-identity` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0835 | POST | `/api/tools/sts/get-session-token` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0836 | POST | `/api/tools/stt` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0837 | POST | `/api/tools/supabase/storage-upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0838 | POST | `/api/tools/telegram/send-document` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0839 | POST | `/api/tools/textract/analyze-expense` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0840 | POST | `/api/tools/textract/analyze-id` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0841 | POST | `/api/tools/textract/parse` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0842 | POST | `/api/tools/thinking` | 共有同实现 | Integration Tool Adapter | Manual review | S✓/P✓ | S–/P– | Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0843 | POST | `/api/tools/tiktok/upload-video-draft` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S✓/P✓ | Auth, Executor, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0844 | POST | `/api/tools/trello/boards` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0845 | POST | `/api/tools/tts` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0846 | POST | `/api/tools/tts/unified` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0847 | POST | `/api/tools/twilio/get-recording` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0848 | POST | `/api/tools/typeform/files` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0849 | POST | `/api/tools/uptimerobot/create-psp` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0850 | POST | `/api/tools/uptimerobot/update-psp` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0851 | POST | `/api/tools/vanta/download` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0852 | POST | `/api/tools/vanta/query` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0853 | POST | `/api/tools/vanta/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0854 | POST | `/api/tools/video` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Executor, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0855 | POST | `/api/tools/vision/analyze` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage, External SDK | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0856 | GET | `/api/tools/wealthbox/item` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0857 | GET | `/api/tools/wealthbox/items` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0858 | POST | `/api/tools/webflow/collections` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0859 | POST | `/api/tools/webflow/items` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0860 | POST | `/api/tools/webflow/sites` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0861 | POST | `/api/tools/whatsapp/get-media` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Executor, Runtime, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0862 | POST | `/api/tools/whatsapp/send-media` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0863 | POST | `/api/tools/whatsapp/upload-media` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0864 | POST | `/api/tools/wordpress/upload` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0865 | POST | `/api/tools/workday/assign-onboarding` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0866 | POST | `/api/tools/workday/change-job` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0867 | POST | `/api/tools/workday/create-prehire` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0868 | POST | `/api/tools/workday/get-compensation` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0869 | POST | `/api/tools/workday/get-organizations` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0870 | POST | `/api/tools/workday/get-worker` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0871 | POST | `/api/tools/workday/hire` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0872 | POST | `/api/tools/workday/list-workers` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0873 | POST | `/api/tools/workday/terminate` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0874 | POST | `/api/tools/workday/update-worker` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Runtime | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0875 | POST | `/api/tools/zoom/get-recordings` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S✓/P✓ | S–/P– | Auth, Security, Storage | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0876 | POST | `/api/tools/zoom/meetings` | 共有同实现 | Integration Tool Adapter | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |
| API-0877 | POST | `/api/tools/zoominfo/proxy` | 共有同实现 | Integration Tool Adapter | Internal/Hybrid | S–/P– | S–/P– | Auth, Security | API Integration Adapter + shared Worker runtime | W4 | High | CADIS |

### usage

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0878 | GET,PUT | `/api/usage` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |

### users

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0879 | DELETE | `/api/users/me/api-keys/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0880 | GET,POST | `/api/users/me/api-keys` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0881 | GET,PATCH | `/api/users/me/profile` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0882 | GET,PATCH | `/api/users/me/settings` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0883 | GET,POST | `/api/users/me/settings/unsubscribe` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W3 | Medium | CADI |
| API-0884 | POST | `/api/users/me/subscription/[id]/transfer` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-0885 | GET | `/api/users/me/usage-limits` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-0886 | GET | `/api/users/me/usage-logs/export` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API File Module | W3 | High | CADISB |
| API-0887 | GET | `/api/users/me/usage-logs` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |

### v1

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0888 | DELETE,GET | `/api/v1/admin/access-control` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0889 | GET | `/api/v1/admin/audit-logs/[id]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0890 | GET | `/api/v1/admin/audit-logs` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0891 | POST | `/api/v1/admin/credits` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0892 | POST | `/api/v1/admin/dashboard/enterprise-provisioning/[id]/retry` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0893 | POST | `/api/v1/admin/dashboard/enterprise-provisioning` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0894 | GET | `/api/v1/admin/dashboard/global-work` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0895 | POST | `/api/v1/admin/dashboard/organizations/[id]/credits` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0896 | PATCH | `/api/v1/admin/dashboard/organizations/[id]/external-collaborators/[userId]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0897 | PATCH | `/api/v1/admin/dashboard/organizations/[id]/limits` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0898 | DELETE,PATCH | `/api/v1/admin/dashboard/organizations/[id]/members/[memberId]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0899 | GET | `/api/v1/admin/dashboard/organizations/[id]/members/preflight` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0900 | POST | `/api/v1/admin/dashboard/organizations/[id]/members` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0901 | GET | `/api/v1/admin/dashboard/organizations/[id]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0902 | PATCH | `/api/v1/admin/dashboard/organizations/[id]/seats` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0903 | POST | `/api/v1/admin/dashboard/organizations/[id]/transfer-ownership` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0904 | GET | `/api/v1/admin/dashboard/organizations` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0905 | POST | `/api/v1/admin/dashboard/users/[id]/credits` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0906 | GET | `/api/v1/admin/dashboard/users` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0907 | POST | `/api/v1/admin/dashboard/workspaces/[id]/move` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0908 | GET | `/api/v1/admin/dashboard/workspaces/[id]/preflight` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0909 | GET | `/api/v1/admin/dashboard/workspaces` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0910 | GET | `/api/v1/admin/folders/[id]/export` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API File Module | W3 | High | CADISB |
| API-0911 | GET,PATCH | `/api/v1/admin/organizations/[id]/billing` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0912 | PATCH | `/api/v1/admin/organizations/[id]/data-retention` | 仅 Sim2 | Public v1 | Session/Middleware | S✓/P– | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0913 | DELETE,GET,PATCH | `/api/v1/admin/organizations/[id]/members/[memberId]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0914 | GET,POST | `/api/v1/admin/organizations/[id]/members` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0915 | DELETE,GET,PATCH | `/api/v1/admin/organizations/[id]` | 共有已分叉 | Public v1 | Session/Middleware | S✓/P✓ | S✓/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0916 | GET | `/api/v1/admin/organizations/[id]/seats` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0917 | PATCH | `/api/v1/admin/organizations/[id]/session-policy` | 仅 Sim2 | Public v1 | Session/Middleware | S✓/P– | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0918 | POST | `/api/v1/admin/organizations/[id]/transfer-ownership` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0919 | PATCH | `/api/v1/admin/organizations/[id]/whitelabel` | 仅 Sim2 | Public v1 | Session/Middleware | S✓/P– | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0920 | GET,POST | `/api/v1/admin/organizations` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0921 | POST | `/api/v1/admin/outbox/[id]/requeue` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0922 | GET | `/api/v1/admin/outbox` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0923 | GET,POST | `/api/v1/admin/referral-campaigns` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth, External SDK | API Public v1 | W3 | Medium | CADI |
| API-0924 | DELETE,GET | `/api/v1/admin/subscriptions/[id]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0925 | GET | `/api/v1/admin/subscriptions` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0926 | GET,PATCH | `/api/v1/admin/users/[id]/billing` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0927 | GET | `/api/v1/admin/users/[id]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0928 | GET | `/api/v1/admin/users` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0929 | DELETE,POST | `/api/v1/admin/workflows/[id]/deploy` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0930 | GET | `/api/v1/admin/workflows/[id]/export` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API File Module | W3 | High | CADISB |
| API-0931 | DELETE,GET | `/api/v1/admin/workflows/[id]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0932 | POST | `/api/v1/admin/workflows/[id]/versions/[versionId]/activate` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W3 | Medium | CADI |
| API-0933 | GET | `/api/v1/admin/workflows/[id]/versions` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Public v1 | W2 | Medium | CADI |
| API-0934 | POST | `/api/v1/admin/workflows/export` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API File Module | W3 | High | CADISB |
| API-0935 | POST | `/api/v1/admin/workflows/import` | 共有已分叉 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0936 | GET | `/api/v1/admin/workflows` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0937 | GET | `/api/v1/admin/workspaces/[id]/export` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API File Module | W3 | High | CADISB |
| API-0938 | GET | `/api/v1/admin/workspaces/[id]/folders` | 共有已分叉 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0939 | POST | `/api/v1/admin/workspaces/[id]/import` | 共有已分叉 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0940 | DELETE,GET,PATCH | `/api/v1/admin/workspaces/[id]/members/[memberId]` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0941 | DELETE,GET,POST | `/api/v1/admin/workspaces/[id]/members` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0942 | GET | `/api/v1/admin/workspaces/[id]` | 共有已分叉 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0943 | DELETE,GET | `/api/v1/admin/workspaces/[id]/workflows` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W3 | Medium | CADI |
| API-0944 | GET | `/api/v1/admin/workspaces` | 共有同实现 | Public v1 | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Public v1 | W2 | Medium | CADI |
| API-0945 | GET | `/api/v1/audit-logs/[id]` | 共有同实现 | Public v1 | API Key/Middleware | S✓/P✓ | S✓/P✓ | DB | API Public v1 | W2 | Medium | CADI |
| API-0946 | GET | `/api/v1/audit-logs` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S✓/P✓ | Pure/other | API Public v1 | W2 | Medium | CADI |
| API-0947 | POST | `/api/v1/copilot/chat` | 共有同实现 | Public v1 | API Key/Middleware | S–/P– | S✓/P✓ | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0948 | DELETE,GET | `/api/v1/files/[fileId]` | 共有已分叉 | File/Binary | API Key/Middleware | S✓/P✓ | S✓/P– | Storage | API File Module | W3 | High | CADISB |
| API-0949 | GET,POST | `/api/v1/files` | 共有已分叉 | File/Binary | API Key/Middleware | S✓/P✓ | S–/P– | Storage | API File Module | W3 | High | CADISB |
| API-0950 | DELETE,GET | `/api/v1/knowledge/[id]/documents/[documentId]` | 共有已分叉 | File/Binary | API Key/Middleware | S✓/P✓ | S–/P– | DB | API File Module | W3 | High | CADISB |
| API-0951 | GET,POST | `/api/v1/knowledge/[id]/documents` | 共有已分叉 | File/Binary | API Key/Middleware | S✓/P✓ | S✓/P✓ | Storage | API File Module | W3 | High | CADISB |
| API-0952 | DELETE,GET,PUT | `/api/v1/knowledge/[id]` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0953 | GET,POST | `/api/v1/knowledge` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0954 | POST | `/api/v1/knowledge/search` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S✓/P✓ | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0955 | GET | `/api/v1/logs/[id]` | 共有同实现 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | DB | API Public v1 | W2 | Medium | CADI |
| API-0956 | GET | `/api/v1/logs/executions/[executionId]` | 共有同实现 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | DB | API Public v1 | W2 | Medium | CADI |
| API-0957 | GET | `/api/v1/logs` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | DB | API Public v1 | W2 | Medium | CADI |
| API-0958 | DELETE,PATCH,POST | `/api/v1/tables/[tableId]/columns` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0959 | DELETE,GET | `/api/v1/tables/[tableId]` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0960 | DELETE,GET,PATCH | `/api/v1/tables/[tableId]/rows/[rowId]` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | DB | API Public v1 | W3 | Medium | CADI |
| API-0961 | DELETE,GET,POST,PUT | `/api/v1/tables/[tableId]/rows` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0962 | POST | `/api/v1/tables/[tableId]/rows/upsert` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0963 | GET,POST | `/api/v1/tables` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | Pure/other | API Public v1 | W3 | Medium | CADI |
| API-0964 | DELETE,POST | `/api/v1/workflows/[id]/deploy` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S✓/P✓ | Pure/other | API Public v1 | W5 | Medium | CADI |
| API-0965 | GET | `/api/v1/workflows/[id]/export` | 仅 Sim2 | File/Binary | API Key/Middleware | S✓/P– | S✓/P– | Pure/other | API File Module | W5 | High | CADISB |
| API-0966 | POST | `/api/v1/workflows/[id]/rollback` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S✓/P✓ | Pure/other | API Public v1 | W5 | Medium | CADI |
| API-0967 | GET | `/api/v1/workflows/[id]` | 共有同实现 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | DB | API Public v1 | W5 | Medium | CADI |
| API-0968 | POST | `/api/v1/workflows/import` | 仅 Sim2 | Public v1 | API Key/Middleware | S✓/P– | S✓/P– | DB | API Public v1 | W5 | Medium | CADI |
| API-0969 | GET | `/api/v1/workflows` | 共有已分叉 | Public v1 | API Key/Middleware | S✓/P✓ | S–/P– | DB | API Public v1 | W5 | Medium | CADI |

### wand

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0970 | POST | `/api/wand` | 共有同实现 | Streaming | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Stream | API Streaming | W3 | Medium | CADIEP |

### webhooks

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0971 | DELETE,GET,PATCH | `/api/webhooks/[id]` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0972 | POST | `/api/webhooks/agentmail` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S–/P– | DB, External SDK | API Edge Ingress | W7 | Critical | CADISR |
| API-0973 | GET | `/api/webhooks/cleanup/idempotency` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S–/P– | S–/P– | Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0974 | GET | `/api/webhooks/outbox/process` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S–/P– | S–/P– | DB, Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0975 | GET | `/api/webhooks/poll/[provider]` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0976 | GET,POST | `/api/webhooks` | 共有同实现 | Public Callback/Token Edge | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Edge Ingress | W7 | Critical | CADISR |
| API-0977 | POST | `/api/webhooks/slack/custom/[credentialId]` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S–/P– | S✓/P✓ | Pure/other | API Edge Ingress | W7 | Critical | CADISR |
| API-0978 | POST | `/api/webhooks/slack` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S–/P– | S✓/P✓ | Pure/other | API Edge Ingress | W7 | Critical | CADISR |
| API-0979 | POST | `/api/webhooks/tiktok` | 共有同实现 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Executor | API Edge Ingress | W7 | Critical | CADISR |
| API-0980 | GET,POST | `/api/webhooks/trigger/[path]` | 共有已分叉 | Public Callback/Token Edge | Public + signature/token | S✓/P✓ | S✓/P✓ | Runtime | API Edge Ingress | W7 | Critical | CADISR |

### workflows

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-0981 | POST | `/api/workflows/[id]/autolayout` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |
| API-0982 | GET | `/api/workflows/[id]/chat/status` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W5 | Medium | CADI |
| API-0983 | GET | `/api/workflows/[id]/debug/runs/[executionId]` | 仅 Polaris | Core Command/Query | Session/Middleware | S–/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |
| API-0984 | GET | `/api/workflows/[id]/debug/runs` | 仅 Polaris | Core Command/Query | Session/Middleware | S–/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |
| API-0985 | DELETE,GET,PATCH,POST | `/api/workflows/[id]/deploy` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W5 | Medium | CADI |
| API-0986 | GET | `/api/workflows/[id]/deployed` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W5 | Medium | CADI |
| API-0987 | POST | `/api/workflows/[id]/deployments/[version]/revert` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W5 | Medium | CADI |
| API-0988 | GET,PATCH | `/api/workflows/[id]/deployments/[version]` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | DB | API Core Module | W5 | Medium | CADI |
| API-0989 | GET | `/api/workflows/[id]/deployments` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W5 | Medium | CADI |
| API-0990 | POST | `/api/workflows/[id]/duplicate` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |
| API-0991 | POST | `/api/workflows/[id]/execute` | 共有已分叉 | Execution Control | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Executor, Runtime, Security, Storage, Stream | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0992 | POST | `/api/workflows/[id]/executions/[executionId]/cancel` | 共有同实现 | Execution Control | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0993 | GET | `/api/workflows/[id]/executions/[executionId]` | 共有同实现 | Execution Control | Manual review | S✓/P✓ | S–/P– | DB, Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0994 | GET | `/api/workflows/[id]/executions/[executionId]/stream` | 共有已分叉 | Execution Control | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Executor, Stream | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0995 | POST | `/api/workflows/[id]/log` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S✓/P✓ | DB, Executor | API Core Module | W5 | Medium | CADI |
| API-0996 | GET | `/api/workflows/[id]/paused/[executionId]` | 共有同实现 | Execution Control | Manual review | S✓/P✓ | S–/P– | Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0997 | GET | `/api/workflows/[id]/paused` | 共有同实现 | Execution Control | Manual review | S✓/P✓ | S–/P– | Executor | API Execution Ingress + Worker | W6 | Critical | CADIEPRS |
| API-0998 | GET | `/api/workflows/[id]/references` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W5 | Medium | CADI |
| API-0999 | POST | `/api/workflows/[id]/restore` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W5 | Medium | CADI |
| API-1000 | DELETE,GET,PUT | `/api/workflows/[id]` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W5 | Medium | CADI |
| API-1001 | GET,PUT | `/api/workflows/[id]/state` | 共有已分叉 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W5 | Medium | CADI |
| API-1002 | GET | `/api/workflows/[id]/status` | 共有同实现 | Core Command/Query | Manual review | S✓/P✓ | S–/P– | Pure/other | API Core Module | W5 | Medium | CADI |
| API-1003 | GET,POST | `/api/workflows/[id]/variables` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W5 | Medium | CADI |
| API-1004 | PUT | `/api/workflows/reorder` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W5 | Medium | CADI |
| API-1005 | GET,POST | `/api/workflows` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W5 | Medium | CADI |

### workspace-events

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-1006 | GET | `/api/workspace-events/poll` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |

### workspaces

| ID | Methods | Path | 来源 | 类型 | Auth | Contract | 当前测试 | 依赖 | Target | Wave | Risk | 必测 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| API-1007 | DELETE,PUT | `/api/workspaces/[id]/api-keys/[keyId]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1008 | DELETE,GET,POST | `/api/workspaces/[id]/api-keys` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1009 | GET | `/api/workspaces/[id]/background-work` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-1010 | DELETE,GET,POST | `/api/workspaces/[id]/byok-keys` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Security | API Core Module | W3 | Medium | CADI |
| API-1011 | GET | `/api/workspaces/[id]/credit-availability` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-1012 | DELETE,GET,PUT | `/api/workspaces/[id]/environment` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth, Security | API Core Module | W3 | Medium | CADI |
| API-1013 | GET | `/api/workspaces/[id]/files/[fileId]/compiled-check` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Sandbox, Storage | API File Module | W3 | High | CADISB |
| API-1014 | PUT | `/api/workspaces/[id]/files/[fileId]/content` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1015 | GET | `/api/workspaces/[id]/files/[fileId]/csv-preview` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1016 | POST | `/api/workspaces/[id]/files/[fileId]/download` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1017 | POST | `/api/workspaces/[id]/files/[fileId]/restore` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1018 | DELETE,PATCH | `/api/workspaces/[id]/files/[fileId]` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1019 | GET,PUT | `/api/workspaces/[id]/files/[fileId]/share` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1020 | GET | `/api/workspaces/[id]/files/[fileId]/style` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1021 | POST | `/api/workspaces/[id]/files/bulk-archive` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1022 | GET | `/api/workspaces/[id]/files/download` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1023 | POST | `/api/workspaces/[id]/files/folders/[folderId]/restore` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1024 | DELETE,PATCH | `/api/workspaces/[id]/files/folders/[folderId]` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1025 | GET,POST | `/api/workspaces/[id]/files/folders` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1026 | GET | `/api/workspaces/[id]/files/inline` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1027 | POST | `/api/workspaces/[id]/files/move` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1028 | POST | `/api/workspaces/[id]/files/presigned` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1029 | POST | `/api/workspaces/[id]/files/register` | 共有同实现 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1030 | GET,POST | `/api/workspaces/[id]/files` | 共有已分叉 | File/Binary | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth, Storage | API File Module | W3 | High | CADISB |
| API-1031 | GET | `/api/workspaces/[id]/fork/availability` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth, Billing, AWS | API Workspace Forking Module | W2 | Medium | CADI |
| API-1032 | GET | `/api/workspaces/[id]/fork/diff` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-1033 | PUT | `/api/workspaces/[id]/fork/excluded-workflows` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1034 | GET | `/api/workspaces/[id]/fork/lineage` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | DB, Auth | API Workspace Forking Module（native） | W2 | Medium | CADI |
| API-1035 | GET,PUT | `/api/workspaces/[id]/fork/mapping` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1036 | POST | `/api/workspaces/[id]/fork/promote` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1037 | GET | `/api/workspaces/[id]/fork/resources` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-1038 | POST | `/api/workspaces/[id]/fork/rollback` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1039 | POST | `/api/workspaces/[id]/fork` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-1040 | POST | `/api/workspaces/[id]/fork/unlink` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-1041 | GET | `/api/workspaces/[id]/host-context` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-1042 | PATCH | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/files/[fileId]` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1043 | POST | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/files/[fileId]/signatures` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1044 | GET,POST | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/files` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1045 | GET | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1046 | POST | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/steps/[stepId]/complete` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1047 | POST | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/steps/by-code/[stepCode]/complete` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1048 | POST | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/templates/[templateCode]/render` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1049 | POST | `/api/workspaces/[id]/hr/offboarding/cases/[caseId]/workflow-actions` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1050 | GET,POST | `/api/workspaces/[id]/hr/offboarding/cases` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1051 | GET | `/api/workspaces/[id]/hr/offboarding/employees` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1052 | GET | `/api/workspaces/[id]/hr/offboarding/todos` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P– | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1053 | GET | `/api/workspaces/[id]/hr/offboarding/workflows` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1054 | GET,PATCH | `/api/workspaces/[id]/inbox` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1055 | DELETE,GET,POST | `/api/workspaces/[id]/inbox/senders` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1056 | GET | `/api/workspaces/[id]/inbox/tasks` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-1057 | GET | `/api/workspaces/[id]/members` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-1058 | GET | `/api/workspaces/[id]/metrics/executions` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W2 | Medium | CADI |
| API-1059 | GET,PATCH | `/api/workspaces/[id]/permissions` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1060 | GET | `/api/workspaces/[id]/personal-profile` | 仅 Polaris | Core Command/Query | Session/Middleware | S–/P✓ | S–/P– | Auth | API Core Module | W2 | Medium | CADI |
| API-1061 | POST | `/api/workspaces/[id]/pm/assignment-recommendations/[recommendationId]/confirm` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1062 | GET | `/api/workspaces/[id]/pm/assignment-recommendations/[recommendationId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1063 | GET | `/api/workspaces/[id]/pm/assignment-recommendations` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1064 | POST | `/api/workspaces/[id]/pm/assignment-workflows/run` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1065 | POST | `/api/workspaces/[id]/pm/assignments/[assignmentId]/respond` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1066 | POST | `/api/workspaces/[id]/pm/assignments/[assignmentId]/sync-feishu` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1067 | GET | `/api/workspaces/[id]/pm/assignments` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | DB, Auth | API Domain Module | W8 | High | CADIE |
| API-1068 | GET,POST | `/api/workspaces/[id]/pm/capability-profiles` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1069 | POST | `/api/workspaces/[id]/pm/channels/connections/[connectionId]/test` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P✓ | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1070 | POST | `/api/workspaces/[id]/pm/channels/events/[eventId]/replay` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P✓ | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1071 | GET | `/api/workspaces/[id]/pm/channels` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P✓ | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1072 | GET,POST | `/api/workspaces/[id]/pm/connectors/meegle/capabilities` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1073 | POST | `/api/workspaces/[id]/pm/connectors/meegle/projects/sync` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1074 | GET | `/api/workspaces/[id]/pm/context/[manifestId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1075 | POST | `/api/workspaces/[id]/pm/context/assemble` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1076 | GET | `/api/workspaces/[id]/pm/context` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1077 | GET,POST | `/api/workspaces/[id]/pm/document-types` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1078 | PUT | `/api/workspaces/[id]/pm/documents/[documentId]/content` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1079 | PATCH | `/api/workspaces/[id]/pm/documents/[documentId]/parse-status` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1080 | POST | `/api/workspaces/[id]/pm/documents/[documentId]/retry` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1081 | DELETE,GET | `/api/workspaces/[id]/pm/documents/[documentId]` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1082 | POST | `/api/workspaces/[id]/pm/documents/[documentId]/versions` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1083 | GET,POST | `/api/workspaces/[id]/pm/documents` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P– | Auth | API File Module | W3 | High | CADISB |
| API-1084 | POST | `/api/workspaces/[id]/pm/documents/upload` | 仅 Polaris | File/Binary | Session/Middleware | S–/P✓ | S–/P✓ | DB, Auth, Security, Storage | API File Module | W3 | High | CADISB |
| API-1085 | PATCH | `/api/workspaces/[id]/pm/mat/[matId]/items/[itemId]/assignee` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1086 | POST | `/api/workspaces/[id]/pm/mat/[matId]/items/[itemId]/communication` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1087 | POST | `/api/workspaces/[id]/pm/mat/[matId]/meegle-sync` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1088 | DELETE,GET | `/api/workspaces/[id]/pm/mat/[matId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1089 | GET | `/api/workspaces/[id]/pm/mat/[matId]/runs/[runId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1090 | POST | `/api/workspaces/[id]/pm/mat/[matId]/runs/[runId]/stages` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1091 | GET,POST | `/api/workspaces/[id]/pm/mat/[matId]/runs` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1092 | POST | `/api/workspaces/[id]/pm/mat/[matId]/versions/[versionId]/request-review` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1093 | PUT | `/api/workspaces/[id]/pm/mat/[matId]/versions/[versionId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1094 | POST | `/api/workspaces/[id]/pm/mat/[matId]/versions` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1095 | POST | `/api/workspaces/[id]/pm/mat/formal` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1096 | POST | `/api/workspaces/[id]/pm/mat/risk-test-fixture` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1097 | GET,POST | `/api/workspaces/[id]/pm/mat` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1098 | POST | `/api/workspaces/[id]/pm/operations/releases/[releaseId]` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1099 | GET,POST | `/api/workspaces/[id]/pm/operations/releases` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1100 | GET,POST | `/api/workspaces/[id]/pm/operations/runs` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1101 | GET,POST | `/api/workspaces/[id]/pm/operations/test-cases` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1102 | GET,POST | `/api/workspaces/[id]/pm/operations/tests` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1103 | GET | `/api/workspaces/[id]/pm/projects/[projectId]/audit` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1104 | GET | `/api/workspaces/[id]/pm/projects/[projectId]/daily-execution/overview` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1105 | POST | `/api/workspaces/[id]/pm/projects/[projectId]/external-bindings` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1106 | GET | `/api/workspaces/[id]/pm/projects/[projectId]/meegle-sync-runs/[runId]/export` | 仅 Polaris | File/Binary | Manual review | S–/P✓ | S–/P– | Pure/other | API File Module | W3 | High | CADISB |
| API-1107 | GET | `/api/workspaces/[id]/pm/projects/[projectId]/meegle-sync-runs/[runId]` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1108 | GET | `/api/workspaces/[id]/pm/projects/[projectId]/meegle-sync-runs` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1109 | DELETE,GET,PATCH,POST | `/api/workspaces/[id]/pm/projects/[projectId]/members` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1110 | DELETE,GET,PATCH | `/api/workspaces/[id]/pm/projects/[projectId]` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1111 | GET,POST | `/api/workspaces/[id]/pm/projects/[projectId]/workflow-bindings` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1112 | GET,POST | `/api/workspaces/[id]/pm/projects` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P✓ | Auth | API Domain Module | W8 | High | CADIE |
| API-1113 | GET | `/api/workspaces/[id]/pm/repositories/graph` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1114 | GET | `/api/workspaces/[id]/pm/repositories/provider-branches` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1115 | GET | `/api/workspaces/[id]/pm/repositories/provider-projects` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1116 | POST | `/api/workspaces/[id]/pm/repositories/refresh` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1117 | GET | `/api/workspaces/[id]/pm/repositories` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P✓ | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1118 | POST | `/api/workspaces/[id]/pm/repositories/test-connection` | 仅 Polaris | Polaris Business | Manual review | S–/P✓ | S–/P– | Pure/other | API Domain Module | W8 | High | CADIE |
| API-1119 | POST | `/api/workspaces/[id]/pm/system-settings/meegle-auth/init` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P– | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1120 | POST | `/api/workspaces/[id]/pm/system-settings/meegle-auth/poll` | 仅 Polaris | Polaris Business | Session/Middleware | S–/P– | S–/P– | Auth | API Domain Module | W8 | High | CADIE |
| API-1121 | DELETE,GET,PATCH,PUT | `/api/workspaces/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1122 | GET | `/api/workspaces/[id]/usage-gate` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-1123 | POST | `/api/workspaces/invitations/batch` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | Auth | API Core Module | W3 | Medium | CADI |
| API-1124 | GET | `/api/workspaces/invitations` | 共有同实现 | Core Command/Query | Session/Middleware | S–/P– | S✓/P✓ | Auth | API Core Module | W2 | Medium | CADI |
| API-1125 | DELETE | `/api/workspaces/members/[id]` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |
| API-1126 | GET,POST | `/api/workspaces` | 共有同实现 | Core Command/Query | Session/Middleware | S✓/P✓ | S–/P– | DB, Auth | API Core Module | W3 | Medium | CADI |

## 7. 人工校正队列

1. 对 87 个“共有已分叉” Route 做行为差异审阅，禁止默认选择 Polaris 版本。
2. 对 34 个非 Zod/非标准契约 Route 建立 wire contract 或明确协议例外。
3. 对 555 个 Tool Route 按 Provider 分组，提取共享 Adapter 与生成式兼容路由。
4. 对所有 Critical Route 补齐调用方、外部签名、幂等键、重试和回滚语义。
5. 扫描跨目录测试并更新“当前测试”列。
6. 为每个 Wave 生成可独立验收与回滚的实施 tickets。
