<script setup lang="ts">
import { onMounted, ref } from "vue";
import { storeToRefs } from "pinia";
import { usePolicyDocumentStore } from "../stores/PolicyDocumentStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import { useDiffBatchStore } from "../stores/DiffBatchStore";
import { createDefaultPolicyDocument } from "../constructors/PolicyDocumentConstructor";
import { parseSections } from "../utils/diffEngine";
import ImportPanel from "../components/common/ImportPanel.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import EmptyState from "../components/common/EmptyState.vue";
import { formatDate } from "../utils/formatters";

const docStore = usePolicyDocumentStore();
const sectionStore = usePolicySectionStore();
const batchStore = useDiffBatchStore();
const { rows: docs } = storeToRefs(docStore);

const title = ref("隐私政策");
const versionLabel = ref("");
const rawText = ref("");
const message = ref<string | null>(null);
const importing = ref(false);

onMounted(async () => {
  await docStore.load();
  await batchStore.load();
});

async function importDocument() {
  if (!versionLabel.value.trim() || !rawText.value.trim()) return;
  importing.value = true;
  try {
    const doc = createDefaultPolicyDocument({
      id: 0,
      title: title.value.trim() || "隐私政策",
      version_label: versionLabel.value.trim(),
      raw_text: rawText.value,
      normalized_sections: "",
      imported_at: new Date().toISOString()
    });
    const saved = await docStore.save(doc);
    for (const section of parseSections(saved)) {
      await sectionStore.save(section);
    }
    // 版次一变：待生效结果作废并留下重试缘由，审阅清单只认生效批次
    await batchStore.invalidatePending(`政策版本已更新：已导入 ${saved.version_label}，待生效结果作废，请重新比较后再生效`);
    message.value = `已导入 ${saved.title} ${saved.version_label}，待生效批次已作废`;
    versionLabel.value = "";
    rawText.value = "";
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <section class="page-grid">
    <div class="panel">
      <h2>导入政策版本</h2>
      <ImportPanel title="粘贴新版政策文本">
        <div class="form-grid">
          <label>标题<input v-model="title" placeholder="政策标题" /></label>
          <label>版次标签<input v-model="versionLabel" placeholder="如 v2.2 / 2026-07 修订版" /></label>
          <label class="wide">正文<textarea v-model="rawText" rows="10" placeholder="粘贴政策全文，按“第一条 …”等编号条款自动分段" /></label>
        </div>
        <button class="primary" :disabled="importing || !versionLabel || !rawText" @click="importDocument">导入并作废待生效批次</button>
        <p v-if="message" class="message">{{ message }}</p>
      </ImportPanel>
    </div>

    <div class="panel wide">
      <h2>版本列表</h2>
      <EmptyState v-if="docs.length === 0" />
      <div v-else class="doc-list">
        <article v-for="doc in docs" :key="doc.id" class="doc-row">
          <div>
            <strong>{{ doc.title }} {{ doc.version_label }}</strong>
            <p class="doc-meta">导入于 {{ formatDate(doc.imported_at) }} · 正文 {{ doc.raw_text.length }} 字</p>
          </div>
          <StatusBadge value="READY" />
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-grid { display: grid; grid-template-columns: 1fr 1.4fr; gap: 18px; align-items: start; }
.form-grid { display: grid; gap: 10px; margin: 10px 0; }
.form-grid label { display: grid; gap: 4px; font-size: 12px; color: #596257; }
.form-grid .wide { grid-column: 1 / -1; }
input, textarea { padding: 8px; border-radius: 6px; border: 1px solid #c9d0c3; font: inherit; }
.primary { background: #223126; color: #f5f1e6; border: 0; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 700; }
.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.message { color: #2f7d5b; font-weight: 700; font-size: 13px; }
.doc-list { display: grid; gap: 8px; }
.doc-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #d8d6c8; border-radius: 8px; padding: 12px; background: #fbfaf4; }
.doc-meta { margin: 4px 0 0; color: #596257; font-size: 12px; }
</style>
