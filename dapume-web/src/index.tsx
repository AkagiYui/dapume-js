/** 应用入口：基于 TanStack Router（文件式路由 + history 模式）。 */
import './app.css';
import { render } from 'solid-js/web';
import { RouterProvider, createRouter } from '@tanstack/solid-router';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  // 不用 TanStack 的 preloadRoute（该版本在本项目下会抛 _nonReactive 错），
  // 改为下方「空闲时直接 import 页面模块」来预加载，效果一致且无副作用。
  defaultPreload: false,
  scrollRestoration: true,
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
  render(() => <RouterProvider router={router} />, root);

  // 页面加载完成后，空闲时主动预加载各主要页面的代码块（不再仅在 hover 导航按钮时才预加载）。
  // 直接 import 页面模块即可命中并缓存其分包，后续导航无需等待下载。
  const preloadPages = () => {
    void import('./pages/Developers');
    void import('./pages/ScoreManager');
    void import('./pages/Workbench');
  };
  if ('requestIdleCallback' in window) {
    requestIdleCallback(preloadPages, { timeout: 3000 });
  } else {
    setTimeout(preloadPages, 1500);
  }
}
