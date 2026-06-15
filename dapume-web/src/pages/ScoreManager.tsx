/**
 * 乐谱管理页（路由 /workbench）。
 * 列出浏览器中（IndexedDB）的全部乐谱，可新建 / 打开 / 重命名 / 删除。
 * 提供「直接访问时自动打开上次乐谱」开关；点击乐谱进入 /workbench/{id} 编辑。
 */
import { For, Show, createSignal, onMount } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { parse } from 'dapume-js';
import { SiteHeader } from '~/components/SiteHeader';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '~/components/ui/switch';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import {
  INITIAL_PATH,
  autoOpenLast,
  consumeAutoOpenCheck,
  createScore,
  deleteScore,
  ensureSeeded,
  getLastScoreId,
  getScore,
  refreshScores,
  renameScore,
  scores,
  setAutoOpenLast,
  type ScoreDoc,
} from '~/stores/scores';

/** 新建乐谱的初始内容。 */
const NEW_SCORE = '1=C 120bpm\n1234567';

/** 毫秒 → m:ss。 */
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 轻量统计（音符数 / 时长）。 */
function statsOf(content: string): { notes: number; dur: number } {
  try {
    const s = parse(content);
    return { notes: s.notes.length, dur: s.durationMs };
  } catch {
    return { notes: 0, dur: 0 };
  }
}

function formatDate(ms: number, loc: string): string {
  try {
    return new Date(ms).toLocaleString(loc === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export default function ScoreManager() {
  const navigate = useNavigate();
  const [ready, setReady] = createSignal(false);

  onMount(async () => {
    await ensureSeeded(t('manager.untitled'));
    // 仅在「直接访问 /workbench、本次加载首次进入」且开关开启时，自动打开上次乐谱
    if (consumeAutoOpenCheck() && INITIAL_PATH === '/workbench' && autoOpenLast()) {
      const lastId = getLastScoreId();
      if (lastId && (await getScore(lastId))) {
        navigate({ to: '/workbench/$id', params: { id: lastId }, replace: true });
        return;
      }
    }
    await refreshScores();
    setReady(true);
  });

  async function onNew() {
    const doc = await createScore(t('manager.untitled'), NEW_SCORE);
    navigate({ to: '/workbench/$id', params: { id: doc.id } });
  }

  async function onRename(doc: ScoreDoc) {
    const name = window.prompt(t('manager.renamePrompt'), doc.title);
    if (name != null && name.trim()) await renameScore(doc.id, name);
  }

  async function onDelete(doc: ScoreDoc) {
    if (window.confirm(t('manager.confirmDelete', { title: doc.title }))) {
      await deleteScore(doc.id);
    }
  }

  return (
    <div class="min-h-full">
      <SiteHeader />

      <main class="mx-auto max-w-4xl px-4 py-8">
        <div class="flex items-end justify-between gap-3">
          <div>
            <h1 class="text-3xl font-extrabold tracking-tight">{t('manager.title')}</h1>
            <p class="mt-2 text-muted-foreground">{t('manager.subtitle')}</p>
          </div>
          <Button class="shrink-0 gap-1.5" onClick={onNew}>
            <Icon icon="lucide:plus" />
            {t('manager.new')}
          </Button>
        </div>

        {/* 自动打开开关 */}
        <Switch
          checked={autoOpenLast()}
          onChange={setAutoOpenLast}
          class="mt-5 flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2"
        >
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
          <SwitchLabel class="flex items-center gap-1.5 text-sm">
            <Icon icon="lucide:rotate-cw" />
            {t('manager.autoOpen')}
          </SwitchLabel>
        </Switch>

        {/* 乐谱列表 */}
        <Show when={ready()}>
          <Show
            when={scores().length > 0}
            fallback={
              <div class="mt-10 rounded-lg border border-dashed py-16 text-center text-muted-foreground">
                {t('manager.empty')}
              </div>
            }
          >
            <div class="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <For each={scores()}>
                {(doc) => {
                  const s = statsOf(doc.content);
                  return (
                    <div class="group flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-primary/50">
                      <button
                        type="button"
                        class="min-w-0 text-left"
                        onClick={() => navigate({ to: '/workbench/$id', params: { id: doc.id } })}
                      >
                        <div class="flex items-center gap-1.5">
                          <Icon icon="lucide:file-music" class="shrink-0 text-primary" />
                          <span class="truncate font-medium">{doc.title}</span>
                        </div>
                        <div class="mt-1 text-xs text-muted-foreground">
                          {s.notes} {t('manager.notes')} · {fmt(s.dur)} · {t('manager.updated')}{' '}
                          {formatDate(doc.updatedAt, locale())}
                        </div>
                      </button>
                      <div class="mt-3 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          class="gap-1.5"
                          onClick={() => navigate({ to: '/workbench/$id', params: { id: doc.id } })}
                        >
                          <Icon icon="lucide:square-pen" />
                          {t('manager.open')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          class="ml-auto size-8"
                          aria-label={t('manager.rename')}
                          title={t('manager.rename')}
                          onClick={() => onRename(doc)}
                        >
                          <Icon icon="lucide:pencil" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          class="size-8 text-destructive hover:text-destructive"
                          aria-label={t('manager.delete')}
                          title={t('manager.delete')}
                          onClick={() => onDelete(doc)}
                        >
                          <Icon icon="lucide:trash-2" />
                        </Button>
                      </div>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </Show>
      </main>
    </div>
  );
}
