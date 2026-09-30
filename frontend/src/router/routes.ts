import { createRouter, createWebHashHistory, type RouteRecordRaw } from "vue-router";

export const routes: RouteRecordRaw[] = [
  { path: "/", redirect: "/documents" },
  { path: "/documents", name: "文档导入", component: () => import("../pages/DocumentsPage.vue") },
  { path: "/compare", name: "版本对比", component: () => import("../pages/ComparePage.vue") },
  { path: "/risks", name: "风险标注", component: () => import("../pages/RisksPage.vue") },
  { path: "/review", name: "审阅清单", component: () => import("../pages/ReviewPage.vue") }
];

export const router = createRouter({
  history: createWebHashHistory(),
  routes
});
