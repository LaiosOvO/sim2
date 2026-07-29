# 固化 Spec、API 清单与迁移基线

What to build: 固化正式 Spec、1,126 API 清单、目标工程目录、模块对齐表、upstream 状态与本 ticket 图。
Blocked by: 无
Status: completed

## What to build

验证所有规划文档互相引用一致，并把当前 Sim2/Polaris commit、分支、统计口径和性能证据固定为实施基线。

## Acceptance criteria

- API 清单恰有 1,126 个唯一 `API-nnnn`，W1–W8 数量分别为 3/95/263/555/29/11/61/109。
- Spec 完整包含目标工程目录、依赖方向、测试策略、Replay/Debug、Biz/Infra 与 upstream 同步规则。
- 模块对齐表能从 upstream/Polaris 当前模块映射到唯一目标模块与同步方式。
- 本目录所有 blocker 存在且依赖图无环。
- 文档通过 Markdown/code-fence/JSON/`git diff --check` 校验并完成 Phase 0 commit/push。

当前证据：Phase 0 commit `98a10537d` 已完成并推送到
`origin/codex/frontend-backend-refactor`。

## Blocked by

无。
