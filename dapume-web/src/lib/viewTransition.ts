/**
 * 页面切换的「方向感」视图过渡（基于原生 View Transitions API）。
 *
 * 首页(0) → developers(1) → workbench(2) 为前进（页面向左滑出、新页从右滑入）；反向为后退。
 * 不支持 startViewTransition 的浏览器（Safari/Firefox 旧版）静默直跳，不影响功能。
 * 配合 app.css 中 `html[data-nav=forward|back]::view-transition-*` 的关键帧。
 */
function routeOrder(path: string): number {
  if (path.startsWith('/developers')) return 1;
  if (path.startsWith('/workbench')) return 2;
  return 0; // '/'（指南页）
}

type VTDocument = Document & {
  startViewTransition?: (cb: () => unknown) => { finished: Promise<void> };
};

/** 用方向感视图过渡执行一次导航（run 内部触发实际的路由切换）。 */
export function navigateWithTransition(
  run: () => void | Promise<void>,
  fromPath: string,
  toPath: string,
): void {
  const doc = document as VTDocument;
  // 同一区段（如 /workbench 与 /workbench/$id）或不支持时直接执行
  if (typeof doc.startViewTransition !== 'function' || routeOrder(fromPath) === routeOrder(toPath)) {
    void run();
    return;
  }
  document.documentElement.dataset.nav = routeOrder(toPath) > routeOrder(fromPath) ? 'forward' : 'back';
  const transition = doc.startViewTransition(() => run());
  void transition.finished.finally(() => {
    delete document.documentElement.dataset.nav;
  });
}
