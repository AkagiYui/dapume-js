/**
 * 教程页：循序渐进地带用户从「一个音符」一路搭到「双手多轨谱」。
 * 每步一个可播放示例（播放时高亮当前发声字符），底部一键进入工作台动手写。
 */
import { For, onCleanup, onMount } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { TUTORIAL_SECTIONS } from '~/data/tutorial';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import { ensurePiano, stop } from '~/stores/player';
import { SiteHeader } from '~/components/SiteHeader';
import { SyntaxSections } from '~/components/SyntaxSections';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';

export default function Tutorial() {
  const navigate = useNavigate();

  // 进入页面即预热音源（加载进度显示在 header 中）
  onMount(() => {
    ensurePiano().catch(() => {});
  });
  // 离开页面时停止播放
  onCleanup(() => stop());

  return (
    <div class="min-h-full">
      <SiteHeader />

      {/* Hero */}
      <section class="mx-auto max-w-4xl px-4 py-14 text-center">
        <h1 class="bg-gradient-to-r from-primary to-foreground bg-clip-text text-4xl font-extrabold tracking-tight text-transparent sm:text-5xl">
          {t('tutorial.heroTitle')}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          {t('tutorial.heroSubtitle')}
        </p>
        <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" class="gap-2" onClick={() => navigate({ to: '/workbench' })}>
            {t('tutorial.openWorkbench')}
            <Icon icon="lucide:arrow-right" />
          </Button>
          <Button size="lg" variant="outline" class="gap-2" onClick={() => navigate({ to: '/docs' })}>
            <Icon icon="lucide:book-open" />
            {t('tutorial.fullReference')}
          </Button>
        </div>
      </section>

      {/* 目录（步骤） */}
      <nav class="mx-auto max-w-4xl px-4">
        <div class="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <span class="font-medium text-muted-foreground">{t('guide.tocTitle')}:</span>
          <For each={TUTORIAL_SECTIONS}>
            {(s, i) => (
              <a href={`#${s.id}`} class="text-primary underline-offset-4 hover:underline">
                {i() + 1}. {s.title[locale()]}
              </a>
            )}
          </For>
        </div>
      </nav>

      {/* 各步骤（带序号） */}
      <main class="mx-auto max-w-4xl px-4 py-8">
        <SyntaxSections sections={TUTORIAL_SECTIONS} numbered />

        <div class="space-y-3 py-10 text-center">
          <p class="text-muted-foreground">{t('tutorial.outro')}</p>
          <Button size="lg" class="gap-2" onClick={() => navigate({ to: '/workbench' })}>
            {t('tutorial.openWorkbench')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
      </main>
    </div>
  );
}
