/**
 * 轻量「有新版本」提示（非模态）：固定在底部中央的胶囊条，提供「刷新」与「忽略」。
 * 检测方式由调用方提供（dapume-web 用 PWA 的 onNeedRefresh；社区站用版本轮询 watchForUpdate）。
 */
import { Show } from 'solid-js';
import { Icon } from './Icon';
import { t } from '../i18n';

export function UpdateToast(props: { show: boolean; onRefresh: () => void; onDismiss: () => void }) {
  return (
    <Show when={props.show}>
      <div
        role="status"
        class="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2.5 rounded-full border bg-background/95 py-2 pl-4 pr-2 text-sm shadow-lg backdrop-blur"
        style={{ 'margin-bottom': 'env(safe-area-inset-bottom)' }}
      >
        <Icon icon="lucide:rocket" class="text-primary" />
        <span>{t('update.available')}</span>
        <button
          type="button"
          onClick={props.onRefresh}
          class="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t('update.refresh')}
        </button>
        <button
          type="button"
          onClick={props.onDismiss}
          aria-label={t('update.dismiss')}
          title={t('update.dismiss')}
          class="rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Icon icon="lucide:x" />
        </button>
      </div>
    </Show>
  );
}
