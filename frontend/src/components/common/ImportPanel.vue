<script setup lang="ts">
import { computed } from "vue";
import { usePolicyParser } from "../../hooks/usePolicyParser";
import SectionCard from "./SectionCard.vue";
import EmptyState from "./EmptyState.vue";
import { createDefaultPolicySection } from "../../constructors/PolicySectionConstructor";

const props = defineProps<{
  modelValue: { title: string; version_label: string; raw_text: string };
}>();
const emit = defineEmits<{
  (e: "update:modelValue", value: { title: string; version_label: string; raw_text: string }): void;
  (e: "submit"): void;
}>();

const { rawText, sections } = usePolicyParser();
rawText.value = props.modelValue.raw_text;

const form = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value)
});

function onText(value: string) {
  rawText.value = value;
  form.value = { ...form.value, raw_text: value };
}

const previewSections = computed(() =>
  sections.value.map((item, index) =>
    createDefaultPolicySection({
      id: -(index + 1),
      section_no: item.section_no,
      heading: item.heading,
      content: item.content
    })
  )
);
</script>

<template>
  <div class="import-panel">
    <el-form label-width="92px">
      <el-form-item label="文档标题">
        <el-input
          :model-value="form.title"
          placeholder="例如：某产品隐私政策"
          @update:model-value="(v: string) => (form = { ...form, title: v })"
        />
      </el-form-item>
      <el-form-item label="版次">
        <el-input
          :model-value="form.version_label"
          placeholder="例如：v3.0"
          @update:model-value="(v: string) => (form = { ...form, version_label: v })"
        />
      </el-form-item>
      <el-form-item label="政策正文">
        <el-input
          :model-value="form.raw_text"
          type="textarea"
          :rows="10"
          placeholder="粘贴政策全文，按“第一条 …”自动分段"
          @update:model-value="onText"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :disabled="sections.length === 0" @click="emit('submit')">
          解析并导入（{{ sections.length }} 个段落）
        </el-button>
      </el-form-item>
    </el-form>

    <div class="import-preview">
      <h4>段落预览</h4>
      <EmptyState v-if="previewSections.length === 0" text="粘贴正文后在此预览自动分段结果" />
      <SectionCard v-for="section in previewSections" :key="section.id" :section="section" />
    </div>
  </div>
</template>
