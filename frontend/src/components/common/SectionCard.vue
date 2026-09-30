<script setup lang="ts">
import type { PolicySection } from "../../types/PolicySection";
import { PrivacyRiskLevel } from "../../constants/PrivacyRiskLevel";
import StatusBadge from "./StatusBadge.vue";

defineProps<{ section: PolicySection }>();
const emit = defineEmits<{ (e: "risk-change", sectionId: number, level: string): void }>();
</script>

<template>
  <article class="section-card">
    <div class="section-head">
      <strong>{{ section.section_no }} {{ section.heading }}</strong>
      <StatusBadge :value="section.risk_level" />
    </div>
    <p class="section-content">{{ section.content }}</p>
    <label class="risk-select">
      风险等级
      <select :value="section.risk_level" @change="emit('risk-change', section.id, ($event.target as HTMLSelectElement).value)">
        <option v-for="level in PrivacyRiskLevel" :key="level" :value="level">{{ level }}</option>
      </select>
    </label>
    <slot />
  </article>
</template>

<style scoped>
.section-card { border: 1px solid #d8d6c8; border-radius: 8px; padding: 14px; background: #fbfaf4; display: grid; gap: 8px; }
.section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.section-content { margin: 0; font-size: 13px; color: #3a3f38; white-space: pre-wrap; }
.risk-select { display: grid; gap: 4px; font-size: 12px; color: #596257; }
select { padding: 4px 8px; border-radius: 6px; border: 1px solid #c9d0c3; }
</style>
