<script setup lang="ts">
import type { DiffResult } from "../../types/DiffResult";
import type { PolicySection } from "../../types/PolicySection";
import StatusBadge from "./StatusBadge.vue";
import EmptyState from "./EmptyState.vue";

const props = defineProps<{
  rows: DiffResult[];
  oldSections: PolicySection[];
  newSections: PolicySection[];
  /** 是否为待生效区视角：行还未生效时给提示 */
  staging?: boolean;
}>();

const oldById = new Map(props.oldSections.map((section) => [section.id, section]));
const newById = new Map(props.newSections.map((section) => [section.id, section]));

function oldSectionOf(row: DiffResult): PolicySection | undefined {
  return row.old_section_id != null ? oldById.get(row.old_section_id) : undefined;
}
function newSectionOf(row: DiffResult): PolicySection | undefined {
  return row.new_section_id != null ? newById.get(row.new_section_id) : undefined;
}
</script>

<template>
  <div class="diff-viewer">
    <div v-if="rows.length === 0"><EmptyState text="没有差异结果，请先在版本对比页发起比较" /></div>
    <div v-for="row in rows" :key="row.id" class="diff-row" :data-type="row.diff_type.toLowerCase()">
      <div class="diff-row-head">
        <StatusBadge kind="diff" :value="row.diff_type" />
        <span class="diff-section-no">条款 {{ row.section_no }}</span>
        <span class="diff-summary">{{ row.summary }}</span>
        <span v-if="staging" class="staging-flag">待生效</span>
      </div>
      <div class="diff-columns">
        <div class="diff-col old">
          <template v-if="oldSectionOf(row)">
            <strong>第 {{ oldSectionOf(row)?.section_no }} 条 · {{ oldSectionOf(row)?.heading }}</strong>
            <p>{{ oldSectionOf(row)?.content }}</p>
          </template>
          <em v-else class="missing">（旧版无对应段落）</em>
        </div>
        <div class="diff-arrow">→</div>
        <div class="diff-col new">
          <template v-if="newSectionOf(row)">
            <strong>第 {{ newSectionOf(row)?.section_no }} 条 · {{ newSectionOf(row)?.heading }}</strong>
            <p>{{ newSectionOf(row)?.content }}</p>
          </template>
          <em v-else class="missing">（新版已删除）</em>
        </div>
      </div>
    </div>
  </div>
</template>
