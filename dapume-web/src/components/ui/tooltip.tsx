import type { Component, JSX, ValidComponent } from 'solid-js';
import { createSignal, onCleanup, splitProps } from 'solid-js';

import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as TooltipPrimitive from '@kobalte/core/tooltip';

import { cn } from '~/lib/utils';

export const TooltipTrigger = TooltipPrimitive.Trigger;

export const Tooltip: Component<TooltipPrimitive.TooltipRootProps> = (props) => {
  return <TooltipPrimitive.Root gutter={4} {...props} />;
};

type TooltipContentProps<T extends ValidComponent = 'div'> = TooltipPrimitive.TooltipContentProps<T> & {
  class?: string | undefined;
};

export const TooltipContent = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, TooltipContentProps<T>>,
) => {
  const [local, others] = splitProps(props as TooltipContentProps, ['class']);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        class={cn(
          'z-[70] max-w-[15rem] origin-[var(--kb-popover-content-transform-origin)] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0',
          local.class,
        )}
        {...others}
      />
    </TooltipPrimitive.Portal>
  );
};

/**
 * 便捷信息提示：用组件库 tooltip 取代原生 title。
 * 桌面端 hover/focus 弹出；移动端点击 Trigger 也能弹出（受控 + onClick 打开）。
 */
export function InfoTip(props: {
  label: JSX.Element;
  children: JSX.Element;
  class?: string;
  placement?: TooltipPrimitive.TooltipRootProps['placement'];
}) {
  const [open, setOpen] = createSignal(false);
  // 移动端点击：Kobalte 会在 pointerdown 时关闭 tooltip，故用「锁定」短暂保持打开并忽略其关闭。
  let latched = false;
  let timer: number | undefined;
  const handleOpenChange = (o: boolean) => {
    if (!o && latched) return;
    setOpen(o);
  };
  const tapOpen = () => {
    latched = true;
    setOpen(true);
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      latched = false;
      setOpen(false);
    }, 1800);
  };
  onCleanup(() => clearTimeout(timer));
  return (
    <Tooltip
      open={open()}
      onOpenChange={handleOpenChange}
      openDelay={120}
      closeDelay={120}
      placement={props.placement ?? 'top'}
    >
      <TooltipTrigger
        as="span"
        class={cn('inline-flex cursor-help items-center outline-none', props.class)}
        onPointerDown={tapOpen}
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>{props.label}</TooltipContent>
    </Tooltip>
  );
}
