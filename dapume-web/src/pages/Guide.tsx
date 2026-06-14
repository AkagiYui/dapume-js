/**
 * 第一页：规则与语法讲解。
 * 逐节介绍 dapume 语法，并为每个示例提供「播放」按钮；顶部「马上尝试」按钮跳转到工作台。
 */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { parse } from 'dapume-js';
import { GUIDE_SECTIONS } from '~/data/guide';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import { isPlaying, pianoState, play, stop } from '~/stores/player';
import { HighlightedCode } from '~/components/HighlightedCode';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { SettingsButton } from '~/components/SettingsPanel';

export default function Guide() {
  const navigate = useNavigate();
  const [playingCode, setPlayingCode] = createSignal<string | null>(null);

  // 播放自然结束时复位按钮状态
  createEffect(() => {
    if (!isPlaying()) setPlayingCode(null);
  });

  // 离开页面时停止播放
  onCleanup(() => stop());

  function togglePlay(code: string) {
    if (playingCode() === code && isPlaying()) {
      stop();
      setPlayingCode(null);
      return;
    }
    const score = parse(code);
    if (score.notes.length === 0) return;
    setPlayingCode(code);
    void play(score.notes, score.durationMs, 0);
  }

  return (
    <div class="min-h-full">
      {/* 头部 */}
      <header class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
        <div class="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div class="flex items-baseline gap-2">
            <span class="text-lg font-bold">{t('app.title')}</span>
            <span class="hidden text-sm text-muted-foreground sm:inline">{t('app.tagline')}</span>
          </div>
          <div class="flex items-center gap-1">
            <Button variant="ghost" size="sm" class="gap-1.5" onClick={() => navigate('/workbench')}>
              <Icon icon="lucide:square-pen" />
              {t('nav.workbench')}
            </Button>
            <SettingsButton />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section class="mx-auto max-w-4xl px-4 py-14 text-center">
        <h1 class="bg-gradient-to-r from-primary to-foreground bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          {t('guide.heroTitle')}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          {t('guide.heroSubtitle')}
        </p>
        <div class="mt-7 flex items-center justify-center gap-3">
          <Button size="lg" class="gap-2" onClick={() => navigate('/workbench')}>
            {t('guide.heroCta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
        <Show when={pianoState() === 'loading'}>
          <p class="mt-4 text-xs text-muted-foreground">{t('workbench.loadingPiano')}</p>
        </Show>
        <Show when={pianoState() === 'error'}>
          <p class="mt-4 text-xs text-destructive">{t('workbench.audioError')}</p>
        </Show>
      </section>

      {/* 目录 */}
      <nav class="mx-auto max-w-4xl px-4">
        <div class="flex flex-wrap gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <span class="font-medium text-muted-foreground">{t('guide.tocTitle')}:</span>
          <For each={GUIDE_SECTIONS}>
            {(s) => (
              <a href={`#${s.id}`} class="text-primary underline-offset-4 hover:underline">
                {s.title[locale()]}
              </a>
            )}
          </For>
        </div>
      </nav>

      {/* 各章节 */}
      <main class="mx-auto max-w-4xl px-4 py-8">
        <For each={GUIDE_SECTIONS}>
          {(section) => (
            <section id={section.id} class="scroll-mt-20 border-b py-8 last:border-0">
              <h2 class="mb-4 text-2xl font-bold">{section.title[locale()]}</h2>
              <div class="space-y-3 leading-relaxed text-foreground/90">
                <For each={section.paragraphs[locale()]}>{(p) => <p>{p}</p>}</For>
              </div>

              {/* 参考表格 */}
              <Show when={section.table}>
                {(table) => (
                  <div class="mt-4 overflow-x-auto">
                    <table class="w-full border-collapse text-sm">
                      <thead>
                        <tr class="border-b text-left">
                          <For each={table().headers[locale()]}>
                            {(h) => <th class="px-3 py-2 font-medium text-muted-foreground">{h}</th>}
                          </For>
                        </tr>
                      </thead>
                      <tbody>
                        <For each={table().rows}>
                          {(row) => (
                            <tr class="border-b last:border-0">
                              <For each={row}>
                                {(cell) => (
                                  <td class="px-3 py-1.5 font-mono">{cell[locale()]}</td>
                                )}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                )}
              </Show>

              {/* 示例（可播放） */}
              <div class="mt-5 space-y-3">
                <For each={section.examples}>
                  {(ex) => (
                    <div class="rounded-lg border bg-card p-3">
                      <div class="mb-2 flex items-center justify-between gap-3">
                        <span class="text-sm text-muted-foreground">{ex.caption[locale()]}</span>
                        <Button
                          variant={playingCode() === ex.code && isPlaying() ? 'secondary' : 'default'}
                          size="sm"
                          class="shrink-0 gap-1.5"
                          onClick={() => togglePlay(ex.code)}
                        >
                          <Icon icon={playingCode() === ex.code && isPlaying() ? 'lucide:square' : 'lucide:play'} />
                          {playingCode() === ex.code && isPlaying() ? t('common.stop') : t('guide.playExample')}
                        </Button>
                      </div>
                      <HighlightedCode code={ex.code} />
                    </div>
                  )}
                </For>
              </div>
            </section>
          )}
        </For>

        <div class="py-10 text-center">
          <Button size="lg" class="gap-2" onClick={() => navigate('/workbench')}>
            {t('guide.heroCta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
      </main>
    </div>
  );
}
