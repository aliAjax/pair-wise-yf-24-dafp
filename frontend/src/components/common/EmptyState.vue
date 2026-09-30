<script setup lang="ts">
withDefaults(defineProps<{ text?: string }>(), { text: "暂无数据" });
</script>

<template>
  <div class="empty-state">
    <div class="empty-icon">📭</div>
    <p><slot>{{ text }}</slot></p>
  </div>
</template>
