<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePolicyDocumentStore } from "../stores/PolicyDocumentStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import { useDiffBatchStore } from "../stores/DiffBatchStore";
import { useTextDiff } from "../hooks/useTextDiff";
import DiffViewer from "../components/common/DiffViewer.vue";
import StagingPanel from "../components/common/StagingPanel.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import EmptyState from "../components/common/EmptyState.vue";

const docStore = usePolicyDocumentStore();
const sectionStore = usePolicySectionStore();
const batchStore = useDiffBatchStore();
const { rows: docs } = storeToRefs(docStore);
const { rows: sections } = storeToRefs(sectionStore);
const { activeBatch, pendingBatch, loading, error, injectFailure } = storeToRefs(batchStore);

const oldId = ref(1);
const newId = ref(2);

onMounted(async () => {
  await docStore.load();
  await sectionStore.load();
  await batchStore.load();
});

const oldDoc = computed(() => docs.value.find((doc) => doc.id === oldId.value) ?? null);
const newDoc = computed(() => docs.value.find((doc) => doc.id === newId.value) ?? null);

const { diffLines, stats } = useTextDiff(
  computed(() => oldDoc.value?.raw_text ?? ""),
  computed(() => newDoc.value?.raw_text ?? "")
);

/** 待生效区展示：优先当前选择两版之间的待生效/作废批次，否则取最近一张。 */
const stagingBatch = computed(() => {
  const related = batchStore.batches.find(
    (batch) =>
      batch.old_document_id === oldId.value &&
      batch.new_document_id === newId.value &&
      (batch.status === "PENDING" || batch.status === "FAILED" || batch.status === "STALE")
  );
  return related ?? pendingBatch.value ?? null;
});

/** 差异视图：待生效批次未生效前也可预览其结果，但审阅清单只认生效批次。 */
const viewResults = computed(() => (stagingBatch.value?.status === "PENDING" ? stagingBatch.value.results : activeBatch.value?.results ?? []));

async function startCompare() {
  await batchStore.stageComparison(oldId.value, newId.value);
}

async function promote(batchId: number) {
  await batchStore.promoteBatch(batchId);
}

async function retry(batchId: number) {
  await batchStore.retryBatch(batchId);
}
</script>

<template>
  <section class="page-grid">
    <div class="panel wide">
      <div class="compare-bar">
        <label>旧版
          <select v-model.number="oldId">
            <option v-for="doc in docs" :key="doc.id" :value="doc.id">{{ doc.title }} {{ doc.version_label }}</option>
          </select>
        </label>
        <span>→</span>
        <label>新版
          <select v-model.number="newId">
            <option v-for="doc in docs" :key="doc.id" :value="doc.id">{{ doc.title }} {{ doc.version_label }}</option>
          </select>
        </label>
        <button class="primary" :disabled="loading || oldId === newId" @click="startCompare">开始比较（进入待生效区）</button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>

      <StagingPanel
        :batch="stagingBatch"
        :docs="docs"
        :inject-failure="injectFailure"
        @promote="promote"
        @retry="retry"
        @update:injectFailure="(value) => batchStore.setInjectFailure(value)"
      />

      <div class="legend">
        <StatusBadge value="ADDED" /> <StatusBadge value="REMOVED" /> <StatusBadge value="MODIFIED" />
        <StatusBadge value="MOVED" /> <StatusBadge value="UNCHANGED" />
        <span class="stats">行级差异：+{{ stats.added }} / -{{ stats.removed }}</span>
      </div>

      <DiffViewer :results="viewResults" :sections="sections" />
    </div>

    <div class="panel">
      <h2>原文对照</h2>
      <div class="text-diff">
        <div v-for="(line, index) in diffLines" :key="index" class="text-line" :class="line.type.toLowerCase()">
          <span class="line-no">{{ line.oldNo ?? "" }}</span>
          <span class="line-no">{{ line.newNo ?? "" }}</span>
          <span class="line-text">{{ line.text || "　" }}</span>
        </div>
      </div>
      <EmptyState v-if="!oldDoc || !newDoc" />
    </div>
  </section>
</template>

<style scoped>
.page-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
.compare-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.compare-bar label { display: grid; gap: 4px; font-size: 12px; color: #596257; }
.compare-bar select { padding: 6px 8px; border-radius: 6px; border: 1px solid #c9d0c3; }
.primary { background: #223126; color: #f5f1e6; border: 0; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 700; }
.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: #c0392b; font-weight: 700; }
.legend { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0; }
.stats { font-size: 12px; color: #596257; }
.text-diff { border: 1px solid #d8d6c8; border-radius: 8px; background: #fbfaf4; max-height: 520px; overflow: auto; }
.text-line { display: grid; grid-template-columns: 48px 48px 1fr; gap: 6px; padding: 2px 8px; font-size: 12px; font-family: ui-monospace, monospace; }
.text-line.added { background: #e4efe4; }
.text-line.removed { background: #f6e0dc; }
.line-no { color: #8a8f98; text-align: right; }
@media (max-width: 960px) { .page-grid { grid-template-columns: 1fr; } }
</style>
