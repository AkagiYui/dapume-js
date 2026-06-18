/**
 * 第一页：规则与语法讲解（参考手册）。逐节介绍 dapume 语法，每个示例可点击播放
 * （播放时高亮当前发声的字符）。需要循序渐进的入门请见「教程」(/tutorial)。
 */
import { For, Show, onCleanup, onMount } from 'solid-js';
import { useLocation, useNavigate } from '@tanstack/solid-router';
import { GUIDE_SECTIONS } from '~/data/guide';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import { ensurePiano, stop } from '~/stores/player';
import { SiteHeader } from '~/components/SiteHeader';
import { SyntaxSections } from '~/components/SyntaxSections';
import { canInstall, promptInstall } from '~/lib/pwa';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { navigateWithTransition } from '~/lib/viewTransition';

export default function Guide() {
  const navigate = useNavigate();
  const location = useLocation();
  const go = (to: '/workbench' | '/tutorial') =>
    navigateWithTransition(() => navigate({ to }), location().pathname, to);

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
          {t('guide.heroTitle')}
        </h1>
        <p class="mx-auto mt-4 max-w-2xl text-balance text-muted-foreground">
          {t('guide.heroSubtitle')}
        </p>
        <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" class="gap-2" onClick={() => go('/workbench')}>
            {t('guide.heroCta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
          {/* 新手入门：跳转循序渐进的教程页 */}
          <Button size="lg" variant="outline" class="gap-2" onClick={() => go('/tutorial')}>
            <Icon icon="lucide:graduation-cap" />
            {t('guide.startTutorial')}
          </Button>
          {/* 安装 PWA：仅当浏览器提供安装入口时显示（部分浏览器无原生入口） */}
          <Show when={canInstall()}>
            <Button size="lg" variant="ghost" class="gap-2" onClick={() => void promptInstall()}>
              <Icon icon="lucide:download" />
              {t('guide.installApp')}
            </Button>
          </Show>
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
        <SyntaxSections sections={GUIDE_SECTIONS} />

        <div class="py-10 text-center">
          <Button size="lg" class="gap-2" onClick={() => go('/workbench')}>
            {t('guide.heroCta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
      </main>
    </div>
  );
}
