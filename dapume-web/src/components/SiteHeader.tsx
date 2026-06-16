/**
 * 站点头部（指南页、开发者页、乐谱管理页共用；工作台编辑页无 header）。
 * 普通形态：顶部站点标题 + 导航 + 音源加载提示 + 设置按钮。
 * 独立窗口（已安装的 PWA）：改为固定在底部的导航条，仅保留导航按钮与设置（应用化体验）。
 */
import { Show } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { Icon } from '~/components/Icon';
import { SettingsButton } from '~/components/SettingsPanel';
import { t } from '~/i18n';
import { loadProgress, pianoState } from '~/stores/player';
import { isStandalone } from '~/lib/pwa';

/** 顶部导航链接样式。 */
const LINK_CLASS =
  'rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground';
const LINK_ACTIVE = { class: 'text-foreground bg-accent' };

/** 底部导航项样式（图标在上、文字在下）。 */
const BOTTOM_LINK =
  'flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground';
const BOTTOM_ACTIVE = { class: 'text-foreground' };

export function SiteHeader() {
  return (
    <Show when={isStandalone()} fallback={<TopHeader />}>
      <BottomNav />
    </Show>
  );
}

/** 普通（浏览器标签页）形态：顶部粘性头部。 */
function TopHeader() {
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

/** 独立窗口（PWA）形态：固定在底部、仅导航按钮 + 设置。 */
function BottomNav() {
  return (
    <nav
      class="fixed inset-x-0 bottom-0 z-30 border-t bg-background/90 backdrop-blur"
      style={{ 'padding-bottom': 'env(safe-area-inset-bottom)' }}
    >
      <div class="mx-auto flex max-w-md items-stretch justify-around gap-1 px-2">
        <Link to="/" activeOptions={{ exact: true }} class={BOTTOM_LINK} activeProps={BOTTOM_ACTIVE}>
          <Icon icon="lucide:book-open" class="text-lg" />
          {t('nav.guide')}
        </Link>
        <Link to="/developers" class={BOTTOM_LINK} activeProps={BOTTOM_ACTIVE}>
          <Icon icon="lucide:code" class="text-lg" />
          {t('nav.developers')}
        </Link>
        <Link to="/workbench" class={BOTTOM_LINK} activeProps={BOTTOM_ACTIVE}>
          <Icon icon="lucide:music" class="text-lg" />
          {t('nav.workbench')}
        </Link>
        <div class="flex items-center px-1">
          <SettingsButton />
        </div>
      </div>
    </nav>
  );
}
