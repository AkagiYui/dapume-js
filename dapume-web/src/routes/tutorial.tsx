/** 路由 `/tutorial` —— 循序渐进的上手教程。 */
import { createFileRoute } from '@tanstack/solid-router';
import Tutorial from '~/pages/Tutorial';

export const Route = createFileRoute('/tutorial')({
  component: Tutorial,
});
