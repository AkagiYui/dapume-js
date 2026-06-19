/**
 * 底部抽屉（窄屏用）。从底部滑出的面板 + 背景遮罩，由 open/onClose 控制。
 *
 * - 进出场用 CSS transition（而非 keyframe 动画）驱动 translateY / opacity，
 *   关闭后遮罩不会闪回（避免 keyframe fill-mode 造成的闪烁）。
 * - 仅「把手」可按住拖动：向下拖过阈值即关闭，未过阈值回弹；抽屉内容区照常滚动。
 * - 关闭时保留挂载以播放收起过渡，过渡结束（transform settle）后再卸载。
 */
import { Show, createEffect, createSignal, onCleanup, type JSX } from 'solid-js';
import { Portal } from 'solid-js/web';
import { Icon } from '../Icon';
import { cn } from '../../lib/utils';

export function BottomDrawer(props: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** 标题栏右侧（关闭按钮左边）的附加内容，如开关。 */
  headerRight?: JSX.Element;
  /** 隐藏关闭按钮（点击遮罩或下拉把手即可关闭，无需 X）。 */
  hideClose?: boolean;
  children: JSX.Element;
  class?: string;
}) {
  const [show, setShow] = createSignal(props.open); // 是否挂载
  const [active, setActive] = createSignal(false); // 是否升起（面板在位 + 遮罩可见）
  const [dragY, setDragY] = createSignal(0); // 把手下拉位移（px）
  const [dragging, setDragging] = createSignal(false);
  let panelRef: HTMLDivElement | undefined;
  let startY = 0;
  let raf1 = 0;
  let raf2 = 0;

  createEffect(() => {
    if (props.open) {
      setShow(true);
      setDragY(0);
      // 两帧后再升起：确保初始 translateY(100%) 已提交，过渡才会触发
      raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setActive(true));
      });
    } else {
      setActive(false); // 触发下滑过渡；transform 结束后卸载
    }
  });
  onCleanup(() => {
    cancelAnimationFrame(raf1);
    cancelAnimationFrame(raf2);
  });

  // 收起过渡（transform）结束且已处于关闭态 → 卸载
  const onPanelTransitionEnd = (e: TransitionEvent) => {
    if (e.propertyName === 'transform' && !active()) {
      setShow(false);
      setDragging(false);
      setDragY(0);
    }
  };

  // ===== 把手拖动 =====
  const onHandleDown = (e: PointerEvent) => {
    if (e.button > 0) return; // 仅主键 / 触摸
    setDragging(true);
    startY = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onHandleMove = (e: PointerEvent) => {
    if (dragging()) setDragY(Math.max(0, e.clientY - startY));
  };
  const onHandleUp = () => {
    if (!dragging()) return;
    setDragging(false); // 重新启用过渡；transform 仍停在当前 dragY（见 panelTransform）
    const h = panelRef?.offsetHeight ?? 400;
    const shouldClose = dragY() > Math.min(120, h * 0.3);
    // 下一帧再改 transform，确保「过渡已启用」先提交，避免瞬移
    requestAnimationFrame(() => {
      if (shouldClose) {
        setActive(false);
        props.onClose();
      } else {
        setDragY(0); // 回弹
      }
    });
  };

  const panelTransform = () => {
    if (!active()) return 'translateY(100%)'; // 关闭 / 关闭中：落到底部
    if (dragY() > 0) return `translateY(${dragY()}px)`; // 拖动中或回弹起点
    return 'translateY(0)';
  };
  const panelTransition = () =>
    dragging() ? 'none' : 'transform 300ms cubic-bezier(0.32, 0.72, 0, 1)';

  return (
    <Show when={show()}>
      <Portal>
        <div
          class="fixed inset-0 z-40 bg-black/50"
          style={{ opacity: active() ? '1' : '0', transition: 'opacity 300ms ease' }}
          onClick={props.onClose}
          aria-hidden="true"
        />
        <div
          ref={panelRef}
          class={cn(
            'fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col rounded-t-2xl border-t bg-background shadow-xl',
            props.class,
          )}
          style={{
            transform: panelTransform(),
            transition: panelTransition(),
            'will-change': 'transform',
          }}
          role="dialog"
          aria-modal="true"
          onTransitionEnd={onPanelTransitionEnd}
        >
          {/* 把手：唯一可按住拖动的区域（touch-none 防止拖动时页面滚动） */}
          <div
            class="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
            onPointerCancel={onHandleUp}
          >
            <div class="h-1 w-10 rounded-full bg-border" />
          </div>
          <div class="flex items-center justify-between gap-2 px-4 pb-2">
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
