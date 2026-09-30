<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import ImportPanel from "../components/common/ImportPanel.vue";
import SectionCard from "../components/common/SectionCard.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import StatCard from "../components/common/StatCard.vue";
import { usePolicyDocumentStore } from "../stores/PolicyDocumentStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import { useComparisonBatchStore } from "../stores/ComparisonBatchStore";
import { documentController } from "../controllers/documentController";
import { ControllerError } from "../utils/exceptions";
import { formatDate } from "../utils/formatters";
import { BatchStatus } from "../constants/BatchStatus";

const docStore = usePolicyDocumentStore();
const sectionStore = usePolicySectionStore();
const batchStore = useComparisonBatchStore();

onMounted(() => {
  docStore.init();
  sectionStore.init();
  batchStore.init();
});

const form = reactive({ title: "", version_label: "", raw_text: "" });
const selectedId = ref<number | null>(null);
const versionDialog = ref(false);
const editingVersion = ref("");

const documents = computed(() =>
  [...docStore.rows].sort((a, b) => b.imported_at.localeCompare(a.imported_at))
);
const selected = computed(() => docStore.rows.find((doc) => doc.id === selectedId.value) ?? null);
const selectedSections = computed(() =>
  selectedId.value ? sectionStore.byDocument(selectedId.value) : []
);

function handleImport() {
  try {
    const doc = documentController.importDocument({ ...form });
    ElMessage.success(`已导入 ${doc.version_label}，共 ${doc.normalized_sections} 个段落`);
    Object.assign(form, { title: "", version_label: "", raw_text: "" });
    selectedId.value = doc.id;
    docStore.load();
    sectionStore.load();
    batchStore.load();
  } catch (error) {
    ElMessage.error(error instanceof ControllerError ? error.message : "导入失败");
  }
}

function startEdit() {
  if (selected.value) {
    editingVersion.value = selected.value.version_label;
    versionDialog.value = true;
  }
}

function saveVersion() {
  if (!selected.value) return;
  try {
    const result = documentController.updateDocument(selected.value.id, {
      version_label: editingVersion.value
    });
    ElMessage.success(
      result.invalidatedBatches > 0
        ? `版次已更新，${result.invalidatedBatches} 个待生效批次已作废`
        : "版次已更新"
    );
    docStore.load();
    batchStore.load();
  } catch (error) {
    ElMessage.error(error instanceof ControllerError ? error.message : "保存失败");
  }
}

function affectedBatches(docId: number) {
  return batchStore.rows.filter(
    (batch) =>
      (batch.old_document_id === docId || batch.new_document_id === docId) &&
      batch.status !== BatchStatus[3]
  );
}
</script>

<template>
  <section class="page-stack">
    <header class="page-header">
      <h1>文档导入</h1>
      <p>粘贴两版隐私政策文本，自动按条款段落切分并持久化到本地。</p>
    </header>

    <section class="metrics">
      <StatCard label="文档数" :value="docStore.rows.length" />
      <StatCard label="段落数" :value="sectionStore.rows.length" />
      <StatCard label="待生效批次" :value="batchStore.pendingBatches.length" />
      <StatCard label="已作废批次" :value="batchStore.invalidatedBatches.length" />
    </section>

    <div class="two-col">
      <el-card>
        <template #header>导入新文档</template>
        <ImportPanel v-model="form" @submit="handleImport" />
      </el-card>

      <el-card>
        <template #header>版本列表</template>
        <ul class="doc-list">
          <li
            v-for="doc in documents"
            :key="doc.id"
            :class="{ active: selectedId === doc.id }"
            @click="selectedId = doc.id"
          >
            <div class="doc-line">
              <strong>{{ doc.title }}</strong>
              <StatusBadge kind="plain" :value="doc.version_label" />
            </div>
            <div class="doc-meta">
              <span>#{{ doc.id }} · {{ formatDate(doc.imported_at) }}</span>
              <span>{{ doc.normalized_sections }} 段</span>
            </div>
            <div v-for="batch in affectedBatches(doc.id)" :key="batch.id" class="doc-batch-warn">
              <StatusBadge kind="batch" :value="batch.status" />
              <span v-if="batch.status === 'INVALIDATED'">{{ batch.retry_detail }}</span>
              <span v-else>批次 #{{ batch.id }} 进行中</span>
            </div>
          </li>
        </ul>
      </el-card>
    </div>

    <el-card v-if="selected">
      <template #header>
        <div class="card-header-between">
          <span>#{{ selected.id }} {{ selected.title }} · {{ selected.version_label }}</span>
          <el-button size="small" @click="startEdit">改版次</el-button>
        </div>
      </template>

      <el-dialog v-model="versionDialog" title="编辑版次（版次一变，待生效结果作废）" width="420px">
        <el-input v-model="editingVersion" placeholder="新版次，如 v3.1" />
        <template #footer>
          <el-button @click="versionDialog = false">取消</el-button>
          <el-button type="primary" @click="saveVersion(); versionDialog = false">保存</el-button>
        </template>
      </el-dialog>

      <div class="section-grid">
        <SectionCard v-for="section in selectedSections" :key="section.id" :section="section" />
      </div>
    </el-card>
  </section>
</template>
