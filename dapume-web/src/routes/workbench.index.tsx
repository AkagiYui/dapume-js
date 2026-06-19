/** 路由 `/workbench` —— 乐谱管理（列表）。 */
import { createFileRoute } from '@tanstack/solid-router';
import { ScoreManager } from 'dapume-web-ui';

export const Route = createFileRoute('/workbench/')({
  component: ScoreManager,
});
