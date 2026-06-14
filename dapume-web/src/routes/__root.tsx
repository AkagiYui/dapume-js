/**
 * 根路由布局。各页面头部不同（指南/开发者有 SiteHeader，工作台无 header），
 * 因此根布局只渲染出口 <Outlet />，不放全局头部。
 */
import { Outlet, createRootRoute } from '@tanstack/solid-router';

export const Route = createRootRoute({
  component: () => <Outlet />,
  notFoundComponent: () => (
    <div class="flex min-h-screen items-center justify-center text-muted-foreground">404</div>
  ),
});
