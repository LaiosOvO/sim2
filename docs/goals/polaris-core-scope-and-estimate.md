# Polaris 核心重构范围与工期

更新时间：2026-07-30

## 决策

前端提速与 Polaris 核心迁移不要求立刻原生化 1,126 条 Route。非核心 Sim2 Route
可以继续由 server-only legacy facade 承载；浏览器只能依赖版本化契约和轻量 query。
优先建立少量深 Module，把鉴权、租户、状态机、幂等、Provider 和 Sandbox 实现隐藏在
后端 Interface 后面。

## 当前证据

- 全量严格验收：34/1126（3.0%）。
- 已推送检查点：`f6c3e28cd535`。
- W2 24/95、W5 4/29、W6 3/11 已严格验收；W6 另外 3 条作者门禁全绿，待终审。
- W8 Approval 8 条已有实现，但独立审查仍要求补 resume/effect durability、真实 HTTP、
  hostile PostgreSQL fixture 与最终复审，因此仍不计完成。
- 浏览器到 API/Worker 和 Infra Extension 的闭包为 0；但旧 Executor、Sandbox、
  Registry、DB/Auth、Provider SDK 仍被大量旧 client roots 间接触达，前端提速尚未完成。

## 核心范围

必须完成：

1. Identity/Access 16 条。
2. PM 52 条及真实 Meegle Adapter。
3. Approval 8 条。
4. HR 9 条及相关 3 条文件路径。
5. Delivery/Operations/Risk/Event 23 条。
6. MAT chat 1 条。
7. Node `feishu-ingress`、事件幂等和 Feishu capability Adapter。
8. Node Sandbox 的生产 Adapter、执行/暂停/恢复链。
9. 服务端 Replay/Debug Session、SSE 与浏览器安全投影。
10. Polaris 实际页面的 client closure、冷编译、E2E、灰度和回滚。

暂缓：

- 555 条 Tool Adapter 的全量原生化；未迁部分继续 server-only。
- 与 Polaris 当前页面无关的 Sim2 CRUD、Provider 和管理接口。
- Go 重写、Bun 生产运行时、精确历史 revision replay。
- 通用插件框架和未出现第二个真实 Adapter 的假设性 Seam。

## 工期

| 目标 | 剩余工程量 | 日历时间 |
|---|---:|---:|
| 只解决前端热路径编译/重依赖 | 15–25 人日 | 2–4 周 |
| Polaris 核心 MVP，可内部使用 | 45–70 人日 | 6–9 周 |
| Polaris 核心生产切流 | 70–100 人日 | 9–14 周 |
| 1,126 Route 全量原生化 | 250–400 人日 | 6–12 个月 |

日历时间按三个并行流（Biz、Execution/Infra、Web/Cutover）且有一名负责人持续审查计算。
若串行实施，核心生产切流约需 4–6 个月。

“当前使用”目前按 Polaris 已交付代码和页面推断；接入 30 天访问日志后，可以删除零调用
路径并进一步缩小 PM、Delivery、Risk 和 Operations 范围。
