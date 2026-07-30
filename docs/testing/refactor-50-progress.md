# Sim2 重构各阶段 50% 实施进度

更新时间：2026-07-30

## 验收口径

本表只统计具备真实业务实现、版本化契约、鉴权/租户隔离、兼容性证据、I/O 集成测试、
浏览器边界门禁，并通过独立 agent 审查的功能。路由占位、空 handler、只生成 manifest、
mock-only adapter、仅保留 legacy proxy 均不计入完成数。

API-1009、API-1037、W6 Group A 与 9 条 provider model discovery 路由已通过独立功能
路由审查；W6 Group B 终审已关闭 8 项中的 6 项，外置 payload 可部署闭环和完整 handler
查询预算两项仍在整改。未获 reviewer 明确 `approved` 的接口不进入严格完成数。

## 路由阶段

| 阶段 | 全量 | 50% 目标 | 严格完成 | 待审/复核 | 距离 50% |
|---|---:|---:|---:|---:|---:|
| W1 | 3 | 2 | 3 | 0 | 0 |
| W2 | 95 | 48 | 24 | 0 | 24 |
| W3 | 263 | 132 | 0 | 0 | 132 |
| W4 | 555 | 278 | 0 | 0 | 278 |
| W5 | 29 | 15 | 4 | 0 | 11 |
| W6 | 11 | 6 | 3 | 3 | 3 |
| W7 | 61 | 31 | 0 | 0 | 31 |
| W8 | 109 | 55 | 0 | 0 | 55 |

严格完成合计为 34/1126；W6 Group B 只有在独立审查通过后才可逐条计数。

## 当前并发实施

- W2：API-1009 background work 已通过独立功能路由审查；source-bound Vite raw 为
  97 ms cold / 36 ms incremental。9 条 provider model discovery 路由已通过独立审查，
  关闭真实 consumer、条件懒加载、缓存、URL 容错、有序 wire parity 和 HTTP method parity。
  API-1037 fork resources 已关闭跨租户 folder join、错误体、1000/1001 边界及前端大合同
  问题，并通过独立功能路由审查。
- W4：正在建立生成式 provider adapter/handler/harness；只有绑定真实 provider 语义并完成
  auth、behavior、integration 证据的路由才可计数。
- W5：API-0045/0094/0095/0096 已关闭组织一致性、donor wire 语义、五类 trigger
  projection、真实 query ratchet、method parity、production ownership 和 CI 问题，并通过
  最终独立复审。custom-block hook 为 84,572 gzip bytes，最终复审 compile 为
  132/35 ms；4 条接口已进入严格完成账本。
- W6：API-0282/API-0996/API-0997 已实现真实 read module、production composition、三条薄
  Next facade 与 focused browser contract，并已通过最终独立功能路由审查。第一轮审查发现的
  queue 跨 workflow 混入、auth precedence、DTO 投影、真实 PG fixture、页面 Executor import
  及 final-source-bound 性能证据均已关闭。
  API-0993/API-0138/API-0283 已完成 durable Worker resume 状态推进、真实 API→Worker→
  Sandbox/PG 链、外置 payload 恢复、单 SQL 查询预算、真实页面 consumer 与过渡期
  server-only Executor bridge。最终独立复审已确认其中 6/8 项闭合，但外置 payload 尚缺
  可部署 server endpoint/真实 HTTP 集成，查询预算尚未覆盖完整 payload handler 路径；
  当前按 `changes-required` 整改，批准前仍不计完成。
- W8：Polaris Approvals 的共享契约、Biz 状态机、数据库迁移、API/Worker 生产组合和严格
  Zod proxy 已冻结；8 条 Next facade、focused 页面 consumer、真实 PostgreSQL fixture、
  27 个 focused tests、1000/1000 strict validation 与轻量前端闭包均通过作者验证。独立审查
  已发现 workspace/organization 权限隔离、donor 状态机约束、`canAct`、`pending_for_me`
  过滤顺序、resume/effect 幂等和生产 resume 接收端等阻断，当前为 `changes-required`；
  W8 仍为 0 条严格完成。
- 前端：正在建立冷编译/增量编译、bundle 和 browser dependency closure 基线，并切断一条
  实际的 browser 到 server-heavy module 的依赖链。

## 前端体验基线

当前 browser closure 扫描到 588 个 client roots：

| 重依赖类别 | 可达 client roots | 当前要求 |
|---|---:|---|
| Executor | 270 | 持续下降；最终前端不可达实现，只允许 data-only constants/contracts |
| Execution/Sandbox | 239 | 持续下降；Sandbox 仅 Node Worker |
| Runtime Tools/Blocks/Triggers | 197 | 前端只保留生成的 metadata catalog |
| Database/Auth/Secrets | 71 | 降为 0 |
| Server Crypto/Provider SDK | 190 | 降为 0 |
| Infra extensions | 0 | 保持 0 的硬门禁 |
| API or Worker implementation | 0 | 保持 0 的硬门禁 |

API-1037 检查点的后端 build 为 1,149 modules、35.52 KiB entry。这个数字不是前端性能
成功指标；前端验收以 client closure、前端 bundle、冷/增量编译时间和页面关键路径测量为准。

首轮真实 Turbopack dev journey 已执行。有效环境下 resume 页面首次请求为 19.77 秒，后续
两次分别为 0.167 秒和 0.134 秒；API facade 首次编译事件为 230.6 ms。它证明热路径已远低于
1 秒，但冷页面仍高于 10 秒目标，不能宣布前端提速任务完成。页面/hook 的 isolated browser
closure 为 84,639 gzip bytes / 107 inputs，且不再触达 Executor、旧 workflow 大合同或
workflow auth middleware。Next trace collector 的单位错误也已修为 1000 units/ms，并按每次
`start-dev-server` 重置 cold classification。

最终 Resume client 的 source-bound Vite raw 为 416 ms cold / 149 ms incremental，
当前 ratchet 复跑为 385/131 ms；轻量客户端为 202,347 gzip bytes / 311 inputs，并有专门门禁禁止
重新导入 `lucide-react` 根 barrel。该 focused compile 已达门禁，但 Next 整页 19.77 秒冷启动
仍是未完成的前端体验里程碑。

## 下一验收点

1. 完成 API-1009、API-1037 与 W6 Group A 独立复核，通过后逐条移动到账本严格完成项。
2. 把 resume 冷页面从实测 19.77 秒继续压到 10 秒以内，同时保持热请求小于 1 秒。
3. 完成 W4 第一个真实 provider 批次，确认生成器没有把 provider SDK/Registry 带入浏览器。
4. 固化前端性能原始基线和 ratchet，合入第一条重依赖闭包切断。
5. 每个可回退检查点完成后运行完整门禁、更新本表、提交并推送。
