/**
 * 页面切换的「方向感」视图过渡（基于原生 View Transitions API）。
 *
 * 教程 → 文档 → 开发者 → 乐谱库 → 单谱编辑为前进；反向为后退。
 * 不支持 startViewTransition 的浏览器（Safari/Firefox 旧版）静默直跳，不影响功能。
 * 配合 app.css 中 `html[data-nav=forward|back]::view-transition-*` 的关键帧。
 */
function routeOrder(path: string): number {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean.startsWith('/tutorial')) return 0;
  if (clean === '/' || clean.startsWith('/docs')) return 1;
  if (clean.startsWith('/developers')) return 2;
  if (/^\/workbench\/[^/]+/.test(clean)) return 4;
  if (clean.startsWith('/workbench')) return 3;
  return 1;
}

type VTDocument = Document & {
  startViewTransition?: (cb: () => unknown) => { finished: Promise<void> };
};

let fallbackTimer = 0;

/** 用方向感视图过渡执行一次导航（run 内部触发实际的路由切换）。 */
export function navigateWithTransition(
  run: () => void | Promise<void>,
  fromPath: string,
  toPath: string,
): void {
  const doc = document as VTDocument;
  const fromOrder = routeOrder(fromPath);
  const toOrder = routeOrder(toPath);
  if (fromOrder === toOrder) {
    void run();
    return;
  }
  const direction = toOrder > fromOrder ? 'forward' : 'back';
  // 不支持原生 View Transitions 时，至少保留目标页入场动画；导航本身不延迟。
  if (typeof doc.startViewTransition !== 'function') {
    window.clearTimeout(fallbackTimer);
    document.documentElement.dataset.navFallback = direction;
    void Promise.resolve(run()).finally(() => {
      fallbackTimer = window.setTimeout(() => delete document.documentElement.dataset.navFallback, 320);
    });
    return;
  }
  document.documentElement.dataset.nav = direction;
  const transition = doc.startViewTransition(() => run());
  void transition.finished.finally(() => {
    delete document.documentElement.dataset.nav;
  });
}
