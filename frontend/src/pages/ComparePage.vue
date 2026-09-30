<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import DiffViewer from "../components/common/DiffViewer.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import StatCard from "../components/common/StatCard.vue";
import EmptyState from "../components/common/EmptyState.vue";
import { usePolicyDocumentStore } from "../stores/PolicyDocumentStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import { useDiffResultStore } from "../stores/DiffResultStore";
import { useComparisonBatchStore } from "../stores/ComparisonBatchStore";
import { useComparisonRun } from "../hooks/useComparisonRun";
import { BatchStatus } from "../constants/BatchStatus";
import { DiffType } from "../constants/DiffType";
import { formatDate } from "../utils/formatters";
import type { ComparisonBatch } from "../types/ComparisonBatch";

const docStore = usePolicyDocumentStore();
const sectionStore = usePolicySectionStore();
const diffStore = useDiffResultStore();
const batchStore = useComparisonBatchStore();

onMounted(() => {
  docStore.init();
  sectionStore.init();
  diffStore.init();
  batchStore.init();
});

const oldId = ref<number | null>(null);
const newId = ref<number | null>(null);
const diffFilter = ref<(typeof DiffType)[number] | "ALL">("ALL");
const selectedBatchId = ref<number | null>(null);

const { running, progress, errorMessage, startAndRun, retry, commit } = useComparisonRun();

const documentOptions = computed(() =>
  [...docStore.rows]
    .sort((a, b) => b.imported_at.localeCompare(a.imported_at))
    .map((doc) => ({ id: doc.id, label: `#${doc.id} ${doc.title} ${doc.version_label}` }))
);

watch(documentOptions, (options) => {
  if (oldId.value === null && options.length > 1) oldId.value = options[1]?.id ?? options[0].id;
  if (newId.value === null && options.length > 0) newId.value = options[0].id;
});

const oldDoc = computed(() => docStore.rows.find((doc) => doc.id === oldId.value) ?? null);
const newDoc = computed(() => docStore.rows.find((doc) => doc.id === newId.value) ?? null);
const oldSections = computed(() => (oldId.value ? sectionStore.byDocument(oldId.value) : []));
const newSections = computed(() => (newId.value ? sectionStore.byDocument(newId.value) : []));

const pairBatches = computed(() =>
  batchStore.rows
    .filter((batch) => batch.old_document_id === oldId.value && batch.new_document_id === newId.value)
    .sort((a, b) => b.id - a.id)
);
const committedBatch = computed(() =>
  batchStore.latestCommitted(oldId.value ?? 0, newId.value ?? 0)
);
watch(
  pairBatches,
  (batches) => {
    const exists = batches.some((batch) => batch.id === selectedBatchId.value);
    if (!exists) selectedBatchId.value = batches[0]?.id ?? null;
  },
  { immediate: true }
);

const selectedBatch = computed<ComparisonBatch | null>(
  () => pairBatches.value.find((batch) => batch.id === selectedBatchId.value) ?? null
);

const stagedRows = computed(() =>
  selectedBatch.value
    ? diffStore.rows
        .filter((row) => row.batch_id === selectedBatch.value?.id)
        .filter((row) => diffFilter.value === "ALL" || row.diff_type === diffFilter.value)
        .sort((a, b) => a.section_no.localeCompare(b.section_no, "zh-CN", { numeric: true }))
    : []
);

const activeRows = computed(() =>
  committedBatch.value
    ? diffStore.rows
        .filter((row) => row.batch_id === committedBatch.value?.id)
        .filter((row) => diffFilter.value === "ALL" || row.diff_type === diffFilter.value)
        .sort((a, b) => a.section_no.localeCompare(b.section_no, "zh-CN", { numeric: true }))
    : []
);

const viewMode = computed<"staging" | "current">(() =>
  selectedBatch.value &&
  (selectedBatch.value.status === BatchStatus[0] ||
    selectedBatch.value.status === BatchStatus[1] ||
    selectedBatch.value.status === BatchStatus[4])
    ? "staging"
    : "current"
);

async function handleStart() {
  if (!oldId.value || !newId.value || oldId.value === newId.value) {
    ElMessage.warning("请选择两个不同版次的文档");
    return;
  }
  const batch = await startAndRun(oldId.value, newId.value);
  if (batch) {
    selectedBatchId.value = batch.id;
    ElMessage.success("差异计算完成，结果已放入待生效区");
  } else if (errorMessage.value) {
    ElMessage.warning(errorMessage.value);
  }
  batchStore.load();
  diffStore.load();
}

async function handleRetry() {
  if (!selectedBatch.value) return;
  const batch = await retry(selectedBatch.value.id);
  if (batch) ElMessage.success("已补算剩余段落，待生效结果就绪");
  else ElMessage.warning(errorMessage.value || "重试失败");
  batchStore.load();
  diffStore.load();
}

async function handleCommit() {
  if (!selectedBatch.value) return;
  try {
    await ElMessageBox.confirm(
      "提交前会重新复核两份政策来源和生效基线，确认未被修改后一次性替换当前结果。继续？",
      "生效确认",
      { type: "warning", confirmButtonText: "确认生效", cancelButtonText: "取消" }
    );
  } catch {
    return;
  }
  if (commit(selectedBatch.value.id)) {
    ElMessage.success("已生效：差异结果与审阅备注已一次性切换");
  } else {
    ElMessage.warning(errorMessage.value);
    batchStore.load();
  }
}

