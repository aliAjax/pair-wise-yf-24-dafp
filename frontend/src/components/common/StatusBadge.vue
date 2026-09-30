<script setup lang="ts">
import { computed } from "vue";
import { formatBatchRetryReason, formatBatchStatus, formatRisk, formatStatus } from "../../utils/formatters";
import { DiffTypeText } from "../../constants/DiffType";
import { ReviewStatusText } from "../../constants/ReviewStatus";
import { ReviewNoteLinkStatusText } from "../../constants/ReviewNoteLinkStatus";

const props = defineProps<{
  value: string;
  kind?: "diff" | "review" | "link" | "risk" | "batch" | "reason" | "plain";
}>();

const text = computed(() => {
  switch (props.kind) {
    case "diff":
      return DiffTypeText[props.value as keyof typeof DiffTypeText] ?? props.value;
    case "review":
      return ReviewStatusText[props.value as keyof typeof ReviewStatusText] ?? props.value;
    case "link":
      return ReviewNoteLinkStatusText[props.value as keyof typeof ReviewNoteLinkStatusText] ?? props.value;
    case "risk":
      return formatRisk(props.value);
    case "batch":
      return formatBatchStatus(props.value);
    case "reason":
      return formatBatchRetryReason(props.value);
    default:
      return formatStatus(props.value);
  }
});

const cls = computed(() => `status-badge kind-${props.kind ?? "plain"} val-${props.value.toLowerCase()}`);
</script>

<template>
  <span :class="cls">{{ text }}</span>
</template>
