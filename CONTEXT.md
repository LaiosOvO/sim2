# Polaris Domain Glossary

## Target Platform（目标平台）

完成前后端 seam 重构后的 Sim2。目标平台继承 Sim2 的产品能力和代码历史，是后续承载
Polaris 业务能力的最终系统。

## Migration Source（迁移来源）

现有 Polaris 实现。迁移来源用于识别、验证和迁移已经完成的业务能力，但不作为新架构
底座，也不通过整仓复制进入目标平台。

## Execution Sandbox（执行沙箱）

在受隔离环境中运行用户代码、Agent 生成代码、文档生成任务或仓库操作的后端能力。
执行沙箱负责资源限制、超时、取消、输入挂载、结果回收和强制清理。它不属于浏览器，
也不向浏览器暴露执行 Provider、运行时句柄、凭证或内部任务注册表。

## Preview Isolation（预览隔离）

浏览器使用 `iframe sandbox`、CSP 等机制隔离文件或 HTML 预览内容的前端安全能力。
预览隔离不是执行沙箱。

## Exercise Constraints（练习约束）

在教学或练习场景中限制用户可选择 Block 的产品规则。练习约束只控制编辑器行为，
不负责执行代码，也不是执行沙箱。

## Tool Catalog（工具目录）

供界面搜索、展示、编辑和轻量校验使用的可序列化工具描述集合。工具目录不包含执行函数、
Provider SDK、凭证处理、网络请求、数据库访问或其他服务端能力。

## Runtime Registry（运行时注册表）

后端将稳定工具标识解析到执行实现的内部机制。运行时注册表不属于产品展示模型，
也不允许被浏览器代码导入。

## Execution Compatibility（执行兼容）

目标平台能够加载并执行由 Sim2 已有稳定 Tool、Block 和 Trigger 标识保存的历史工作流。
执行兼容不要求浏览器一次加载全部 Integration，也不要求前端导入 Runtime Registry。

## Execution Replay（执行回放）

基于一个历史 execution 的输入、成功节点输出和可恢复执行快照创建一次新的执行。画布回放
默认保持 Polaris 当前语义：在当前 draft 画布上运行，并允许从开头或失败节点开始。`safe`
模式复用历史成功输出，不产生对应 Provider 副作用；`live` 模式允许真实外部副作用。

## Debug Session（调试会话）

由 API 与 Execution Worker 持有的服务端权威状态，用于暂停、单步、继续和取消画布执行。
浏览器只持有 `debugSessionId`、状态投影、下一节点摘要和事件游标，不持有 `Executor`、
`ExecutionContext` 或可恢复执行快照。

## Stream Replay（传输流重放）

SSE/事件流断线重连后，服务端按事件游标补发 Redis replay buffer 中的执行事件。它只恢复
传输，不会重新执行工作流，也不是画布 Execution Replay。

## Channel Event Replay（渠道事件重放）

对已经接收并持久化的 Feishu 等渠道事件重新执行归一化、路由与业务处理。它需要事件幂等
与审计，但不是画布 Execution Replay，也不能复用 Debug Session 的执行语义。

## Upstream Baseline（上游基线）

目标平台最近一次完整吸收并验证过的 Sim2 `main` 提交。后续上游同步只处理该提交到新
`main` 之间的变化，并在验证完成后推进基线。

## Module Alignment（模块对齐）

将 Sim2 上游模块或 Polaris 迁移来源映射到目标平台所有者 Module 的持续记录。模块对齐
说明变化应直接合并、适配、拆分迁移还是忽略，但不改变目标 Module 的领域所有权。

## Compatibility Facade（兼容门面）

在渐进迁移期间保持旧调用 interface 的薄层。兼容门面只做协议转换、转发和错误映射，
不拥有业务规则、执行状态或 Provider 实现，并在调用方完成迁移后删除。
