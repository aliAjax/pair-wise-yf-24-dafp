<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useDiffBatchStore } from "../stores/DiffBatchStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import ReviewChecklist from "../components/common/ReviewChecklist.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import EmptyState from "../components/common/EmptyState.vue";
import { formatDate } from "../utils/formatters";

const batchStore = useDiffBatchStore();
const sectionStore = usePolicySectionStore();
const { activeBatch, pendingAreaNotes, loading } = storeToRefs(batchStore);
const { rows: sections } = storeToRefs(sectionStore);

onMounted(async () => {
  await batchStore.load();
  await sectionStore.load();
});

/** 待处理区备注可挂接的目标：生效批次的差异结果。 */
const relinkTargets = computed(() => activeBatch.value?.results ?? []);

async function updateStatus(noteId: number, status: string) {
  await batchStore.updateNoteStatus(noteId, status);
}

async function relink(noteId: number, event: Event) {
  const targetId = Number((event.target as HTMLSelectElement).value);
  if (!targetId) return;
  await batchStore.relinkNote(noteId, targetId);
  (event.target as HTMLSelectElement).value = "";
}

async function discard(noteId: number) {
  await batchStore.discardNote(noteId);
}

/** 导出 Markdown 摘要：只导出生效批次的审阅结论。 */
function exportMarkdown() {
  const batch = activeBatch.value;
  if (!batch) return;
  const sectionById = new Map(sections.value.map((section) => [section.id, section]));
  const resultById = new Map(batch.results.map((result) => [result.id, result]));
  const lines = [
    "# 审阅清单摘要",
    "",
    `- 生效批次：#${batch.id}（${formatDate(batch.promoted_at ?? batch.updated_at)}）`,
    `- 差异结果：${batch.results.length} 条；审阅备注：${batch.notes.length} 条`,
    "",
    "| 条款 | 差异 | 标签 | 备注 | 审阅人 | 状态 |",
    "| --- | --- | --- | --- | --- | --- |"
  ];
  for (const note of batch.notes) {
    const result = resultById.get(note.diff_result_id);
    const section = result ? sectionById.get(result.section_id) : undefined;
    lines.push(
      `| ${section ? `${section.section_no} ${section.heading}` : "-"} | ${result?.diff_type ?? "-"} | ${note.tag} | ${note.comment} | ${note.reviewer} | ${note.status} |`
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `review-batch-${batch.id}.md`;
  link.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="page-grid">
    <div class="panel wide">
      <div class="head-row">
        <h2>审阅清单（只认生效批次）</h2>
        <div class="head-actions">
          <StatusBadge v-if="activeBatch" value="ACTIVE" />
          <button class="primary" :disabled="!activeBatch || loading" @click="exportMarkdown">导出 Markdown 摘要</button>
        </div>
      </div>
      <p v-if="activeBatch" class="batch-meta">
        当前生效批次 #{{ activeBatch.id }}：差异结果 {{ activeBatch.results.length }} 条，审阅备注 {{ activeBatch.notes.length }} 条。
        切换政策版本后，待生效结果未确认生效前不会进入本清单。
      </p>
      <ReviewChecklist
        v-if="activeBatch"
        :notes="activeBatch.notes"
        :results="activeBatch.results"
        :sections="sections"
        @update:status="updateStatus"
      />
      <EmptyState v-else />
    </div>

    <div class="panel">
      <h2>待处理区（对不上的审阅备注）</h2>
      <p class="batch-meta">条款对应关系变更后无处挂接的备注留在这里，可重新挂接或丢弃，不进审阅清单。</p>
      <div v-if="pendingAreaNotes.length === 0" class="empty">待处理区为空</div>
      <div v-else class="pending-list">
        <article v-for="note in pendingAreaNotes" :key="note.id" class="pending-row">
          <strong>#{{ note.id }} {{ note.tag }}</strong>
          <p>{{ note.comment }}</p>
          <span class="note-reviewer">{{ note.reviewer }} · <StatusBadge :value="note.status" /></span>
          <div class="pending-actions">
            <select @change="relink(note.id, $event)">
              <option value="">重新挂接到…</option>
              <option v-for="result in relinkTargets" :key="result.id" :value="result.id">
                {{ result.diff_type }} · {{ result.summary }}
              </option>
            </select>
            <button class="ghost" @click="discard(note.id)">丢弃</button>
          </div>
        </article>
      </div>
    </div>
  </section>
</template>

<style scoped>
.page-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; align-items: start; }
.head-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.head-actions { display: flex; align-items: center; gap: 10px; }
.batch-meta { color: #596257; font-size: 13px; }
.primary { background: #223126; color: #f5f1e6; border: 0; padding: 8px 14px; border-radius: 6px; cursor: pointer; font-weight: 700; }
.primary:disabled { opacity: 0.5; cursor: not-allowed; }
.pending-list { display: grid; gap: 10px; }
.pending-row { border: 1px dashed #b8b09f; border-radius: 8px; padding: 12px; display: grid; gap: 6px; }
.pending-row p { margin: 0; font-size: 13px; }
.note-reviewer { color: #596257; font-size: 12px; display: flex; align-items: center; gap: 6px; }
.pending-actions { display: flex; gap: 8px; align-items: center; }
.pending-actions select { padding: 4px 8px; border-radius: 6px; border: 1px solid #c9d0c3; max-width: 240px; }
.ghost { background: transparent; border: 1px solid #c0392b; color: #c0392b; padding: 4px 10px; border-radius: 6px; cursor: pointer; }
@media (max-width: 960px) { .page-grid { grid-template-columns: 1fr; } }
</style>