const progressPercent = computed(() => {
  if (!progress.value) return 0;
  return Math.round((progress.value.completed / Math.max(progress.value.total, 1)) * 100);
});

const filterOptions = [{ value: "ALL", label: "全部" }, ...DiffType.map((value) => ({ value, label: value }))];
</script>

<template>
  <section class="page-stack">
    <header class="page-header">
      <h1>版本对比</h1>
      <p>每次比较先进入待生效区，按条款段落对齐；来源确认没动后再一次性换为当前结果。</p>
    </header>

    <el-card>
      <div class="compare-controls">
        <div class="control-group">
          <label>旧版政策</label>
          <el-select v-model="oldId" placeholder="选择旧版" style="width: 260px">
            <el-option v-for="option in documentOptions" :key="`old-${option.id}`" :label="option.label" :value="option.id" />
          </el-select>
        </div>
        <div class="control-arrow">→</div>
        <div class="control-group">
          <label>新版政策</label>
          <el-select v-model="newId" placeholder="选择新版" style="width: 260px">
            <el-option v-for="option in documentOptions" :key="`new-${option.id}`" :label="option.label" :value="option.id" />
          </el-select>
        </div>
        <el-button type="primary" :loading="running" :disabled="!oldId || !newId || oldId === newId" @click="handleStart">
          发起比较
        </el-button>
      </div>
      <el-progress v-if="running && progress" :percentage="progressPercent" :status="progress.status === 'FAILED' ? 'exception' : undefined" />
    </el-card>

    <section class="metrics">
      <StatCard label="当前生效批次" :value="committedBatch ? `#${committedBatch.id}` : '—'" />
      <StatCard label="待生效/计算中" :value="batchStore.pendingBatches.filter((b) => b.old_document_id === oldId && b.new_document_id === newId).length" />
      <StatCard label="已作废" :value="pairBatches.filter((b) => b.status === 'INVALIDATED').length" />
      <StatCard label="生效差异行" :value="activeRows.length" />
    </section>

    <el-card v-if="pairBatches.length">
      <template #header>
        <div class="card-header-between">
          <span>批次记录（待生效区 / 当前结果）</span>
          <el-radio-group v-model="diffFilter" size="small">
            <el-radio-button v-for="option in filterOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>

      <el-table :data="pairBatches" size="small" highlight-current-row @current-change="(row: ComparisonBatch) => row && (selectedBatchId = row.id)">
        <el-table-column prop="id" label="批次" width="70">
          <template #default="{ row }">#{{ row.id }}</template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><StatusBadge kind="batch" :value="row.status" /></template>
        </el-table-column>
        <el-table-column label="进度" width="110">
          <template #default="{ row }">{{ row.completed_sections.length }}/{{ row.diff_row_ids.length }}</template>
        </el-table-column>
        <el-table-column label="基线" width="90">
          <template #default="{ row }">{{ row.baseline_batch_id ? `#${row.baseline_batch_id}` : "无" }}</template>
        </el-table-column>
        <el-table-column label="重试缘由" min-width="220">
          <template #default="{ row }">
            <span v-if="row.status === 'INVALIDATED'">
              <StatusBadge kind="reason" :value="row.retry_reason ?? ''" /> {{ row.retry_detail }}
            </span>
            <span v-else-if="row.status === 'FAILED'" class="retry-detail">{{ row.retry_detail ?? row.last_error }}</span>
            <span v-else-if="row.status === 'COMMITTED'">{{ formatDate(row.committed_at) }} 生效</span>
            <span v-else>来源指纹已锁存，等待生效复核</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'FAILED'"
              size="small"
              type="warning"
              @click.stop="selectedBatchId = row.id; handleRetry()"
            >
              断点重试（补 {{ row.diff_row_ids.length - row.completed_sections.length }} 段）
            </el-button>
            <el-button
              v-if="row.status === 'READY'"
              size="small"
              type="primary"
              @click.stop="selectedBatchId = row.id; handleCommit()"
            >
              生效
            </el-button>
            <el-button size="small" text @click.stop="selectedBatchId = row.id">查看</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card>
      <template #header>
        <span v-if="selectedBatch && viewMode === 'staging'">
          待生效区预览 · 批次 #{{ selectedBatch.id }}
          <StatusBadge kind="batch" :value="selectedBatch.status" />
          <span class="staging-note">（尚未替换当前结果）</span>
        </span>
        <span v-else-if="committedBatch">
          当前生效结果 · 批次 #{{ committedBatch.id }}
        </span>
        <span v-else>差异结果</span>
      </template>

      <EmptyState v-if="viewMode === 'current' && activeRows.length === 0" text="该文档对还没有生效的比较结果" />
      <EmptyState v-if="viewMode === 'staging' && stagedRows.length === 0" text="待生效批次还没有已完成段落" />
      <DiffViewer
        v-if="viewMode === 'staging'"
        :rows="stagedRows"
        :old-sections="oldSections"
        :new-sections="newSections"
        staging
      />
      <DiffViewer
        v-else
        :rows="activeRows"
        :old-sections="oldSections"
        :new-sections="newSections"
      />
    </el-card>
  </section>
</template>
