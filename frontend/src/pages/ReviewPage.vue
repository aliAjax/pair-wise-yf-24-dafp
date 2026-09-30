<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import ReviewChecklist, { type ChecklistEntry } from "../components/common/ReviewChecklist.vue";
import StatusBadge from "../components/common/StatusBadge.vue";
import StatCard from "../components/common/StatCard.vue";
import { useDiffResultStore } from "../stores/DiffResultStore";
import { useReviewNoteStore } from "../stores/ReviewNoteStore";
import { useComparisonBatchStore } from "../stores/ComparisonBatchStore";
import { reviewController } from "../controllers/reviewController";
import { ReviewStatus } from "../constants/ReviewStatus";
import { BatchStatus } from "../constants/BatchStatus";
import { DiffType } from "../constants/DiffType";
import type { ReviewNote } from "../types/ReviewNote";

const diffStore = useDiffResultStore();
const noteStore = useReviewNoteStore();
const batchStore = useComparisonBatchStore();

onMounted(() => {
  diffStore.init();
  noteStore.init();
  batchStore.init();
});

const statusFilter = ref<ReviewStatus | "ALL">("ALL");
const noteDialog = ref(false);
const noteForm = reactive({ diff_result_id: null as number | null, tag: "", comment: "", reviewer: "" });

const entries = computed<ChecklistEntry[]>(() => reviewController.checklist(
  statusFilter.value === "ALL" ? undefined : statusFilter.value
));
const orphans = computed<ReviewNote[]>(() => reviewController.orphans());

const activeRows = computed(() => {
  const committed = new Set(
    batchStore.rows.filter((batch) => batch.status === BatchStatus[3]).map((batch) => batch.id)
  );
  return diffStore.rows
    .filter((row) => committed.has(row.batch_id) && row.diff_type !== DiffType[4])
    .sort((a, b) => a.section_no.localeCompare(b.section_no, "zh-CN", { numeric: true }));
});

const activeRowOptions = computed(() =>
  activeRows.value.map((row) => ({
    id: row.id,
    label: `#${row.id} 条款${row.section_no} ${row.diff_type} ${row.summary}`
  }))
);

function openNoteDialog(diffResultId?: number) {
  noteForm.diff_result_id = diffResultId ?? activeRowOptions.value[0]?.id ?? null;
  noteForm.tag = "";
  noteForm.comment = "";
  noteForm.reviewer = "当前审阅人";
  noteDialog.value = true;
}

function saveNote() {
  if (!noteForm.diff_result_id || !noteForm.tag || !noteForm.comment) {
    ElMessage.warning("差异行、标签和备注内容都要填写");
    return;
  }
  try {
    reviewController.addNote({
      diff_result_id: noteForm.diff_result_id,
      tag: noteForm.tag,
      comment: noteForm.comment,
      reviewer: noteForm.reviewer
    });
    ElMessage.success("备注已添加到生效差异行");
    noteDialog.value = false;
    noteStore.load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "添加失败");
  }
}

function changeStatus(noteId: number, status: ReviewStatus) {
  reviewController.updateNote(noteId, { status });
  noteStore.load();
}

function relinkOrphan(noteId: number, diffResultId: number) {
  try {
    reviewController.resolveOrphan(noteId, { diff_result_id: diffResultId });
    ElMessage.success("待处理备注已重新挂到生效差异行");
    noteStore.load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "处理失败");
  }
}

function ignoreOrphan(noteId: number) {
  try {
    reviewController.resolveOrphan(noteId, { status: "IGNORED" });
    ElMessage.success("已标记忽略，备注仍留在待处理区");
    noteStore.load();
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "处理失败");
  }
}

function exportMarkdown() {
  const content = reviewController.exportMarkdown();
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "privacy-review-summary.md";
  anchor.click();
  URL.revokeObjectURL(url);
}

const filterOptions: Array<{ value: ReviewStatus | "ALL"; label: string }> = [
  { value: "ALL", label: "全部" },
  ...ReviewStatus.map((value) => ({ value, label: value }))
];
</script>

<template>
  <section class="page-stack">
    <header class="page-header">
      <div>
        <h1>审阅清单</h1>
        <p>清单只认生效批次：未生效比较结果、对不上段落的待处理备注都不会出现在这里。</p>
      </div>
      <div class="header-actions">
        <el-button @click="exportMarkdown">导出 Markdown 摘要</el-button>
        <el-button type="primary" :disabled="activeRowOptions.length === 0" @click="openNoteDialog()">
          添加备注
        </el-button>
      </div>
    </header>

    <section class="metrics">
      <StatCard label="清单备注" :value="entries.length" />
      <StatCard label="待处理备注" :value="orphans.length" />
      <StatCard label="生效差异行" :value="activeRows.length" />
      <StatCard label="生效批次" :value="batchStore.rows.filter((b) => b.status === 'COMMITTED').length" />
    </section>

    <el-card>
      <template #header>
        <div class="card-header-between">
          <span>待处理区：对不上条款段落的审阅备注</span>
          <StatusBadge kind="link" value="ORPHANED" />
        </div>
      </template>
      <ReviewChecklist
        :entries="[]"
        :orphans="orphans"
        show-orphans
        :active-diff-options="activeRowOptions"
        @relink="relinkOrphan"
        @ignore="ignoreOrphan"
      />
    </el-card>

    <el-card>
      <template #header>
        <div class="card-header-between">
          <span>生效审阅清单</span>
          <el-radio-group v-model="statusFilter" size="small">
            <el-radio-button v-for="option in filterOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </el-radio-button>
          </el-radio-group>
        </div>
      </template>
      <ReviewChecklist :entries="entries" @status="changeStatus" />
    </el-card>

    <el-dialog v-model="noteDialog" title="给生效差异结果添加审阅备注" width="520px">
      <el-form label-width="92px">
        <el-form-item label="差异行">
          <el-select v-model="noteForm.diff_result_id" placeholder="只能选择生效批次的差异行" style="width: 100%">
            <el-option v-for="option in activeRowOptions" :key="option.id" :label="option.label" :value="option.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="标签"><el-input v-model="noteForm.tag" placeholder="如：超范围共享 / 保存期限" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="noteForm.comment" type="textarea" :rows="3" /></el-form-item>
        <el-form-item label="审阅人"><el-input v-model="noteForm.reviewer" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="noteDialog = false">取消</el-button>
        <el-button type="primary" @click="saveNote">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>
