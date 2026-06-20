/** 应用入口：基于 TanStack Router（文件式路由 + history 模式）。 */
/// <reference types="vite-plugin-pwa/client" />
import 'dapume-web-ui/styles.css';
import { createSignal } from 'solid-js';
import { render } from 'solid-js/web';
import { RouterProvider, createRouter } from '@tanstack/solid-router';
import { registerSW } from 'virtual:pwa-register';
import { routeTree } from './routeTree.gen';
import { UpdateToast, isStandalone, rememberPath, takeStartPath } from 'dapume-web-ui';

// PWA 启动恢复：独立窗口下、当前在起始页(/)、且存在已保存的其它路径时，
// 在创建路由前改写地址，使路由直接渲染上次访问的页面（无闪烁）。
if (isStandalone()) {
  const last = takeStartPath();
  const here = window.location.pathname + window.location.search;
  if (last && last !== here && window.location.pathname === '/') {
    try {
      window.history.replaceState(null, '', last);
    } catch {
      /* 忽略 */
    }
  }
}

// 去掉非根路径末尾多余的斜杠（如 CF Pages 把 /docs 规范成 /docs/），保持 URL 干净，
// 也确保导航高亮（按 pathname 精确匹配）不因末尾斜杠而失配。
{
  const path = window.location.pathname;
  if (path.length > 1 && path.endsWith('/')) {
    try {
      window.history.replaceState(
        null,
        '',
        path.replace(/\/+$/, '') + window.location.search + window.location.hash,
      );
    } catch {
      /* 忽略 */
    }
  }
}

const router = createRouter({
  routeTree,
  // 不用 TanStack 的 preloadRoute（该版本在本项目下会抛 _nonReactive 错），
  // 改为下方「空闲时直接 import 页面模块」来预加载，效果一致且无副作用。
  defaultPreload: false,
  scrollRestoration: true,
  // 统一去掉末尾斜杠（CF Pages 等可能把 /docs 规范成 /docs/），保持 URL 干净、避免高亮判断失配
  trailingSlash: 'never',
});

// 类型安全注册（声明合并）
declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById('root');
if (root) {
  // SSG 预渲染的内容已直接写在 #root 中。Solid 的 render() 是「追加」而非「替换」，
  // 若不先清空会导致内容渲染两份（预渲染的死内容叠在客户端实例之上）。
  // 这里我们用 render()（非 hydrate），先清空预渲染内容再挂载客户端 SPA。
  root.textContent = '';
  // PWA 提示式更新：检测到新 SW 等待时弹出轻量提示，用户确认后 skipWaiting + 重载取新资源。
  const [updateReady, setUpdateReady] = createSignal(false);
  const updateSW = registerSW({ onNeedRefresh: () => setUpdateReady(true) });
  render(
    () => (
      <>
        <RouterProvider router={router} />
        <UpdateToast
          show={updateReady()}
          onRefresh={() => void updateSW(true)}
          onDismiss={() => setUpdateReady(false)}
        />
      </>
    ),
    root,
  );

  // 记住当前路径，供 PWA 下次启动恢复到上次访问的页面
  rememberPath(window.location.pathname + window.location.search);
  router.subscribe('onResolved', () => {
    rememberPath(window.location.pathname + window.location.search);
  });

  // 空闲时预取各页面分包，后续导航无需等待下载（页面已迁入 dapume-web-ui，按子路径分别预取，
  // 与路由懒加载命中同一分包；用子路径而非整包 barrel，避免与路由的静态导入冲突）。
  const preloadPages = () => {
    void import('dapume-web-ui/pages/Developers');
    void import('dapume-web-ui/pages/ScoreManager');
    void import('dapume-web-ui/pages/Workbench');
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(preloadPages, { timeout: 3000 });
  } else {
    setTimeout(preloadPages, 1500);
  }
}
