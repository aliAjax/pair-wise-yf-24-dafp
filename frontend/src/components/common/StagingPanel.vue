<script setup lang="ts">
import { computed } from "vue";
import type { DiffBatch } from "../../types/DiffBatch";
import type { PolicyDocument } from "../../types/PolicyDocument";
import StatusBadge from "./StatusBadge.vue";
import { formatDate } from "../../utils/formatters";

const props = defineProps<{ batch: DiffBatch | null; docs: PolicyDocument[]; injectFailure: boolean }>();
const emit = defineEmits<{
  (e: "promote", batchId: number): void;
  (e: "retry", batchId: number): void;
  (e: "update:injectFailure", value: boolean): void;
}>();

const oldDoc = computed(() => props.docs.find((doc) => doc.id === props.batch?.old_document_id) ?? null);
const newDoc = computed(() => props.docs.find((doc) => doc.id === props.batch?.new_document_id) ?? null);
const percent = computed(() => {
  if (!props.batch || props.batch.progress.total === 0) return 0;
  return Math.round((props.batch.progress.done / props.batch.progress.total) * 100);
});
</script>

<template>
  <div v-if="batch" class="panel staging" :class="batch.status.toLowerCase()">
    <div class="staging-head">
      <strong>待生效区 · 批次 #{{ batch.id }}</strong>
      <StatusBadge :value="batch.status" />
    </div>

    <p class="staging-meta">
      {{ oldDoc?.version_label ?? "?" }} → {{ newDoc?.version_label ?? "?" }}
      <span class="fp" :title="batch.source_fingerprint">来源指纹 {{ batch.source_fingerprint.slice(0, 14) }}…</span>
    </p>

    <template v-if="batch.status === 'PENDING'">
      <p>差异结果已按条款段落重新算好对应关系，共 {{ batch.progress.total }} 段；对不上的 {{ batch.unmatched_notes.length }} 条审阅备注已留在待处理区。</p>
      <p class="hint">生效前会重新校验政策来源指纹：确认来源没动过，才一次性换为当前结果。</p>
      <div class="progress"><i :style="{ width: percent + '%' }" />{{ batch.progress.done }}/{{ batch.progress.total }}</div>
      <button class="primary" @click="emit('promote', batch.id)">确认来源未动，生效本次结果</button>
    </template>

    <template v-else-if="batch.status === 'FAILED'">
      <p class="reason">计算失败：{{ batch.retry_reason }}</p>
      <p>已从原结果保留 {{ batch.progress.done }}/{{ batch.progress.total }} 段，重试只补没做完的部分。</p>
      <div class="progress"><i :style="{ width: percent + '%' }" />{{ batch.progress.done }}/{{ batch.progress.total }}</div>
      <button class="primary" @click="emit('retry', batch.id)">重试（续算未完成段落）</button>
    </template>

    <template v-else-if="batch.status === 'STALE'">
      <p class="reason">待生效结果已作废：{{ batch.retry_reason }}</p>
      <p>作废时间 {{ formatDate(batch.updated_at) }}；原生效批次不受影响，审阅清单仍只认生效批次。</p>
      <button class="primary" @click="emit('retry', batch.id)">按当前来源重新比较</button>
    </template>

    <label class="inject">
      <input type="checkbox" :checked="injectFailure" @change="emit('update:injectFailure', ($event.target as HTMLInputElement).checked)" />
      模拟计算中断（验证失败恢复与断点续算）
    </label>
  </div>
</template>

<style scoped>
.staging { border-left: 6px solid #d39b46; }
.staging.pending { border-left-color: #2f7d5b; }
.staging.failed { border-left-color: #c0392b; }
.staging.stale { border-left-color: #8a8f98; }
.staging-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.staging-meta { color: #596257; font-size: 13px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.fp { font-family: ui-monospace, monospace; font-size: 12px; color: #7d4d18; }
.hint { color: #596257; font-size: 13px; }
.reason { color: #c0392b; font-weight: 700; }
.progress { position: relative; background: #e4e0d3; border-radius: 999px; height: 18px; overflow: hidden; margin: 10px 0; font-size: 12px; }
.progress i { display: block; height: 100%; background: #2f7d5b; }
.progress { text-align: center; line-height: 18px; }
.primary { background: #223126; color: #f5f1e6; border: 0; padding: 10px 16px; border-radius: 6px; cursor: pointer; font-weight: 700; }
.primary:hover { background: #2f4a3a; }
.inject { display: block; margin-top: 12px; font-size: 12px; color: #596257; }
</style>
