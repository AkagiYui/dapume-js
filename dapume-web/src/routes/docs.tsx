/** 路由 `/docs` —— 规则与语法（原首页内容，已从 `/` 迁移至此）。 */
import { createFileRoute } from '@tanstack/solid-router';
import { Guide } from 'dapume-web-ui';

export const Route = createFileRoute('/docs')({
  component: Guide,
});
