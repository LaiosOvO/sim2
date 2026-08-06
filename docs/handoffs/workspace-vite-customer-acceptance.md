# Workspace Vite 客户环境验收交付说明

## 交付结论

Sim2 Node 22 启动链路、Workspace Vite Home、Workflow Editor、Tool Catalog、Runtime
Registry 边界、Realtime 协作、生产统一网关和验收采集器均已完成，代码具备 GitHub 交付条件。

交付方当前没有客户数据库、固定验收账号、Sim Desktop 和 Docker 运行环境，因此真实三轮 SLA、
桌面实机和生产部署验证由客户在目标环境执行。该状态定义为：

```text
研发实现：完成
确定性验证：完成
GitHub 交付：就绪
客户环境验收：待客户执行
Next 兼容回退：保持开启
```

## 已完成范围

- Next、Realtime、API、Worker 使用 Node.js 22.19+ 实际运行，Bun 仅负责安装、构建和调度；
- Workspace Home 与 Workflow Editor 已建立独立 Vite 浏览器边界；
- 313/313 Catalog Block 具备浏览器安全创建模板，复杂字段和深层 Builder 按需加载；
- Tool Catalog 与 Worker-only Runtime Registry 分离，客户端不加载 Provider SDK、DB/Auth、
  Sandbox 或服务端加密实现；
- Browser/Terminal、语音、上传、Tool Call、审批、Realtime 协作、结构化 HITL、Undo/Redo
  等能力已接入动态模块；
- Nginx 生产网关统一转发 Workspace、API、WebSocket 和 Next 兼容路由；
- 固定账号、workspace、workflow、三轮冷启动、热刷新、API P95 和 RSS 采集脚本已提供；
- 产品 HTTP API、Tool/Block/Trigger ID 和历史 Workflow 格式保持兼容。

## 客户验收前置条件

- Node.js `22.19.0` 或更高的 Node 22 版本；
- Bun `1.3.13`；
- 可用 PostgreSQL、Redis、认证及加密环境变量；
- 固定测试账号及可复用 workspace/workflow；
- Playwright Chromium；
- Docker/Compose；
- 运行 Sim Desktop 的受支持 macOS 设备。

账号密码只通过环境变量传入，不写入仓库或报告：

```powershell
$env:DATABASE_URL = 'postgresql://user:password@host:5432/simstudio'
$env:PERF_EMAIL = 'perf-user@example.test'
$env:PERF_PASSWORD = '<local-only>'
Remove-Item Env:SIM_MINIMAL_REGISTRY -ErrorAction SilentlyContinue
```

## 验收步骤

### 1. 确定性门禁

```powershell
bun run check:workspace-vite
bun run check:node-runtime-entrypoints
bun run check:browser-runtime-closure
bun run check:catalog-browser-build
bun run check:runtime-registry-boundary
bun run check:worker-role-isolation
bun run check:realtime-prune
```

### 2. 启动真实开发拓扑

```powershell
bun run dev:full
```

确认以下地址成功：

```powershell
curl.exe -fsS http://127.0.0.1:3000/api/health
curl.exe -fsS http://127.0.0.1:3002/health
curl.exe -fsS http://127.0.0.1:3012/api/health
curl.exe -fsS http://127.0.0.1:3013/health
```

### 3. 建立固定旅程并采集三轮 SLA

```powershell
bun run perf:dev:seed
bun run perf:dev:prepare
bun run perf:workspace:real
```

验收门槛：

| 指标 | 门槛 |
| --- | ---: |
| 服务就绪中位数 | `<=30s` |
| Home 与 Editor 冷启动中位数 | `<=10s` |
| 冷启动单轮最大值 | `<=15s` |
| 10 次热刷新 P95 | `<=2s` |
| 关键接口 P95 | `<=1s` 且全部为 2xx |
| 稳定 RSS | `<=4GiB` |

报告位于 `.perf/reports/workspace-real-sla-*.json`。请保留原始样本，不只记录汇总数字。

### 4. 功能回归

使用完整注册表验证登录、Home、Editor、历史 Workflow、工具搜索、上传、语音、审批、聊天流、
Provider Selector、代表性 Workflow 执行、多人 Realtime 协作以及 Undo/Redo。Worker 必须真实消费
任务，不能使用 fixture 代替。

### 5. Desktop 验收

在受支持的 macOS 设备验证 Browser/Terminal 执行、资源面板、接管、恢复和 handoff。完成后才设置：

```powershell
$env:PERF_SIM_DESKTOP_READY = '1'
```

### 6. Docker 生产入口验收

```powershell
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
curl.exe -fsS http://127.0.0.1:3000/healthz
curl.exe -fsS http://127.0.0.1:3000/api/health
```

同时验证登录 Cookie、`/socket.io/` WebSocket 升级、上传、聊天流、工具执行和
`?runtime=next` 回退入口。

### 7. 最终前置报告

```powershell
bun run perf:workspace:readiness
```

`readiness=ready` 表示环境前置条件齐全；最终通过仍需同时保存真实 SLA、功能回归、Desktop
和 Docker 验收记录。

## 切流与回退

客户验收前保持：

```text
WORKSPACE_NEXT_FALLBACK=1
```

客户验收全部通过后，可以切换为 `0`。如果出现兼容性、认证、WebSocket、上传或性能问题，立即
恢复为 `1`，并通过 `?runtime=next` 进入兼容页面。剩余 API 和兼容页面仍使用 Next，因此不要在
本次验收中删除 Next 服务。

## 验收结果回传

请回传以下内容：

- 测试源码 SHA、Node/Bun 版本和机器配置；
- `.perf/reports/workspace-real-sla-*.json`；
- 失败请求状态码和服务日志；
- Desktop 与 Docker 验收结果；
- 是否允许将 `WORKSPACE_NEXT_FALLBACK` 从 `1` 切换为 `0`。

若未达到门槛，请保留失败样本并标明发生在编译、API、数据库、浏览器渲染、Worker、Realtime
或网关中的哪一层，避免把所有延迟统一归因于 Next.js。
