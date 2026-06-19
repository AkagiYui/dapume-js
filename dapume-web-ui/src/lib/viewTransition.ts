/**
 * 页面切换的「方向感」视图过渡（基于原生 View Transitions API）。
 *
 * 顺序（前进方向）：社区首页 → 教程 → 文档 → 开发者 → 乐谱详情 → 收藏 → 求谱 → 后台 → 乐谱库 → 单谱编辑。
 * 开源站没有社区首页（`/` 会 beforeLoad 重定向到 /docs，不参与过渡），故 `/` 单独置 0 对其无副作用，
 * 同时修复社区站「首页 → 文档」因与 /docs 同序号而丢失切换动画的问题。
 * 不支持 startViewTransition 的浏览器（Safari/Firefox 旧版）静默直跳，不影响功能。
 * 配合 app.css 中 `html[data-nav=forward|back]::view-transition-*` 的关键帧。
 */
function routeOrder(path: string): number {
  const clean = path.replace(/\/+$/, '') || '/';
  if (clean === '/') return 0; // 社区首页
  if (clean.startsWith('/tutorial')) return 1;
  if (clean.startsWith('/docs')) return 2;
  if (clean.startsWith('/developers')) return 3;
  if (clean.startsWith('/scores')) return 4; // 社区：乐谱详情
  if (clean.startsWith('/favorites')) return 5; // 社区：收藏
  if (clean.startsWith('/requests')) return 6; // 社区：求谱
  if (clean.startsWith('/admin')) return 7; // 社区：后台
  if (/^\/workbench\/[^/]+/.test(clean)) return 9; // 单谱编辑
  if (clean.startsWith('/workbench')) return 8; // 乐谱库（列表）
  return 0;
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
