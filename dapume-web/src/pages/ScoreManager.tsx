/**
 * 乐谱管理页（路由 /workbench）。
 * 列出浏览器中（IndexedDB）的全部乐谱，可新建 / 打开 / 重命名 / 删除。
 * 提供「直接访问时自动打开上次乐谱」开关；点击乐谱进入 /workbench/{id} 编辑。
 */
import { For, Show, createSignal, onCleanup, onMount } from 'solid-js';
import { useLocation, useNavigate } from '@tanstack/solid-router';
import { parse } from 'dapume-js';
import { SiteHeader } from '~/components/SiteHeader';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '~/components/ui/switch';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import { ImportDialog, ShareDialog } from '~/components/QrDialogs';
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
import { navigateWithTransition } from '~/lib/viewTransition';

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
  const location = useLocation();
  const [ready, setReady] = createSignal(false);

  // 本页用按需滚动条（auto），避免常驻槽位与弹窗 scroll-lock 叠加导致的空滚动条 / layout shift
  document.documentElement.classList.add('auto-gutter');
  onCleanup(() => document.documentElement.classList.remove('auto-gutter'));

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
    openScore(doc.id);
  }

  function openScore(id: string) {
    navigateWithTransition(
      () => navigate({ to: '/workbench/$id', params: { id } }),
      location().pathname,
      `/workbench/${id}`,
    );
  }

  // 重命名 / 删除改用组件库弹窗（替代浏览器 prompt/confirm）
  const [renameTarget, setRenameTarget] = createSignal<ScoreDoc | null>(null);
  const [renameValue, setRenameValue] = createSignal('');
  const [deleteTarget, setDeleteTarget] = createSignal<ScoreDoc | null>(null);
  // 记录打开弹窗前的触发按钮，关闭后还原焦点（并规避 aria-hidden 警告）
  let restoreFocus: HTMLElement | null = null;

  function openRename(doc: ScoreDoc) {
    restoreFocus = document.activeElement as HTMLElement | null;
    restoreFocus?.blur();
    setRenameValue(doc.title);
    setRenameTarget(doc);
  }
  async function confirmRename() {
    const doc = renameTarget();
    const name = renameValue().trim();
    if (doc && name) await renameScore(doc.id, name);
    setRenameTarget(null);
  }
  function openDelete(doc: ScoreDoc) {
    restoreFocus = document.activeElement as HTMLElement | null;
    restoreFocus?.blur();
    setDeleteTarget(doc);
  }
  async function confirmDelete() {
    const doc = deleteTarget();
    if (doc) await deleteScore(doc.id);
    setDeleteTarget(null);
  }

  // 分享 / 导入（二维码）
  const [shareTarget, setShareTarget] = createSignal<ScoreDoc | null>(null);
  const [importOpen, setImportOpen] = createSignal(false);
  async function onImported(title: string, content: string) {
    setImportOpen(false);
    const doc = await createScore(title.trim() || t('manager.untitled'), content);
    openScore(doc.id);
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
          <div class="flex shrink-0 items-center gap-2">
            <Button variant="outline" class="gap-1.5" onClick={() => setImportOpen(true)}>
              <Icon icon="lucide:qr-code" />
              {t('manager.import')}
            </Button>
            <Button class="gap-1.5" onClick={onNew}>
              <Icon icon="lucide:plus" />
              {t('manager.new')}
            </Button>
          </div>
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
                      {/* 卡片本身不再点击进入编辑（仅「打开」按钮进入），避免误触 */}
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <Icon icon="lucide:file-music" class="shrink-0 text-primary" />
                          <span class="truncate font-medium">{doc.title}</span>
                        </div>
                        <div class="mt-1 text-xs text-muted-foreground">
                          {s.notes} {t('manager.notes')} · {fmt(s.dur)} · {t('manager.updated')}{' '}
                          {formatDate(doc.updatedAt, locale())}
                        </div>
                      </div>
                      <div class="mt-3 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="secondary"
                          class="gap-1.5"
                          onClick={() => openScore(doc.id)}
                        >
                          <Icon icon="lucide:square-pen" />
                          {t('manager.open')}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          class="size-8"
                          aria-label={t('manager.share')}
                          title={t('manager.share')}
                          onClick={() => setShareTarget(doc)}
                        >
                          <Icon icon="lucide:share-2" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          class="ml-auto size-8"
                          aria-label={t('manager.rename')}
                          title={t('manager.rename')}
                          onClick={() => openRename(doc)}
                        >
                          <Icon icon="lucide:pencil" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          class="size-8 text-destructive hover:text-destructive"
                          aria-label={t('manager.delete')}
                          title={t('manager.delete')}
                          onClick={() => openDelete(doc)}
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

      {/* 重命名弹窗 */}
      <Dialog
        open={renameTarget() !== null}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            restoreFocus?.focus();
          }}
        >
          <DialogTitle class="mb-3">{t('manager.renameTitle')}</DialogTitle>
          <label class="mb-1.5 block text-sm text-muted-foreground">{t('manager.renamePrompt')}</label>
          <input
            class="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={renameValue()}
            onInput={(e) => setRenameValue(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void confirmRename();
              }
            }}
            autofocus
          />
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setRenameTarget(null)}>
              {t('manager.cancel')}
            </Button>
            <Button onClick={() => void confirmRename()} disabled={!renameValue().trim()}>
              {t('manager.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除二次确认弹窗 */}
      <Dialog
        open={deleteTarget() !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
      >
        <DialogContent
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            restoreFocus?.focus();
          }}
        >
          <DialogTitle class="mb-3">{t('manager.deleteTitle')}</DialogTitle>
          <p class="text-sm text-muted-foreground">
            {t('manager.confirmDelete', { title: deleteTarget()?.title ?? '' })}
          </p>
          <div class="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              {t('manager.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()}>
              {t('manager.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 二维码分享 / 导入 */}
      <ShareDialog
        open={shareTarget() !== null}
        title={shareTarget()?.title ?? ''}
        content={shareTarget()?.content ?? ''}
        onClose={() => setShareTarget(null)}
      />
      <ImportDialog
        open={importOpen()}
        onClose={() => setImportOpen(false)}
        onImported={(title, content) => void onImported(title, content)}
      />
    </div>
  );
}
