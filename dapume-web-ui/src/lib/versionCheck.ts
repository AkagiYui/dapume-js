/**
 * 版本轮询：用于「无 Service Worker」的部署（如社区站）。
 * 定期（及标签页重新可见时）拉取 /version.json，与当前构建版本比较，发现不同即回调一次。
 * 调用方据此弹出更新提示，确认后 location.reload() 取最新静态资源。
 */
export function watchForUpdate(
  currentVersion: string,
  onUpdate: () => void,
  intervalMs = 5 * 60 * 1000,
): () => void {
  if (typeof window === 'undefined' || !currentVersion) return () => {};
  let stopped = false;
  let fired = false;

  async function check() {
    if (stopped || fired) return;
    try {
      const r = await fetch('/version.json', { cache: 'no-store' });
      if (!r.ok) return;
      const j = (await r.json()) as { version?: string };
      if (j.version && j.version !== currentVersion) {
        fired = true;
        onUpdate();
      }
    } catch {
      /* 网络抖动忽略 */
    }
  }

  const timer = window.setInterval(check, intervalMs);
  const onVisible = () => {
    if (document.visibilityState === 'visible') void check();
  };
  document.addEventListener('visibilitychange', onVisible);
  void check();

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
