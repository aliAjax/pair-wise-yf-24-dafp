<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import SectionCard from "../components/common/SectionCard.vue";
import RiskTag from "../components/common/RiskTag.vue";
import EmptyState from "../components/common/EmptyState.vue";
import StatCard from "../components/common/StatCard.vue";
import { usePolicyDocumentStore } from "../stores/PolicyDocumentStore";
import { usePolicySectionStore } from "../stores/PolicySectionStore";
import { reviewController } from "../controllers/reviewController";
import { PrivacyRiskLevel } from "../constants/PrivacyRiskLevel";
import { ControllerError } from "../utils/exceptions";

const docStore = usePolicyDocumentStore();
const sectionStore = usePolicySectionStore();

onMounted(() => {
  docStore.init();
  sectionStore.init();
});

const documentId = ref<number | null>(null);
const categoryKeyword = ref("");
const levelFilter = ref<string>("ALL");

const documents = computed(() =>
  [...docStore.rows].sort((a, b) => b.imported_at.localeCompare(a.imported_at))
);
const sections = computed(() => {
  const rows = documentId.value ? sectionStore.byDocument(documentId.value) : sectionStore.rows;
  return rows
    .filter((section) => levelFilter.value === "ALL" || section.risk_level === levelFilter.value)
    .filter(
      (section) =>
        !categoryKeyword.value ||
        `${section.category}${section.heading}`.toLowerCase().includes(categoryKeyword.value.toLowerCase())
    );
});

const levelStats = computed(() => {
  const stats: Record<string, number> = {};
  for (const section of sectionStore.rows) {
    stats[section.risk_level] = (stats[section.risk_level] ?? 0) + 1;
  }
  return stats;
});

function setRisk(sectionId: number, riskLevel: PrivacyRiskLevel) {
  try {
    reviewController.tagRisk(sectionId, { risk_level: riskLevel });
    sectionStore.load();
    ElMessage.success("风险等级已更新（不影响待生效批次）");
  } catch (error) {
    ElMessage.error(error instanceof ControllerError ? error.message : "标注失败");
  }
}
</script>

<template>
  <section class="page-stack">
    <header class="page-header">
      <h1>风险标注</h1>
      <p>给数据收集、共享、保存期限等条款打风险标签。标注不改动条款正文，因此不会作废待生效批次。</p>
    </header>

    <section class="metrics">
      <StatCard label="低风险" :value="levelStats.LOW ?? 0" />
      <StatCard label="中风险" :value="levelStats.MEDIUM ?? 0" />
      <StatCard label="高风险" :value="levelStats.HIGH ?? 0" />
      <StatCard label="严重风险" :value="levelStats.CRITICAL ?? 0" />
    </section>

    <el-card>
      <div class="risk-controls">
        <el-select v-model="documentId" placeholder="选择文档（默认全部）" clearable style="width: 300px">
          <el-option
            v-for="doc in documents"
            :key="doc.id"
            :label="`#${doc.id} ${doc.title} ${doc.version_label}`"
            :value="doc.id"
          />
        </el-select>
        <el-input v-model="categoryKeyword" placeholder="筛选分类或标题" style="width: 220px" />
        <el-radio-group v-model="levelFilter">
          <el-radio-button value="ALL">全部</el-radio-button>
          <el-radio-button v-for="level in PrivacyRiskLevel" :key="level" :value="level">
            <RiskTag :level="level" />
          </el-radio-button>
        </el-radio-group>
      </div>
    </el-card>

    <EmptyState v-if="sections.length === 0" text="没有符合条件的条款" />
    <div class="section-grid">
      <el-card v-for="section in sections" :key="section.id" class="risk-card">
        <SectionCard :section="section" />
        <div class="risk-actions">
          <el-button
            v-for="level in PrivacyRiskLevel"
            :key="level"
            size="small"
            :type="section.risk_level === level ? 'primary' : 'default'"
            @click="setRisk(section.id, level)"
          >
            <RiskTag :level="level" />
          </el-button>
        </div>
      </el-card>
    </div>
  </section>
</template>
