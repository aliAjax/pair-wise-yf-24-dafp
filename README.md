# 隐私政策差异对比器

纯前端隐私政策版本对比与风险标注工具：粘贴两版文本，按条款段落计算差异，差异先进**待生效区**，复核政策来源没被改动后再一次性换为当前结果；数据存 localStorage，支持多标签页并发安全。

## 快速启动

```bash
cp .env.example .env && docker compose up -d
```

启动后访问：<http://localhost:20112>

## 核心一致性机制（待生效批次）

每次“发起比较”都会创建一个比较批次 `ComparisonBatch`，状态机为：

```text
COMPUTING（计算中/待生效区）
  ├─ READY（待生效，等待人工确认）
  │    └─ COMMITTING → COMMITTED（原子替换当前结果）
  ├─ FAILED（计算失败：已完成段落保留，重试只补缺口）
  └─ INVALIDATED（版次/来源变化作废，带 retry_reason 重试缘由）
```

- **先进待生效区**：差异结果与批次绑定，COMMITTED 前不覆盖任何当前结果，审阅清单也读不到。
- **按条款段落重算对应关系**：以 `section_no` 为主键对齐新旧段落，辅以同标题/正文的 MOVED 兜底；差异类型为 ADDED / REMOVED / MODIFIED / MOVED / UNCHANGED。
- **生效双闸门**：提交时重新计算两份来源文档的内容指纹（文档字段 + 全量段落），并校验建批时锁存的“生效基线批次”未变；任一不满足 → 当前批次作废并返回 `SOURCE_VERSION_CHANGED` / `BASELINE_CONFLICT`，旧表绝不覆盖新表。
- **原子换表**：差异结果、批次状态、审阅备注在同一个跨标签页写锁 + CAS 版本号事务内一次性落盘。
- **版次一变即作废**：编辑文档版次、标题或正文（`documentService`）会把引用该文档的全部非终态批次置为 INVALIDATED 并写入人可读的重试缘由。
- **失败可恢复**：每算完一个段落立即增量落盘；FAILED 后重试只处理 `completed_sections` 之外的段落，已算出的结果原样保留，预留的行 id 复用，不产生重复行。
- **备注重映射**：批次生效时沿版次链把旧批次备注按 `(old_section_id, new_section_id)` 与段落号重新挂载；对不上段落的备注标记 `ORPHANED` 进**待处理区**，只能人工重新指定生效差异行或忽略，永远不进入审阅清单。审阅清单只查询 **COMMITTED 批次 + MATCHED 备注**。
- **多标签页**：每个集合带单调 `version`，写入走乐观锁 CAS（`STORAGE_WRITE_STALE`）；全局互斥锁保护原子换表；`storage` 事件驱动各 store 自动刷新。

故障演练：浏览器控制台执行 `globalThis.__POLICY_DIFF_FAIL_KEYS__ = ["3"]` 后发起比较，可观察段落 3 失败、批次 FAILED、断点重试只补剩余段落；清空 `globalThis.__POLICY_DIFF_FAIL_KEYS__ = []` 后重试即恢复。

## 访问地址或 CLI 示例

- 前端：<http://localhost:20112>
- 页面：文档导入 `/documents`、版本对比 `/compare`、风险标注 `/risks`、审阅清单 `/review`

## 本地开发方式

```bash
cd frontend
npm install
npm run dev        # http://localhost:20112
npm test           # 生命周期自测（29 断言）+ 四页面 SSR 冒烟
npm run build      # vue-tsc 类型检查 + vite 构建
```

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | Vue 3 + TypeScript + Vite + Element Plus + Pinia + vue-router |
| 耗时计算 | Web Worker（`src/workers/diffWorker.ts`，Node/测试环境自动降级同步） |
| 数据 | localStorage（CAS 版本号 + 全局写锁），本地种子数据 |
| 部署 | Docker Compose（Nginx 托管 SPA） |

## 项目目录结构

```text
frontend/src/
├── api/            # 按模型分文件的本地持久化 API；storage.ts 提供 CAS/锁/跨标签页事件
├── stores/         # Pinia 独立 store（5 个，含 ComparisonBatchStore）
├── types/          # 数据模型类型
├── constants/      # 枚举、日志模板、错误码/错误消息、状态文案
├── constructors/   # 默认对象/表单对象/响应对象构造器
├── controllers/    # 控制器层，二次包装 DomainError 为 ControllerError
├── services/       # 比较批次编排、段落对齐、来源指纹、备注重映射、文档导入、风险标注
├── workers/        # 差异计算 Web Worker
├── hooks/          # useComparisonRun / useTextDiff / usePolicyParser / useLocalStorageState
├── components/common/  # ImportPanel、DiffViewer、RiskTag、ReviewChecklist、SectionCard 等
├── pages/          # Documents / Compare / Risks / Review 四个路由页面
├── router/         # vue-router 路由
├── utils/          # hash、id、logger、exceptions、混合 formatters
└── mocks/          # 种子数据（两份隐私政策 + 1 个生效批次 + 1 条备注）
```

