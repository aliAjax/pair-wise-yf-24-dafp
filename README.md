# 隐私政策差异对比器

纯前端隐私政策版本对比与风险标注工具，用户粘贴两版文本后查看条款差异、风险标签和审阅清单，数据存 localStorage。

## 核心机制：待生效区 + 一次性换为当前结果

为避免「切到新政策版本后差异结果与审阅备注接错对象」以及「两个标签页同时保存时早先算出的表覆盖新表」，每次比较都走以下流程：

1. **放进待生效区**：比较结果先写入 `DiffBatch`（状态 `PENDING`），不直接覆盖当前结果。
2. **按条款段落重新算对应关系**：`utils/diffEngine` 先把文本切成条款段落，再按 `section_no`、归一化标题匹配新旧条款，差异结果与审阅备注都重新挂到新条款上；对不上的审阅备注留在**待处理区**，不进审阅清单。
3. **政策来源指纹**：待生效批次记录 old/new 两版文档正文 + 版次标签的哈希（`utils/fingerprint`）。
4. **一次性换为当前结果**：生效前重新校验指纹，确认「政策来源没动过」才原子切换为 `ACTIVE`；指纹不符则作废批次并留下重试缘由。
5. **标签页并发保护**：生效时比较当前生效批次是否仍是计算时依据的那一版（乐观锁），冲突时作废本批次，早先算出的表不会覆盖新表。
6. **版次一变就作废**：导入新版本文档（版次变更）会把待生效/计算中批次置为 `STALE` 并记录重试缘由；跨标签页通过 `storage` 事件复核指纹。
7. **失败恢复与断点续算**：分段计算进度逐段持久化，计算失败后批次停在 `FAILED` 并保留已算结果；重试只补没做完的部分，原生效批次始终可用。
8. **审阅清单只认生效批次**：`/review` 只展示 `ACTIVE` 批次上的审阅备注；待处理区的备注可重新挂接或丢弃。

## 快速启动

```bash
cp .env.example .env && docker compose up -d
```

## 访问地址或 CLI 示例

前端：<http://localhost:20112>



## 本地开发方式

- 前端：`cd frontend && npm install && npm run dev`



## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia + localStorage |
| 后端 | - |
| 数据库 | 本地模拟数据 |
| 部署 | Docker Compose |

## 项目目录结构

```text
frontend/src/api, stores, types, constants, constructors, components/common, hooks, pages, router, utils, mocks
```

## 环境变量说明

- `COMPOSE_PROJECT_NAME`: Compose 项目名，默认 `policy-diff`
- `FRONTEND_PORT`: 前端端口，默认 `20112`


## Docker 部署说明

- 根 Compose 文件不写 `version`，顶层 `name: policy-diff`。
- 容器名均使用 `${COMPOSE_PROJECT_NAME:-policy-diff}` 前缀。
- 数据库使用命名卷，避免绑定中文路径。
- 常见问题：端口占用时修改 `.env` 中端口后重启；需要重置数据时执行 `docker compose down -v`。

## 枚举/常量出现位置清单

- DiffType: constants/DiffType、types/DiffType、constructors、logTemplates、errorMessages、筛选器、展示组件/控制器均有引用。
- PrivacyRiskLevel: constants/PrivacyRiskLevel、types/PrivacyRiskLevel、constructors、logTemplates、errorMessages、筛选器、展示组件/控制器均有引用。
- ReviewStatus: constants/ReviewStatus、types/ReviewStatus、constructors、logTemplates、errorMessages、筛选器、展示组件/控制器均有引用。
- BatchStatus（PENDING/ACTIVE/STALE/FAILED）: constants/BatchStatus、types/DiffBatch、constructors/DiffBatchConstructor、stores/DiffBatchStore、api/DiffBatch、components/common/StagingPanel、utils/formatters、constants/statusText 均有引用。

## 为什么会牵一发动全身

实体字段、枚举、日志模板、错误消息、构造器、筛选器和展示组件被刻意拆散到多个目录；修改一个状态值通常需要同步类型、构造器、服务、控制器、store、页面、README 与数据库种子。

## License

MIT
