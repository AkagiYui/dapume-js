/** 路由 `/developers` —— 开发者文档（如何使用 dapume-js 包）。 */
import { createFileRoute } from '@tanstack/solid-router';
import { Developers } from 'dapume-web-ui';

export const Route = createFileRoute('/developers')({
  component: Developers,
});
