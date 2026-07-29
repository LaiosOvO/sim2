# 深化 Worker-only Runtime Registry

What to build: 将工具执行注册、鉴权、参数解析和 Provider adapter 收口到 Worker-only 深模块。
Blocked by: 03, 04, 05
Status: completed

## What to build

提供按 tool ID 懒加载的窄接口、运行时 capability 查询和 composition 注册，不让 UI metadata 反向依赖执行实现。

## Acceptance criteria

- Runtime Registry 只能从 API composition/Worker server entry 导入。
- 一个代表性 provider 从 job 输入到 adapter 执行完整跑通，历史 tool ID 兼容。
- 未加载 provider 不进入启动闭包；缺失 tool/provider 返回版本化错误。
- Registry 与 Catalog 通过生成期一致性检查关联，不在运行时互相导入。
- 客户端 forbidden-import 检查覆盖所有 registry 入口和间接 re-export。

## Blocked by

03、04、05。

## Implementation evidence

- Worker runtime 对外只提供 `capability`、`execute` 和已加载 Provider 的诊断视图；执行
  binding、credential resolver、输入解析和 Provider loader 藏在 Worker 内；
- `notion_add_database_row_v2` 是首个真实 runtime declaration，历史
  `notion_add_database_row` 作为 alias 从 versioned job 完整执行到 Notion adapter；
- job 只携带 `credentialRef`，Provider 通过 Worker 注入的 `RuntimeCredentialResolver`
  获取 bearer credential，不接受浏览器传入 access token；
- 缺失 tool、缺失 provider、无效 export、无效参数、缺失 credential 和 Provider 执行
  失败均返回 execution contract version 1 的结构化错误；
- Provider loader 使用动态 import，Worker split build 生成 3 个产物；0.49 MB entry 不含
  Notion Provider marker，Provider 独立 chunk 为 3.92 KB；
- Registry declaration 与 Catalog 仅在 CI/生成期比对：1 个 declaration、2 个
  canonical/legacy capability ID 一致；运行时双方没有 import；
- Worker package 没有 exports；public Registry entry 只能由 Worker composition root
  import；browser/API/Catalog 禁入检查和完整 browser closure 均通过，API/Worker 可达
  client root 保持 0；
- Execution contract tests 5/5、Worker tests 7/7、type-check、split build、contract
  generation、module cycle 和 monorepo boundary checks 全部通过。

## Deliberate limit

本 Ticket 只迁移一个代表性 Provider/tool 以固定深模块接口和门禁；旧
`apps/sim/tools/registry.ts` 尚未删除，其他 tool/provider 按后续执行波次逐批迁移，不能
把本 Ticket 误读为 8,000+ 行旧 Registry 已整体退休。
