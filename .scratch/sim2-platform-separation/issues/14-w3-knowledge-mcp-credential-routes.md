# 迁移 W3 Knowledge、MCP 与 Credential 接口

What to build: 迁移 W3 中 knowledge/mcp/credentials/folders/memory 的 40 条接口。
Blocked by: 10, 11, 12
Status: ready-for-agent

## What to build

按五个顶级领域迁移 command/query，凭证只通过后端 vault/crypto port 访问。

## Acceptance criteria

- selector 精确命中 16 + 12 + 5 + 5 + 2 = 40 条。
- credential 明文不进入响应、日志、事件或客户端 bundle。
- MCP/knowledge 的 DB、向量/对象存储和外部失败路径有集成测试。
- contract/auth/differential/security 测试与 coverage report 通过。

## Blocked by

10、11、12。
