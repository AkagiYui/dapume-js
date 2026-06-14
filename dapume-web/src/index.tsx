/** 应用入口：基于 TanStack Router（文件式路由 + history 模式）。 */
import './app.css';
import { render } from 'solid-js/web';
import { RouterProvider, createRouter } from '@tanstack/solid-router';
import { routeTree } from './routeTree.gen';

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
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
  render(() => <RouterProvider router={router} />, root);
}
