/**
 * 底部抽屉（窄屏用）。一个从底部滑出的面板 + 背景遮罩，由 open/onClose 控制。
 */
import { Show, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icon } from '~/components/Icon';
import { cn } from '~/lib/utils';

export function BottomDrawer(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 标题栏右侧（关闭按钮左边）的附加内容，如开关。 */
  headerRight?: JSX.Element;
  children: JSX.Element;
  class?: string;
}) {
  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-40 bg-black/50 animate-in fade-in-0"
          onClick={props.onClose}
          aria-hidden="true"
        />
        <div
          class={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-background shadow-xl animate-in slide-in-from-bottom duration-300',
            props.class,
          )}
          role="dialog"
          aria-modal="true"
        >
          <div class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
          <div class="flex items-center justify-between gap-2 px-4 py-2">
            <span class="shrink-0 text-sm font-medium">{props.title}</span>
            <div class="flex min-w-0 items-center gap-2">
              {props.headerRight}
              <button
                type="button"
                onClick={props.onClose}
                class="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
                aria-label="close"
              >
                <Icon icon="lucide:x" />
              </button>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        </div>
      </Portal>
    </Show>
  );
}
