/**
 * PWA 运行时辅助（全部对 window 做 SSR 守卫，预渲染时安全降级）：
 * - isStandalone()：是否以已安装的独立窗口运行（用于把导航栏改到底部等）。
 *   可用 `?standalone=1` 查询参数强制开启，便于在普通浏览器中测试该形态。
 * - canInstall()/promptInstall()：捕获 beforeinstallprompt，供「安装应用」按钮调用。
 * - rememberPath()/takeStartPath()：记住最近路径，PWA 启动时恢复到上次页面。
 */
import { createSignal } from 'solid-js';

const hasWin = typeof window !== 'undefined';

function detectStandalone(): boolean {
  if (!hasWin) return false;
  try {
    if (new URLSearchParams(window.location.search).get('standalone') === '1') return true;
  } catch {
    /* ignore */
  }
  return (
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    // iOS Safari「添加到主屏幕」
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const [standalone, setStandalone] = createSignal(detectStandalone());
/** 是否以已安装的独立窗口（PWA）运行。 */
export const isStandalone = standalone;

function syncStandalone(): void {
  const s = detectStandalone();
  setStandalone(s);
  if (hasWin) document.documentElement.classList.toggle('standalone', s);
}

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
let deferredPrompt: InstallPromptEvent | null = null;
const [installable, setInstallable] = createSignal(false);
/** 浏览器是否提供了安装入口（beforeinstallprompt 已触发且尚未安装）。 */
export const canInstall = installable;

/** 触发浏览器的安装提示（若可用）。 */
export async function promptInstall(): Promise<void> {
  const e = deferredPrompt;
  if (!e) return;
  deferredPrompt = null;
  setInstallable(false);
  try {
    await e.prompt();
    await e.userChoice;
  } catch {
    /* 用户取消等，忽略 */
  }
}

const LAST_PATH_KEY = 'dapume.lastPath';
/** 记住最近访问的路径（含 query），供 PWA 下次启动恢复。 */
export function rememberPath(path: string): void {
  if (!hasWin) return;
  try {
    localStorage.setItem(LAST_PATH_KEY, path);
  } catch {
    /* ignore */
  }
}
/** 读取上次记住的路径。 */
export function takeStartPath(): string | null {
  if (!hasWin) return null;
  try {
    return localStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

if (hasWin) {
  syncStandalone();
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', syncStandalone);
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // 阻止默认迷你信息栏，改由「安装应用」按钮触发
    deferredPrompt = e as InstallPromptEvent;
    setInstallable(true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    setInstallable(false);
    syncStandalone();
  });
}
