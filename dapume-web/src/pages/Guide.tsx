/**
 * 第一页：规则与语法讲解。
 * 逐节介绍 dapume 语法，并为每个示例提供「播放」按钮（播放时高亮当前发声的音符字符）；
 * 顶部「马上尝试」按钮跳转到工作台。进入页面即预热音源。
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { activeNotesAt, parse } from 'dapume-js';
import { GUIDE_SECTIONS } from '~/data/guide';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import { currentTimeMs, ensurePiano, isPlaying, play, stop } from '~/stores/player';
import { SiteHeader } from '~/components/SiteHeader';
import { HighlightedCode } from '~/components/HighlightedCode';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';

export default function Guide() {
  const navigate = useNavigate();
  const [playingCode, setPlayingCode] = createSignal<string | null>(null);

  // 进入页面即预热音源（加载进度显示在 header 中）
  onMount(() => {
    ensurePiano().catch(() => {});
  });

  // 当前正在播放的示例对应的乐谱（用于计算高亮）
  const playingScore = createMemo(() => {
    const c = playingCode();
    return c ? parse(c) : null;
  });

  // 当前发声音符的源字符范围
  const activeRanges = createMemo(() => {
    const s = playingScore();
    if (!s || !isPlaying()) return [];
    return activeNotesAt(s, currentTimeMs()).map((n) => ({ from: n.srcStart, to: n.srcEnd }));
  });

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
      <SiteHeader />

      {/* Hero */}
      <section class="mx-auto max-w-4xl px-4 py-14 text-center">
        <h1 class="bg-gradient-to-r from-primary to-foreground bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          {t('guide.heroTitle')}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          {t('guide.heroSubtitle')}
        </p>
        <div class="mt-7 flex items-center justify-center gap-3">
          <Button size="lg" class="gap-2" onClick={() => navigate({ to: '/workbench' })}>
            {t('guide.heroCta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
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
                                {(cell) => <td class="px-3 py-1.5 font-mono">{cell[locale()]}</td>}
                              </For>
                            </tr>
                          )}
                        </For>
                      </tbody>
                    </table>
                  </div>
                )}
              </Show>

              {/* 示例（可播放，播放时高亮当前音符） */}
              <div class="mt-5 space-y-3">
                <For each={section.examples}>
                  {(ex) => {
                    const isThis = () => playingCode() === ex.code && isPlaying();
                    return (
                      <div class="rounded-lg border bg-card p-3">
                        <div class="mb-2 flex items-center justify-between gap-3">
                          <span class="text-sm text-muted-foreground">{ex.caption[locale()]}</span>
                          <Button
                            variant={isThis() ? 'secondary' : 'default'}
                            size="icon"
                            class="size-8 shrink-0"
                            title={isThis() ? t('common.stop') : t('guide.playExample')}
                            aria-label={isThis() ? t('common.stop') : t('guide.playExample')}
                            onClick={() => togglePlay(ex.code)}
                          >
                            <Icon icon={isThis() ? 'lucide:square' : 'lucide:play'} />
                          </Button>
                        </div>
                        <HighlightedCode code={ex.code} highlights={isThis() ? activeRanges() : []} />
                      </div>
                    );
                  }}
                </For>
              </div>
            </section>
          )}
        </For>

        <div class="py-10 text-center">
          <Button size="lg" class="gap-2" onClick={() => navigate({ to: '/workbench' })}>
            {t('guide.heroCta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
      </main>
    </div>
  );
}
