/** 路由 `/tutorial` —— 循序渐进的上手教程。 */
import { createFileRoute } from '@tanstack/solid-router';
import { Tutorial } from 'dapume-web-ui';

export const Route = createFileRoute('/tutorial')({
  component: Tutorial,
});
