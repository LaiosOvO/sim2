# 迁移 W5 Workflow Authoring 全量接口

What to build: 迁移 W5 的 29 条 workflow/custom-block/deployment/definition 接口。
Blocked by: 19, 28
Status: ready-for-agent

## What to build

以 `Wave = W5` 为完整 selector；保留 workflow 数据模型和历史 ID，执行入口只提交 execution intent。

## Acceptance criteria

- selector 精确为 29 条，包含 API-0983/0984 的旧 wire contract 兼容入口。
- authoring、deploy/revert/import/export、variables/state 和 custom block 测试通过。
- workflow module 不直接导入 Executor/Runtime Registry；执行意图经 contract 进入 Worker。
- C/A/D/I/E 及适用 B 测试通过，coverage report 完整。

## Blocked by

19、28。
