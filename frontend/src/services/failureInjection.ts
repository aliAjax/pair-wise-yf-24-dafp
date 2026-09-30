/**
 * 可选故障注入：默认关闭。
 * 让指定段落键的差异计算抛错，用于验证“计算失败保留已完成结果、重试只补缺口”。
 * 浏览器控制台：globalThis.__POLICY_DIFF_FAIL_KEYS__ = ["3"]；
 * worker 上下文中同样读取 globalThis。
 */
declare global {
  // eslint-disable-next-line no-var
  var __POLICY_DIFF_FAIL_KEYS__: string[] | undefined;
}

export function getFailureKeys(): Set<string> {
  const configured = globalThis.__POLICY_DIFF_FAIL_KEYS__;
  return new Set(Array.isArray(configured) ? configured : []);
}

export function shouldFailSection(key: string): boolean {
  return getFailureKeys().has(key);
}

export {};
