/**
 * 底部抽屉（窄屏用）。从底部滑出的面板 + 背景遮罩，由 open/onClose 控制。
 * 关闭时保留挂载以播放退出动画，动画结束后再卸载。
 */
import { Show, createEffect, createSignal, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icon } from '~/components/Icon';
import { cn } from '~/lib/utils';

export function BottomDrawer(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 标题栏右侧（关闭按钮左边）的附加内容，如开关。 */
  headerRight?: JSX.Element;
  /** 隐藏关闭按钮（点击遮罩即可关闭，无需 X）。 */
  hideClose?: boolean;
  children: JSX.Element;
  class?: string;
}) {
  const [show, setShow] = createSignal(props.open);
  const [closing, setClosing] = createSignal(false);
  createEffect(() => {
    if (props.open) {
      setClosing(false);
      setShow(true);
    } else if (show()) {
      setClosing(true); // 触发退出动画；动画结束后卸载
    }
  });
  const onPanelAnimEnd = () => {
    if (closing()) {
      setShow(false);
      setClosing(false);
    }
  };

  return (
    <Show when={show()}>
      <Portal>
        <div
          class={cn(
            'fixed inset-0 z-40 bg-black/50',
            closing() ? 'animate-out fade-out-0' : 'animate-in fade-in-0',
          )}
          onClick={props.onClose}
          aria-hidden="true"
        />
        <div
          class={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-background shadow-xl duration-300',
            closing() ? 'animate-out slide-out-to-bottom' : 'animate-in slide-in-from-bottom',
            props.class,
          )}
          role="dialog"
          aria-modal="true"
          onAnimationEnd={onPanelAnimEnd}
        >
          <div class="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border" />
          <div class="flex items-center justify-between gap-2 px-4 py-2">
            <span class="shrink-0 text-sm font-medium">{props.title}</span>
            <div class="flex min-w-0 items-center gap-2">
              {props.headerRight}
              <Show when={!props.hideClose}>
                <button
                  type="button"
                  onClick={props.onClose}
                  class="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground"
                  aria-label="close"
                >
                  <Icon icon="lucide:x" />
                </button>
              </Show>
            </div>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto">{props.children}</div>
        </div>
      </Portal>
    </Show>
  );
}
