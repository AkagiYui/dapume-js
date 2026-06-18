/**
 * SSR / 预渲染入口。仅用于构建期把指定路由渲染为 HTML 字符串（SSG），
 * 客户端仍走 src/index.tsx 的 render()（非 hydrate），首屏静态内容随后被客户端接管。
 */
import { renderToStringAsync } from 'solid-js/web';
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/solid-router';
import { routeTree } from './routeTree.gen';

/** 需要预渲染（SSG）的路由。`/` 改为重定向到 /docs，故预渲染 /docs；其余（如 /workbench）保持纯 SPA。 */
export const ROUTES = ['/docs', '/developers'] as const;

/** 把单个路由 URL 渲染为放入 <div id="root"> 内的 HTML 字符串。 */
export async function renderPage(url: string): Promise<string> {
  const router = createRouter({
    routeTree,
    // 服务端必须显式提供 history（内存历史，指向目标 URL）
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  await router.load();
  return await renderToStringAsync(() => <RouterProvider router={router} />);
}
