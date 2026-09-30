<script setup lang="ts">
import { computed } from "vue";
import type { ReviewNote } from "../../types/ReviewNote";
import type { DiffResult } from "../../types/DiffResult";
import type { PolicySection } from "../../types/PolicySection";
import { ReviewStatus } from "../../constants/ReviewStatus";
import StatusBadge from "./StatusBadge.vue";
import EmptyState from "./EmptyState.vue";

const props = defineProps<{ notes: ReviewNote[]; results: DiffResult[]; sections: PolicySection[] }>();
const emit = defineEmits<{ (e: "update:status", noteId: number, status: string): void }>();

const resultById = computed(() => new Map(props.results.map((result) => [result.id, result])));
const sectionById = computed(() => new Map(props.sections.map((section) => [section.id, section])));

function resultSummary(note: ReviewNote): string {
  const result = resultById.value.get(note.diff_result_id);
  if (!result) return `差异结果 #${note.diff_result_id}`;
  const section = sectionById.value.get(result.section_id);
  return section ? `${section.section_no} ${section.heading}` : result.summary;
}
</script>

<template>
  <div v-if="notes.length === 0"><EmptyState /></div>
  <div v-else class="checklist">
    <article v-for="note in notes" :key="note.id" class="note-row">
      <div class="note-main">
        <strong>#{{ note.id }} {{ note.tag }}</strong>
        <span class="note-target">{{ resultSummary(note) }}</span>
        <p class="note-comment">{{ note.comment }}</p>
        <span class="note-reviewer">{{ note.reviewer }}</span>
      </div>
      <div class="note-side">
        <StatusBadge :value="note.status" />
        <select :value="note.status" @change="emit('update:status', note.id, ($event.target as HTMLSelectElement).value)">
          <option v-for="status in ReviewStatus" :key="status" :value="status">{{ status }}</option>
        </select>
      </div>
    </article>
  </div>
</template>

<style scoped>
.checklist { display: grid; gap: 10px; }
.note-row { display: flex; justify-content: space-between; gap: 12px; border: 1px solid #d8d6c8; border-radius: 8px; padding: 12px; background: #fbfaf4; }
.note-main { display: grid; gap: 4px; }
.note-target { color: #7d4d18; font-size: 12px; }
.note-comment { margin: 0; font-size: 13px; }
.note-reviewer { color: #596257; font-size: 12px; }
.note-side { display: grid; gap: 6px; justify-items: end; }
select { padding: 4px 8px; border-radius: 6px; border: 1px solid #c9d0c3; }
</style>
