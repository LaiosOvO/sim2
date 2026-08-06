# Workspace Vite 生产网关运行手册

## 目标

生产环境只公开一个同域入口。Vite 构建产物负责 Workspace Home 和已迁移的 Editor Shell；
Node API、Realtime WebSocket 和 Next 兼容面由网关转发，不直接暴露 Vite 开发端口 `5173`。

## 拓扑

```text
Browser
  -> workspace-gateway:8080
       -> Vite static: /workspace/:workspaceId/home
                       /workspace/:workspaceId/w/:workflowId
       -> Node API:    /api/workspace-bootstrap
       -> Realtime:    /socket.io/
       -> Next:        remaining /api, /ingest and compatibility routes
```

宿主机默认只公开 `3000:8080`。API `3012`、Worker `3013`、Realtime `3002` 和 Next `3000`
只在 Compose 网络内 `expose`。

## 构建与启动

要求 Docker/Compose 可用，并准备现有 Sim 所需的数据库、认证、加密和内部服务环境变量：

```powershell
docker compose -f docker-compose.prod.yml build workspace-gateway api worker
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

四个服务与 Workspace 构建环境均固定为 Node `22.20.0`。Bun 只负责安装与构建，Next、
Realtime、API 和 Worker 最终均由
`node --import scripts/runtime/assert-node-22.mjs` 启动；Compose 从当前源码构建对应镜像，
不引用无法追溯源码状态的远端 `latest` 运行镜像。

## 迁移期开关

默认：

```text
WORKSPACE_NEXT_FALLBACK=1
```

此时 `?runtime=next` 可以进入 Next 兼容页面。只有以下条件全部满足后，才允许改为 `0`：

1. Home、Editor、历史 Workflow 和完整工具注册表功能等价通过；
2. 真实数据库和固定账号下三轮 `bun run perf:workspace:real` 通过；
3. Browser/Terminal 在 Sim Desktop 中通过接管、handoff 和资源面板回归；
4. 网关 WebSocket、认证 Cookie、上传和健康检查在目标环境通过。

关闭回退前不要移除 Next 服务；剩余 `/api` 和兼容页面仍依赖它。

## 健康检查

```powershell
curl.exe -fsS http://127.0.0.1:3000/healthz
curl.exe -fsS http://127.0.0.1:3000/api/health
```

还应使用真实登录态验证：

- `/workspace/:workspaceId/home`；
- `/workspace/:workspaceId/w/:workflowId`；
- `/socket.io/` 升级为 WebSocket；
- `?runtime=next` 在回退开启时可达；
- 上传、聊天流、工具审批和代表性 Workflow 执行。

## 本地确定性门禁

```powershell
bun run check:workspace-production-entry
bun run check:workspace-vite
```

第一条静态检查会阻止 `5173` 进入生产配置、阻止对外暴露内部服务端口，并验证网关、
Node 22 镜像和回退开关存在。静态门禁不能替代实际 Docker 构建和部署验证。
