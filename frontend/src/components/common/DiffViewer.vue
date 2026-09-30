<script setup lang="ts">
import { computed } from "vue";
import type { DiffResult } from "../../types/DiffResult";
import type { PolicySection } from "../../types/PolicySection";
import StatusBadge from "./StatusBadge.vue";
import EmptyState from "./EmptyState.vue";

const props = defineProps<{ results: DiffResult[]; sections: PolicySection[] }>();
const sectionById = computed(() => new Map(props.sections.map((section) => [section.id, section])));
</script>

<template>
  <div v-if="results.length === 0"><EmptyState /></div>
  <div v-else class="diff-list">
    <article v-for="result in results" :key="result.id" class="diff-row" :class="result.diff_type.toLowerCase()">
      <StatusBadge :value="result.diff_type" />
      <div class="diff-body">
        <strong>{{ sectionById.get(result.section_id)?.heading ?? `条款 #${result.section_id}` }}</strong>
        <span class="diff-summary">{{ result.summary }}</span>
      </div>
    </article>
  </div>
</template>

<style scoped>
.diff-list { display: grid; gap: 10px; }
.diff-row { display: flex; gap: 12px; align-items: flex-start; border: 1px solid #d8d6c8; border-left: 6px solid #8a8f98; border-radius: 8px; padding: 12px; background: #fbfaf4; }
.diff-row.added { border-left-color: #2f7d5b; }
.diff-row.removed { border-left-color: #c0392b; }
.diff-row.modified { border-left-color: #d39b46; }
.diff-row.moved { border-left-color: #4a6fa5; }
.diff-row.unchanged { border-left-color: #b8b09f; }
.diff-body { display: grid; gap: 4px; }
.diff-summary { color: #596257; font-size: 13px; }
</style>
