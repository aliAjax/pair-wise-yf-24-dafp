import { __useStorageBackend } from "../src/api/storage";
import { seedIfNeeded } from "../src/services/seeder";
import { createPinia, setActivePinia } from "pinia";
import { renderToString } from "@vue/server-renderer";
import { createSSRApp, h } from "vue";
import ElementPlus from "element-plus";

function memoryBackend() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key)
  };
}

async function mount(name: string, loader: () => Promise<any>): Promise<string> {
  __useStorageBackend(memoryBackend());
  seedIfNeeded();
  const pinia = createPinia();
  setActivePinia(pinia);
  const component = (await loader()).default;
  const app = createSSRApp({ render: () => h(component) });
  app.use(pinia);
  app.use(ElementPlus);
  const html = await renderToString(app);
  if (html.length < 100) throw new Error(`${name} 渲染内容异常地短`);
  return html;
}

async function main() {
  const pages: Array<[string, () => Promise<any>, string[]]> = [
    ["文档导入", () => import("../src/pages/DocumentsPage.vue"), ["文档导入", "导入新文档"]],
    ["版本对比", () => import("../src/pages/ComparePage.vue"), ["版本对比", "发起比较"]],
    ["风险标注", () => import("../src/pages/RisksPage.vue"), ["风险标注"]],
    ["审阅清单", () => import("../src/pages/ReviewPage.vue"), ["审阅清单", "待处理区"]]
  ];

  let passed = 0;
  for (const [name, loader, markers] of pages) {
    try {
      const html = await mount(name, loader);
      const missing = markers.filter((marker) => !html.includes(marker));
      if (missing.length === 0) {
        console.info(`✓ ${name} 渲染成功（${html.length} 字符）`);
        passed += 1;
      } else {
        console.error(`✗ ${name} 缺少文案：${missing.join("、")}`);
        process.exitCode = 1;
      }
    } catch (error) {
      console.error(`✗ ${name} 渲染失败：`, error);
      process.exitCode = 1;
    }
  }
  console.info(`SSR 冒烟：${passed}/${pages.length} 通过`);
}

main();
