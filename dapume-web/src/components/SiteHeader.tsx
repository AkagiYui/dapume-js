/**
 * 站点头部（指南页、开发者页共用；工作台无 header）。
 * 包含：站点标题、导航、音源加载进度提示（在 header 中显示）、设置按钮。
 */
import { Show } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { Icon } from '~/components/Icon';
import { SettingsButton } from '~/components/SettingsPanel';
import { t } from '~/i18n';
import { loadProgress, pianoState } from '~/stores/player';

/** 导航链接基础样式。 */
const LINK_CLASS =
  'rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground';
const LINK_ACTIVE = { class: 'text-foreground bg-accent' };

export function SiteHeader() {
  return (
    <header class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur">
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" class="flex items-baseline gap-2">
          <span class="text-lg font-bold">{t('app.title')}</span>
          <span class="hidden text-sm text-muted-foreground sm:inline">{t('app.tagline')}</span>
        </Link>

        <div class="flex items-center gap-1">
          {/* 音源加载进度（显示在 header 内，不在正文） */}
          <Show when={pianoState() === 'loading'}>
            <span class="mr-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon icon="lucide:loader-circle" class="animate-spin" />
              <span class="hidden md:inline">{t('workbench.loadingPiano')}</span>
              <span class="tabular-nums">{Math.round(loadProgress() * 100)}%</span>
            </span>
          </Show>
          <Show when={pianoState() === 'error'}>
            <span class="mr-1 flex items-center gap-1.5 text-xs text-destructive">
              <Icon icon="lucide:triangle-alert" />
              <span class="hidden md:inline">{t('workbench.audioError')}</span>
            </span>
          </Show>

          <nav class="flex items-center gap-0.5">
            <Link to="/" activeOptions={{ exact: true }} class={LINK_CLASS} activeProps={LINK_ACTIVE}>
              {t('nav.guide')}
            </Link>
            <Link to="/developers" class={LINK_CLASS} activeProps={LINK_ACTIVE}>
              {t('nav.developers')}
            </Link>
            <Link to="/workbench" class={LINK_CLASS} activeProps={LINK_ACTIVE}>
              {t('nav.workbench')}
            </Link>
          </nav>
          <SettingsButton />
        </div>
      </div>
    </header>
  );
}
