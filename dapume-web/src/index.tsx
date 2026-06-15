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
  // SSG 预渲染的内容已直接写在 #root 中。Solid 的 render() 是「追加」而非「替换」，
  // 若不先清空会导致内容渲染两份（预渲染的死内容叠在客户端实例之上）。
  // 这里我们用 render()（非 hydrate），先清空预渲染内容再挂载客户端 SPA。
  root.textContent = '';
  render(() => <RouterProvider router={router} />, root);
}
