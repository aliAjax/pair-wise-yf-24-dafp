<script setup lang="ts">defineProps<{ title?: string }>();</script>
<template>
  <div class="shared-widget">
    <strong>{{ title ?? "ImportPanel" }}</strong>
    <span class="badge">READY</span>
    <div class="import-body"><slot /></div>
  </div>
</template>

<style scoped>
.import-body { margin-top: 12px; display: grid; gap: 10px; }
</style>
