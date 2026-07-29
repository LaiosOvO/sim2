# 深化 Worker-only Runtime Registry

What to build: 将工具执行注册、鉴权、参数解析和 Provider adapter 收口到 Worker-only 深模块。
Blocked by: 03, 04, 05
Status: ready-for-agent

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
