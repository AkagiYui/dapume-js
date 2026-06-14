/** 路由 `/` —— 规则与语法（指南页）。 */
import { createFileRoute } from '@tanstack/solid-router';
import Guide from '~/pages/Guide';

export const Route = createFileRoute('/')({
  component: Guide,
});
