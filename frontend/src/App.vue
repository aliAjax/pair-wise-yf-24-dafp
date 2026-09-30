<script setup lang="ts">
import { computed, ref, shallowRef } from "vue";
import { routes } from "./router/routes";
import { mockData } from "./mocks/seedData";
import StatusBadge from "./components/common/StatusBadge.vue";
import StatCard from "./components/common/StatCard.vue";
import DocumentsPage from "./pages/DocumentsPage.vue";
import ComparePage from "./pages/ComparePage.vue";
import RisksPage from "./pages/RisksPage.vue";
import ReviewPage from "./pages/ReviewPage.vue";

const active = ref<string>(routes[1]?.route ?? "/compare");
const current = computed(() => routes.find((route) => route.route === active.value) ?? routes[0]);
const entries = Object.entries(mockData);

const pageComponents: Record<string, unknown> = {
  "/documents": DocumentsPage,
  "/compare": ComparePage,
  "/risks": RisksPage,
  "/review": ReviewPage
};
const currentPage = shallowRef(pageComponents[active.value] ?? ComparePage);

function navigate(route: string) {
  active.value = route;
  currentPage.value = pageComponents[route] ?? ComparePage;
}
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand">隐私政策差异对比器</div>
      <nav>
        <button v-for="route in routes" :key="route.route" :class="{ active: active === route.route }" @click="navigate(route.route)">{{ route.name }}</button>
      </nav>
    </aside>
    <main class="page">
      <section class="page-head"><div><p class="eyebrow">policy-diff</p><h1>{{ current?.name }}</h1></div><StatusBadge value="LOCAL_DATA" /></section>
      <section class="metrics"><StatCard label="核心模型" :value="entries.length" /><StatCard label="共享枚举" :value="4" /><StatCard label="本地记录" :value="entries.reduce((s, [, rows]) => s + rows.length, 0)" /></section>
      <component :is="currentPage" />
    </main>
  </div>
</template>
