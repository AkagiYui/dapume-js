/** 路由 `/workbench` —— 工作台。 */
import { createFileRoute } from '@tanstack/solid-router';
import Workbench from '~/pages/Workbench';

export const Route = createFileRoute('/workbench')({
  component: Workbench,
});
