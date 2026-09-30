<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { routes } from "./router/routes";
import { seedIfNeeded } from "./services/seeder";

onMounted(() => {
  seedIfNeeded();
});
</script>

<template>
  <div class="shell">
    <aside>
      <div class="brand">隐私政策差异对比器</div>
      <nav>
        <RouterLink
          v-for="route in routes.filter((item) => item.name)"
          :key="route.path"
          :to="route.path"
        >
          {{ route.name }}
        </RouterLink>
      </nav>
      <p class="aside-hint">比较先进待生效区，来源复核通过后一次性生效</p>
    </aside>
    <main class="page">
      <RouterView />
    </main>
  </div>
</template>