## 环境变量说明

- `COMPOSE_PROJECT_NAME`: Compose 项目名，默认 `policy-diff`
- `FRONTEND_PORT`: 前端端口，默认 `20112`

## Docker 部署说明

- 根 Compose 文件不写 `version`，顶层 `name: policy-diff`。
- 容器名：`${COMPOSE_PROJECT_NAME:-policy-diff}-frontend`；端口映射 `${FRONTEND_PORT:-20112}:80`。
- 纯前端无数据库卷；数据保存在浏览器 localStorage，重置数据在浏览器内清理站点数据即可。
- 常见问题：端口占用时修改 `.env` 中端口后 `docker compose up -d`；镜像重建用 `docker compose build --no-cache frontend`。
- `frontend/Dockerfile` 为多阶段构建（node 构建 → nginx 托管）；`nginx.conf` 含 `try_files $uri $uri/ /index.html;`，任意目录名（含中文）均可启动。

## 枚举/常量出现位置清单

- **DiffType**（ADDED/REMOVED/MODIFIED/MOVED/UNCHANGED）：`constants/DiffType.ts`、`types/DiffType.ts`、`constructors/DiffResultConstructor.ts`、`services/sectionAlignment.ts`（构造/匹配）、`services/noteRelink.ts`（备注映射过滤）、`constants/logTemplates.ts`、`constants/errorMessages.ts`、`pages/ComparePage.vue`（筛选器）、`components/common/DiffViewer.vue`（展示徽标）、`components/common/ReviewChecklist.vue`、`hooks/useTextDiff.ts`。
- **PrivacyRiskLevel**（LOW/MEDIUM/HIGH/CRITICAL）：`constants/PrivacyRiskLevel.ts`、`types/PrivacyRiskLevel.ts`、`constructors/PolicySectionConstructor.ts`、`services/documentService.ts`（风险猜测）、`services/riskService.ts`、`constants/statusText.ts`、`utils/formatters.ts`、`pages/RisksPage.vue`（筛选器/按钮）、`components/common/RiskTag.vue`、`SectionCard.vue`。
- **ReviewStatus**（OPEN/CONFIRMED/IGNORED/RESOLVED）：`constants/ReviewStatus.ts`、`types/ReviewStatus.ts`、`constructors/ReviewNoteConstructor.ts`、`services/reviewNoteService.ts`（清单过滤/状态流转）、`constants/statusText.ts`、`utils/formatters.ts`、`pages/ReviewPage.vue`（筛选器）、`components/common/ReviewChecklist.vue`（徽标/下拉）。
- **BatchStatus**（COMPUTING/READY/COMMITTING/COMMITTED/FAILED/INVALIDATED）：`constants/BatchStatus.ts`、`types/ComparisonBatch.ts`、`constructors/ComparisonBatchConstructor.ts`、`services/comparisonService.ts`（状态机）、`stores/ComparisonBatchStore.ts`、`hooks/useComparisonRun.ts`、`controllers/comparisonController.ts`、`constants/logTemplates.ts`（7 条批次日志）、`constants/errorCodes.ts`/`errorMessages.ts`（作废/不可生效/基线冲突/计算中）、`utils/formatters.ts`、`pages/ComparePage.vue` 与 `pages/DocumentsPage.vue`（徽标/进度/重试缘由）、`components/common/StatusBadge.vue`。
- **BatchRetryReason**（SOURCE_VERSION_CHANGED/BASELINE_COMMITTED/BASELINE_REPLACED/CALCULATION_FAILED）：`constants/BatchStatus.ts`、`types/ComparisonBatch.ts`、`services/comparisonService.ts`（作废写入）、`constants/errorMessages.ts`、`utils/formatters.ts`、`pages/ComparePage.vue`（重试缘由列）。
- **ReviewNoteLinkStatus**（MATCHED/ORPHANED）：`constants/ReviewNoteLinkStatus.ts`、`types/ReviewNote.ts`、`constructors/ReviewNoteConstructor.ts`、`services/noteRelink.ts`、`services/reviewNoteService.ts`（清单只认 MATCHED；ORPHANED 待处理区）、`components/common/ReviewChecklist.vue`、`pages/ReviewPage.vue`。

## 为什么会牵一发动全身

- 枚举在 `constants/` 与 `types/` 双份定义，新增一个枚举值需要同步构造器、服务匹配、日志模板、错误消息、formatters/statusText、列表筛选器与展示徽标。
- 批次生命周期被 `comparisonService`、controller、store、hook、对比页和备注/文档服务共同引用；批次状态或换表顺序变化会同时影响差异行、备注重映射与审阅清单。
- 写操作统一走 `api/storage.ts` 的 CAS 与全局锁，任何集合结构调整都要同步版本断言、原子换表列表与跨标签页事件订阅。
- `utils/formatters.ts` 故意混合日期、数字、风险、批次状态、重试缘由、备注挂载状态等格式化逻辑，被多页面和共享组件共同依赖。

## License

MIT
