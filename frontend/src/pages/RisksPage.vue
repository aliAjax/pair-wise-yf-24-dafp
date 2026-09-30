<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import { usePolicyDocumentStore } from "../stores/PolicyDocumentStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import { useDiffBatchStore } from "../stores/DiffBatchStore";
import SectionCard from "../components/common/SectionCard.vue";
import EmptyState from "../components/common/EmptyState.vue";
import type { PolicySection } from "../types/PolicySection";
import { createDefaultPolicySection } from "../constructors/PolicySectionConstructor";

const docStore = usePolicyDocumentStore();
const sectionStore = usePolicySectionStore();
const batchStore = useDiffBatchStore();
const { rows: docs } = storeToRefs(docStore);
const { rows: allSections } = storeToRefs(sectionStore);
const { activeBatch } = storeToRefs(batchStore);

const documentId = ref(1);
const noteDrafts = ref<Record<number, { tag: string; comment: string }>>({});

onMounted(async () => {
  await docStore.load();
  await sectionStore.load();
  await batchStore.load();
});

const sections = computed(() => allSections.value.filter((section) => section.document_id === documentId.value));

watch(
  sections,
  (list) => {
    for (const section of list) {
      if (!noteDrafts.value[section.id]) {
        noteDrafts.value[section.id] = { tag: "", comment: "" };
      }
    }
  },
  { immediate: true }
);

/** 生效批次中该条款有对应差异结果时，才能挂审阅备注（备注只认生效批次）。 */
function hasActiveResult(sectionId: number): boolean {
  return activeBatch.value?.results.some((result) => result.section_id === sectionId) ?? false;
}

async function onRiskChange(sectionId: number, level: string) {
  const section = allSections.value.find((item) => item.id === sectionId);
  if (!section) return;
  await sectionStore.save(createDefaultPolicySection({ ...section, risk_level: level as PolicySection["risk_level"] }));
}

async function addNote(section: PolicySection) {
  const draft = noteDrafts.value[section.id];
  if (!draft?.tag || !draft?.comment) return;
  await batchStore.addNoteForSection(section.id, draft.tag, draft.comment, "当前审阅人");
  noteDrafts.value[section.id] = { tag: "", comment: "" };
}
</script>

<template>
  <section class="panel wide">
    <div class="compare-bar">
      <label>选择文档
        <select v-model.number="documentId">
          <option v-for="doc in docs" :key="doc.id" :value="doc.id">{{ doc.title }} {{ doc.version_label }}</option>
        </select>
      </label>
    </div>

    <EmptyState v-if="sections.length === 0" />
    <div v-else class="section-grid">
      <SectionCard v-for="section in sections" :key="section.id" :section="section" @risk-change="onRiskChange">
        <div v-if="hasActiveResult(section.id)" class="note-form">
          <input v-model="noteDrafts[section.id]!.tag" placeholder="标签，如 信息收集" />
          <input v-model="noteDrafts[section.id]!.comment" placeholder="审阅备注" />
          <button class="primary" @click="addNote(section)">挂到生效批次</button>
        </div>
        <p v-else class="not-in-batch">该条款不在当前生效批次中，审阅备注无处挂接</p>
      </SectionCard>
    </div>
  </section>
</template>

<style scoped>
.compare-bar { display: flex; gap: 10px; align-items: center; margin-bottom: 14px; }
.compare-bar label { display: grid; gap: 4px; font-size: 12px; color: #596257; }
.compare-bar select { padding: 6px 8px; border-radius: 6px; border: 1px solid #c9d0c3; }
.section-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; align-items: start; }
.note-form { display: grid; gap: 6px; margin-top: 8px; }
.note-form input { padding: 6px 8px; border-radius: 6px; border: 1px solid #c9d0c3; font-size: 13px; }
.primary { background: #223126; color: #f5f1e6; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; }
.not-in-batch { font-size: 12px; color: #8a8f98; margin: 8px 0 0; }
</style>
