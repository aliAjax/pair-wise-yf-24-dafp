<script setup lang="ts">
import { computed } from "vue";
import { STATUS_TEXT } from "../../constants/statusText";

const props = defineProps<{ value: string }>();
const groups = Object.values(STATUS_TEXT) as Record<string, string>[];
const text = computed(() => {
  for (const group of groups) {
    if (props.value in group) return group[props.value];
  }
  return props.value.replace(/_/g, " ");
});
</script>
<template><span class="badge">{{ text }}</span></template>
