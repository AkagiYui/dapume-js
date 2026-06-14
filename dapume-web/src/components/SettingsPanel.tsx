/**
 * 设置面板：深浅色、主题色、语言。供指南页头部弹出层与工作台控制区共用。
 */
import { For, type JSX } from 'solid-js';
import { Button } from '~/components/ui/button';
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

/** 分段控件中的单个按钮。 */
function Seg(props: { active: boolean; onClick: () => void; children: JSX.Element }) {
  return (
    <Button
      variant={props.active ? 'default' : 'ghost'}
      size="sm"
      class="h-8 flex-1 gap-1.5"
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
    <div class="flex w-56 flex-col gap-4">
      <Group label={t('settings.theme')}>
        <div class="flex gap-1 rounded-md border p-1">
          <Seg active={theme() === 'light'} onClick={() => setTheme('light')}>
            <Icon icon="lucide:sun" />
            <span class="text-xs">{t('settings.light')}</span>
          </Seg>
          <Seg active={theme() === 'dark'} onClick={() => setTheme('dark')}>
            <Icon icon="lucide:moon" />
            <span class="text-xs">{t('settings.dark')}</span>
          </Seg>
          <Seg active={theme() === 'system'} onClick={() => setTheme('system')}>
            <Icon icon="lucide:monitor" />
            <span class="text-xs">{t('settings.system')}</span>
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

/** 头部用的设置按钮（弹出 SettingsPanel）。 */
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';

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
      <PopoverContent class="w-auto">
        <SettingsPanel />
      </PopoverContent>
    </Popover>
  );
}
