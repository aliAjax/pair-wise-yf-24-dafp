import { ref, watch, type Ref } from "vue";

/** localStorage 持久化状态：跨标签页共享，存储事件由 store 层复核。 */
export function useLocalStorageState<T>(key: string, initial: T): Ref<T> {
  const state = ref(initial) as Ref<T>;
  try {
    const raw = localStorage.getItem(key);
    if (raw != null) state.value = JSON.parse(raw) as T;
  } catch {
    // 解析失败时保留初始值
  }
  watch(
    state,
    (value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // 写入失败（隐私模式等）时静默降级为内存态
      }
    },
    { deep: true }
  );
  return state;
}
