/**
 * 设置面板：深浅色、主题色、语言。供指南页头部弹出层与工作台控制区共用。
 */
import { For, Show, type JSX } from 'solid-js';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Icon } from '~/components/Icon';
import { t } from '~/i18n';
import {
  THEME_COLORS,
  type ThemeColor,
  locale,
  setLocale,
  setTheme,
  setThemeColor,
  theme,
  themeColor,
} from '~/stores/settings';

/** 主题色对应的展示色（与 app.css 中 [data-theme] 的 --primary 大致一致）。 */
const SWATCH: Record<ThemeColor, string> = {
  default: 'oklch(0.45 0 0)',
  blue: 'oklch(0.546 0.245 262.88)',
  violet: 'oklch(0.541 0.281 293.01)',
  green: 'oklch(0.627 0.194 149.21)',
  rose: 'oklch(0.586 0.222 17.585)',
  orange: 'oklch(0.705 0.213 47.604)',
  amber: 'oklch(0.769 0.188 70.08)',
};

/** 分段控件中的单个按钮。min-w-0 防止内容把按钮组撑出边界。 */
function Seg(props: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: JSX.Element;
}) {
  return (
    <Button
      variant={props.active ? 'default' : 'ghost'}
      size="sm"
      class="h-8 min-w-0 flex-1 gap-1.5 px-2"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

function Group(props: { label: string; children: JSX.Element }) {
  return (
    <div>
      <div class="mb-1.5 text-xs font-medium text-muted-foreground">{props.label}</div>
      {props.children}
    </div>
  );
}

export function SettingsPanel() {
  return (
    <div class="flex w-full flex-col gap-4">
      <Group label={t('settings.theme')}>
        {/* 仅用图标，配 title 提示，避免「跟随系统」文字撑出按钮组 */}
        <div class="flex gap-1 rounded-md border p-1">
          <Seg active={theme() === 'light'} title={t('settings.light')} onClick={() => setTheme('light')}>
            <Icon icon="lucide:sun" />
          </Seg>
          <Seg active={theme() === 'dark'} title={t('settings.dark')} onClick={() => setTheme('dark')}>
            <Icon icon="lucide:moon" />
          </Seg>
          <Seg active={theme() === 'system'} title={t('settings.system')} onClick={() => setTheme('system')}>
            <Icon icon="lucide:monitor" />
          </Seg>
        </div>
      </Group>

      <Group label={t('settings.themeColor')}>
        <div class="flex flex-wrap gap-2">
          <For each={THEME_COLORS}>
            {(c) => (
              <button
                type="button"
                title={t(`color.${c}`)}
                aria-label={t(`color.${c}`)}
                onClick={() => setThemeColor(c)}
                class="size-7 rounded-full border-2 transition-transform hover:scale-110"
                classList={{
                  'border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background':
                    themeColor() === c,
                  'border-border': themeColor() !== c,
                }}
                style={{ background: SWATCH[c] }}
              />
            )}
          </For>
        </div>
      </Group>

      <Group label={t('settings.language')}>
        <div class="flex gap-1 rounded-md border p-1">
          <Seg active={locale() === 'zh'} onClick={() => setLocale('zh')}>
            <span class="text-xs">中文</span>
          </Seg>
          <Seg active={locale() === 'en'} onClick={() => setLocale('en')}>
            <span class="text-xs">English</span>
          </Seg>
        </div>
      </Group>
    </div>
  );
}

/** 头部用的设置按钮（弹出层 SettingsPanel）。 */
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '~/components/ui/dialog';

export function SettingsButton() {
  return (
    <Popover>
      <PopoverTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="size-9"
        aria-label={t('settings.title')}
      >
        <Icon icon="lucide:settings" />
      </PopoverTrigger>
      <PopoverContent class="w-72">
        <SettingsPanel />
      </PopoverContent>
    </Popover>
  );
}

/** 工作台用的设置按钮（模态框 SettingsPanel）。仅图标。extra 为外观设置之后的附加内容（如工作台开关）。 */
export function SettingsModalButton(props: { extra?: JSX.Element }) {
  // 记录打开前的触发元素，用于关闭后还原焦点
  let trigger: HTMLElement | null = null;
  return (
    <Dialog
      onOpenChange={(open) => {
        // 打开瞬间让触发按钮失焦：Kobalte 随后会给 #root 加 aria-hidden，
        // 若焦点仍停留在其内部，Chrome 会警告「Blocked aria-hidden…retained focus」。
        // 失焦后焦点交由对话框接管，关闭时再由 onCloseAutoFocus 还原回按钮。
        if (open) {
          trigger = document.activeElement as HTMLElement | null;
          trigger?.blur();
        }
      }}
    >
      <DialogTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label={t('settings.title')}
      >
        <Icon icon="lucide:settings" />
      </DialogTrigger>
      <DialogContent
        onCloseAutoFocus={(e) => {
          // 自行把焦点还原到触发按钮（失焦后 Kobalte 默认会还原到 body）
          e.preventDefault();
          trigger?.focus();
        }}
      >
        <DialogTitle class="mb-4">{t('settings.title')}</DialogTitle>
        {/* 工作台相关设置在前，外观设置在后；不加内层滚动容器，内容完整展示 */}
        <Show when={props.extra}>
          {props.extra}
          <Separator class="my-4" />
        </Show>
        <SettingsPanel />
      </DialogContent>
    </Dialog>
  );
}
