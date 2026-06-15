/** 路由 `/workbench/$id` —— 编辑指定乐谱。 */
import { Show, createEffect, createResource } from 'solid-js';
import { createFileRoute, useNavigate } from '@tanstack/solid-router';
import Workbench from '~/pages/Workbench';
import { getScore } from '~/stores/scores';

export const Route = createFileRoute('/workbench/$id')({
  component: EditorRoute,
});

function EditorRoute() {
  const params = Route.useParams();
  const navigate = useNavigate();
  // 按 id 从 IndexedDB 加载乐谱；id 变化（切换乐谱）会自动重新加载
  const [doc] = createResource(
    () => params().id,
    (id) => getScore(id).then((d) => d ?? null),
  );

  // 乐谱不存在（如已删除/无效 id）→ 回到管理页
  createEffect(() => {
    if (doc() === null) navigate({ to: '/workbench', replace: true });
  });

  return (
    <Show
      when={doc()}
      keyed
      fallback={
        <div class="flex h-screen items-center justify-center text-sm text-muted-foreground">…</div>
      }
    >
      {(d) => <Workbench doc={d} />}
    </Show>
  );
}
