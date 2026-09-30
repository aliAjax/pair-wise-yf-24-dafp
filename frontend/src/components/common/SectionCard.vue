<script setup lang="ts">
import type { PolicySection } from "../../types/PolicySection";
import RiskTag from "./RiskTag.vue";

defineProps<{
  section: PolicySection;
  highlight?: boolean;
}>();
</script>

<template>
  <article class="section-card" :class="{ highlight }">
    <header>
      <span class="section-no">第 {{ section.section_no }} 条</span>
      <strong>{{ section.heading }}</strong>
      <RiskTag :level="section.risk_level" />
    </header>
    <p>{{ section.content }}</p>
    <footer><span class="category">{{ section.category }}</span></footer>
  </article>
</template>
