/**
 * 站点头部（指南页、开发者页、乐谱管理页共用；工作台编辑页无 header）。
 * 普通形态：顶部站点标题 + 导航 + 音源加载提示 + 设置按钮。
 * 独立窗口（已安装的 PWA）：改为固定在底部的导航条，仅保留导航按钮与设置（应用化体验）。
 *
 * 页面间导航用「方向感视图过渡」（见 navigateWithTransition），切换页面时有左右滑动动画、不闪烁。
 */
import { Show, type JSX } from 'solid-js';
import { useLocation, useNavigate } from '@tanstack/solid-router';
import { Icon } from '~/components/Icon';
import { SettingsButton } from '~/components/SettingsPanel';
import { cn } from '~/lib/utils';
import { navigateWithTransition } from '~/lib/viewTransition';
import { t } from '~/i18n';
import { loadProgress, pianoState } from '~/stores/player';
import { isStandalone } from '~/lib/pwa';

/** 顶部导航链接样式。 */
const LINK_CLASS =
  'rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground';
// 高亮底色由独立的滑块 pill 提供（见 NavA），切页时滑动；激活态只改文字色
const LINK_ACTIVE = 'text-foreground';

/** 底部导航项样式（图标在上、文字在下）。 */
const BOTTOM_LINK =
  'flex flex-1 flex-col items-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground';
const BOTTOM_ACTIVE = 'text-foreground';

export function SiteHeader() {
  return (
    <Show when={isStandalone()} fallback={<TopHeader />}>
      <BottomNav />
    </Show>
  );
}

/** 带方向感视图过渡的导航锚点；保留 href 以利无障碍/SEO，点击改走过渡导航。
 * pill=true 时激活态渲染一个共享元素高亮块（view-transition-name: nav-active），切页时滑动到新激活项。 */
function NavA(props: {
  to: string;
  exact?: boolean;
  class: string;
  activeClass: string;
  pill?: boolean;
  children: JSX.Element;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  // 忽略末尾斜杠再比较：CF Pages 等可能把 /docs 规范成 /docs/，否则首个按钮高亮(下划线)不出现
  const active = () => {
    const strip = (p: string) => p.replace(/\/+$/, '') || '/';
    const here = strip(location().pathname);
    const target = strip(props.to);
    return props.exact ? here === target : here === target || here.startsWith(`${target}/`);
  };
  return (
    <a
      href={props.to}
      class={cn('relative', props.class, active() && props.activeClass)}
      onClick={(e) => {
        // 仅拦截普通左键点击（保留 Cmd/Ctrl/中键新开标签等原生行为）
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        // 返回 navigate 的 Promise，让视图过渡等待目标页（可能懒加载）渲染完成后再捕获新快照，
        // 否则首次切换会因新页未就绪而「闪一下、无滑动」。
        navigateWithTransition(() => navigate({ to: props.to }), location().pathname, props.to);
      }}
    >
      {/* 激活指示改为底部下划线滑块：切页时在新旧激活项间滑动，且不会盖住文字
          （过渡时命名元素被提升到顶层，填充块会遮文字，故用细下划线）。 */}
      <Show when={props.pill && active()}>
        <span
          class="absolute inset-x-2 bottom-0.5 h-0.5 rounded-full bg-primary"
          style={{ 'view-transition-name': 'nav-active' }}
        />
      </Show>
      {props.children}
    </a>
  );
}

/** 普通（浏览器标签页）形态：顶部粘性头部。 */
function TopHeader() {
  return (
    <header
      class="sticky top-0 z-20 border-b bg-background/80 backdrop-blur"
      style={{ 'view-transition-name': 'site-header' }}
    >
      <div class="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <NavA to="/docs" exact class="flex items-baseline gap-2" activeClass="">
          <span class="text-lg font-bold">{t('app.title')}</span>
          <span class="hidden text-sm text-muted-foreground sm:inline">{t('app.tagline')}</span>
        </NavA>

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
            <NavA to="/docs" exact pill class={LINK_CLASS} activeClass={LINK_ACTIVE}>
              {t('nav.guide')}
            </NavA>
            <NavA to="/developers" pill class={LINK_CLASS} activeClass={LINK_ACTIVE}>
              {t('nav.developers')}
            </NavA>
            <NavA to="/workbench" pill class={LINK_CLASS} activeClass={LINK_ACTIVE}>
              {t('nav.workbench')}
            </NavA>
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
      style={{ 'padding-bottom': 'env(safe-area-inset-bottom)', 'view-transition-name': 'site-header' }}
    >
      {/* 左侧占位 = 设置按钮宽：让 3 个导航按钮居中均分、不被右侧的设置按钮挤偏
          （设置不参与导航按钮的空间计算）。 */}
      <div class="mx-auto flex max-w-md items-stretch px-2">
        <div class="w-9 shrink-0" aria-hidden="true" />
        <div class="flex flex-1 items-stretch justify-around gap-1">
          <NavA to="/docs" exact class={BOTTOM_LINK} activeClass={BOTTOM_ACTIVE}>
            <Icon icon="lucide:book-open" class="text-lg" />
            {t('nav.guide')}
          </NavA>
          <NavA to="/developers" class={BOTTOM_LINK} activeClass={BOTTOM_ACTIVE}>
            <Icon icon="lucide:code" class="text-lg" />
            {t('nav.developers')}
          </NavA>
          <NavA to="/workbench" class={BOTTOM_LINK} activeClass={BOTTOM_ACTIVE}>
            <Icon icon="lucide:music" class="text-lg" />
            {t('nav.workbench')}
          </NavA>
        </div>
        <div class="flex w-9 shrink-0 items-center justify-center">
          <SettingsButton />
        </div>
      </div>
    </nav>
  );
}
