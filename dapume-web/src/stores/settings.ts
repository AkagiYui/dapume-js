/**
 * 全局设置：深浅色、主题色、语言。
 * 均以信号实现，并持久化到 localStorage；深浅色默认跟随系统。
 */
import { createEffect, createRoot, createSignal, onCleanup } from 'solid-js';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type Locale = 'zh' | 'en';

/** 主题色预选项（与 app.css 中的 [data-theme] 规则对应）。 */
export const THEME_COLORS = ['default', 'blue', 'violet', 'green', 'rose', 'orange', 'amber'] as const;
export type ThemeColor = (typeof THEME_COLORS)[number];

const KEY_THEME = 'dapume.theme';
const KEY_COLOR = 'dapume.themeColor';
const KEY_LOCALE = 'dapume.locale';

/** 安全读取 localStorage。 */
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 安全写入 localStorage。 */
function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略（隐私模式等） */
  }
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

// ===== 深浅色 =====
function initTheme(): ThemeChoice {
  const v = read(KEY_THEME);
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
}

const [theme, setTheme] = createSignal<ThemeChoice>(initTheme());

/** 计算并应用 .dark 类。 */
function applyTheme(choice: ThemeChoice): void {
  const dark = choice === 'dark' || (choice === 'system' && media.matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** 当前是否处于深色（用于需要判断的场景，如画布配色）。 */
export function isDark(): boolean {
  const c = theme();
  return c === 'dark' || (c === 'system' && media.matches);
}

// ===== 主题色 =====
function initColor(): ThemeColor {
  const v = read(KEY_COLOR) as ThemeColor | null;
  return v && (THEME_COLORS as readonly string[]).includes(v) ? v : 'default';
}

const [themeColor, setThemeColor] = createSignal<ThemeColor>(initColor());

// ===== 语言 =====
function initLocale(): Locale {
  const v = read(KEY_LOCALE);
  if (v === 'zh' || v === 'en') return v;
  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

const [locale, setLocale] = createSignal<Locale>(initLocale());

// ===== 副作用统一在一个长期存活的 root 中注册，避免「在 root 外创建计算」的告警 =====
createRoot(() => {
  // 深浅色：持久化并应用
  createEffect(() => {
    const c = theme();
    write(KEY_THEME, c);
    applyTheme(c);
  });
  // 跟随系统时监听系统变化
  createEffect(() => {
    if (theme() !== 'system') return;
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    onCleanup(() => media.removeEventListener('change', onChange));
  });
  // 主题色：持久化并设置 data-theme
  createEffect(() => {
    const c = themeColor();
    write(KEY_COLOR, c);
    if (c === 'default') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', c);
  });
  // 语言：持久化
  createEffect(() => write(KEY_LOCALE, locale()));
});

export { theme, setTheme, themeColor, setThemeColor, locale, setLocale };
