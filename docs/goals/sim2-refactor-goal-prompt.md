# Sim2 Refactor Goal Prompt

将下面内容完整复制到 Codex Goal：

```text
目标：
在目标工作区 D:\workspace\workflow\sim2-refactor 中，严格按照正式 Spec 渐进完成 Sim2
前后端分离、Runtime Registry/Catalog 解耦、独立 TypeScript API、独立 TypeScript
Execution Worker、后端 Sandbox，以及 Polaris 全量业务能力迁移。持续推进，直到当前
Spec 对应的实施 tickets 全部完成、测试和性能验收通过，或遇到必须由用户决定的真实阻塞。

路径与角色：
1. 唯一允许写入的目标工作区：
   D:\workspace\workflow\sim2-refactor

2. Sim2 参考底座与持续同步来源，只读：
   D:\workspace\workflow\sim2
   Git upstream: https://github.com/LaiosOvO/sim2.git
   branch: main

3. Polaris 二开能力来源，只读：
   D:\polaris
   Polaris 是 behavior/test donor，不是目标底座，不允许整仓复制或合并无共同祖先历史。

执行前必须阅读：
- D:\workspace\workflow\sim2-refactor\AGENTS.md
- D:\workspace\workflow\sim2-refactor\CONTEXT.md
- D:\workspace\workflow\sim2-refactor\docs\refactor-index.md
- D:\workspace\workflow\sim2-refactor\docs\specs\sim2-platform-separation-and-polaris-migration.md
- D:\workspace\workflow\sim2-refactor\docs\architecture\target-engineering-structure-and-migration-plan.md
- D:\workspace\workflow\sim2-refactor\docs\architecture\api-migration-inventory.md
- D:\workspace\workflow\sim2-refactor\docs\migration\module-alignment-matrix.md
- D:\workspace\workflow\sim2-refactor\docs\migration\upstream-sync-state.json
- D:\workspace\workflow\sim2-refactor\.scratch\sim2-platform-separation\README.md
- D:\workspace\workflow\sim2-refactor\.scratch\sim2-platform-separation\issues

核心约束：
- 以 Sim2 Git 历史为基础，保持与 Sim2 main 的定期同步能力。
- 所有实现、文档更新和测试只写入 sim2-refactor worktree。
- 每次发现新的依赖、行为差异、风险或迁移结论，立即写回对应 Markdown。
- 按 grill-with-docs -> to-spec -> to-tickets -> implement -> handoff 流程工作。
- 当前 Spec 与 46 个实施 tickets 已生成；严格从 `Blocked by` 已满足的工作前沿取 ticket，
  不跳过依赖，不重复规划已经固化的范围。
- 每完成一个 ticket，更新它的 Status、验收证据与 handoff；每完成一个 Phase，独立 commit
  并 push 到 `origin/codex/frontend-backend-refactor`。
- 允许渐进迁移和灰度切流，但必须覆盖 API inventory 的全部 1,126 个 Route、
  1,377 个 handler；不得只迁移代表性接口。
- W1-W8 每个波次必须生成 machine-readable coverage manifest，按 API ID 证明数量正确、
  分区互斥且无遗漏；最终合集必须恰为 1,126。
- 87 个 Sim2/Polaris 已分叉 Route 必须逐条做 differential review。
- 保留 Sim2 全量 Integration 的服务端执行能力和历史 Tool/Block/Trigger ID 兼容。
- Web 不得直接或传递导入 Runtime Registry、Executor、Sandbox、Provider SDK、DB、
  服务端 Auth、凭证或加密实现。
- Tool Catalog 只包含可序列化 metadata，并分页、搜索、按需加载。
- Runtime Registry 只在 Worker 中按 Integration 懒加载。
- PM、HR、Identity、Approval、Delivery、Risk、Operations 属于 Biz。
- Feishu、Meegle、LLM Provider、对象存储、代码托管和 Sandbox 属于 Infra。
- Biz 只依赖 capability interface；只有 Composition Root 可以绑定具体 Adapter。
- Replay/Debug 必须迁为 API/Worker 持有的服务端 Debug Session；浏览器只持有 session ID、
  安全投影和事件游标。
- 第一阶段保持 Next 16 + Turbopack，不把 Vite 当成 Next 的 bundler 替换。
- 不以删除 Integration、降低鉴权、减少租户隔离或跳过测试换取性能。
- 不修改 D:\polaris 和 D:\workspace\workflow\sim2 中的用户工作区。
- 不覆盖或清理任何不属于本任务的已有改动。

实施顺序：
1. 从 Ticket 02 开始建立目标目录、import graph、独立构建和性能基线。
2. 建立 api-contracts、execution-contracts、Tool Catalog 和边界 CI。
3. 建立独立 API/Worker skeleton、后端 Sandbox 与同域兼容代理。
4. 按 tickets 定义的 P1-P8/W1-W8 分区迁移，并持续更新逐 Route 状态。
5. 按 Module Alignment Matrix 与 Tickets 35-42 迁移 Polaris Biz/Infra。
6. 按 Tickets 43-44 迁移 Replay/Debug、Executor 和 Sandbox 到 Worker。
7. 对每个 Wave 执行 contract、auth、differential、integration、security、performance、
   E2E 和 rollback 验收。
8. 每次同步 Sim2 main 时更新 upstream baseline、影响报告和模块对齐状态。
9. 每个完成 ticket 写 handoff；全部完成后给出剩余旧代码、性能对比和最终切流报告。

完成标准：
- Spec 中所有目录和 Module interface 已建立，且没有重复所有者。
- API inventory 全部 handler 有完成状态和测试证据。
- Web 到服务端运行时模块的传递依赖为 0。
- 普通页面不加载完整 Tool/Block/Trigger registry。
- Web、API、Worker、Realtime 可以独立构建和部署。
- Safe Replay 对已复用节点产生 0 次 Provider 副作用。
- Sim2 历史 workflow 兼容测试通过。
- Polaris PM/HR/Identity/Approval/Delivery/Risk/Operations 能力通过验收。
- Sim2 main 同步流程至少完成一次演练并更新 baseline。
- 所有完成 ticket 均有 handoff，所有未完成项均有明确阻塞或后续 ticket。
```
