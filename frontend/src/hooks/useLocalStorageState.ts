import { ref, watch, type Ref } from "vue";

/**
 * localStorage 持久化状态（响应式），跨标签页 storage 事件自动同步。
 * @param key 存储键
 * @param defaultValue 默认值
 */
export function useLocalStorageState<T>(
  key: string,
  defaultValue: T
): { value: Ref<T>; remove: () => void } {
  const read = (): T => {
    if (typeof localStorage === "undefined") return defaultValue;
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  };

  const value = ref(read()) as Ref<T>;

  watch(
    value,
    (next) => {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(key, JSON.stringify(next));
    },
    { deep: true }
  );

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (event) => {
      if (event.key === key) value.value = read();
    });
  }

  const remove = () => {
    localStorage.removeItem(key);
    value.value = defaultValue;
  };

  return { value, remove };
}
