<script setup lang="ts">
import type { DiffResult } from "../../types/DiffResult";
import type { ReviewNote } from "../../types/ReviewNote";
import { ReviewStatus } from "../../constants/ReviewStatus";
import StatusBadge from "./StatusBadge.vue";
import EmptyState from "./EmptyState.vue";
import { formatDate } from "../../utils/formatters";

export interface ChecklistEntry {
  note: ReviewNote;
  diff: DiffResult;
}

defineProps<{
  entries: ChecklistEntry[];
  orphans?: ReviewNote[];
  showOrphans?: boolean;
  activeDiffOptions?: Array<{ id: number; label: string }>;
}>();

const emit = defineEmits<{
  (e: "status", noteId: number, status: ReviewStatus): void;
  (e: "relink", noteId: number, diffResultId: number): void;
  (e: "ignore", noteId: number): void;
}>();

const statusOptions: ReviewStatus[] = [...ReviewStatus];
</script>

<template>
  <div class="review-checklist">
    <EmptyState v-if="entries.length === 0 && !showOrphans" text="审阅清单只显示生效批次的备注，当前没有待处理项" />

    <div v-for="{ note, diff } in entries" :key="note.id" class="checklist-item">
      <div class="checklist-head">
        <StatusBadge kind="diff" :value="diff.diff_type" />
        <span class="note-tag">{{ note.tag }}</span>
        <StatusBadge kind="review" :value="note.status" />
      </div>
      <p class="checklist-summary">条款 {{ diff.section_no }}：{{ diff.summary }}</p>
      <p class="checklist-comment">{{ note.comment }}</p>
      <div class="checklist-foot">
        <span>{{ note.reviewer }} · {{ formatDate(note.updated_at) }}</span>
        <el-select
          :model-value="note.status"
          size="small"
          style="width: 130px"
          @update:model-value="(value: unknown) => emit('status', note.id, value as ReviewStatus)"
        >
          <el-option v-for="status in statusOptions" :key="status" :label="status" :value="status" />
        </el-select>
      </div>
    </div>

    <template v-if="showOrphans">
      <h4 class="orphan-title">待处理区（{{ orphans?.length ?? 0 }}）：对不上条款段落的备注</h4>
      <EmptyState
        v-if="!orphans || orphans.length === 0"
        text="没有对不上段落的审阅备注"
      />
      <div v-for="note in orphans" :key="`orphan-${note.id}`" class="checklist-item orphan">
        <div class="checklist-head">
          <StatusBadge kind="link" value="ORPHANED" />
          <span class="note-tag">{{ note.tag }}</span>
        </div>
        <p class="checklist-comment">{{ note.comment }}</p>
        <p class="orphan-reason">缘由：{{ note.orphan_reason ?? "条款段落无法定位" }}</p>
        <div class="orphan-actions">
          <el-select
            :model-value="null"
            size="small"
            placeholder="重新挂到生效差异行"
            style="width: 320px"
            @update:model-value="(value: unknown) => emit('relink', note.id, value as number)"
          >
            <el-option
              v-for="option in activeDiffOptions ?? []"
              :key="option.id"
              :label="option.label"
              :value="option.id"
            />
          </el-select>
          <el-button size="small" @click="emit('ignore', note.id)">忽略（留在待处理区）</el-button>
        </div>
      </div>
    </template>
  </div>
</template>
