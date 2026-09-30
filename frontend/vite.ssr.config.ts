import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// 仅用于 Node SSR 冒烟测试（tests/ssr.smoke.ts）
export default defineConfig({
  plugins: [vue()],
  build: {
    ssr: "tests/ssr.smoke.ts",
    outDir: "node_modules/.tmp/ssr-dist",
    emptyOutDir: true,
    rollupOptions: {
      external: []
    }
  }
});
