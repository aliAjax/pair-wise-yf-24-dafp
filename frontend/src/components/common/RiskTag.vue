<script setup lang="ts">
import { computed } from "vue";
import { formatRisk } from "../../utils/formatters";

const props = defineProps<{ level: string }>();
const cls = computed(() => `risk-tag risk-${props.level.toLowerCase()}`);
const text = computed(() => formatRisk(props.level));
</script>

<template>
  <span :class="cls">{{ text }}</span>
</template>
