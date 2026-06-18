/** 路由 `/` —— 重定向到 /docs（首页内容已迁移至 /docs）。 */
import { createFileRoute, redirect } from '@tanstack/solid-router';

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/docs' });
  },
});
