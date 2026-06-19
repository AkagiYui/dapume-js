import type { Component, ComponentProps, JSX, ValidComponent } from 'solid-js';
import { splitProps } from 'solid-js';

import type { PolymorphicProps } from '@kobalte/core/polymorphic';
import * as DialogPrimitive from '@kobalte/core/dialog';

import { Icon } from '../Icon';
import { cn } from '../../lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

type DialogContentProps<T extends ValidComponent = 'div'> = DialogPrimitive.DialogContentProps<T> & {
  class?: string | undefined;
  children?: JSX.Element;
};

export const DialogContent = <T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, DialogContentProps<T>>,
) => {
  const [local, others] = splitProps(props as DialogContentProps, ['class', 'children']);
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/50 duration-200 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[closed]:animate-out data-[closed]:fade-out-0" />
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <DialogPrimitive.Content
          class={cn(
            'relative w-full max-w-md rounded-lg border bg-background p-6 shadow-lg duration-200 data-[expanded]:animate-in data-[expanded]:fade-in-0 data-[expanded]:zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95',
            local.class,
          )}
          {...others}
        >
          {local.children}
          <DialogPrimitive.CloseButton class="absolute right-4 top-4 rounded-md p-1 text-muted-foreground opacity-70 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon icon="lucide:x" />
          </DialogPrimitive.CloseButton>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
};

export const DialogTitle: Component<ComponentProps<'h2'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return <h2 class={cn('text-lg font-semibold', local.class)} {...others} />;
};

export const DialogDescription: Component<ComponentProps<'p'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return <p class={cn('text-sm text-muted-foreground', local.class)} {...others} />;
};
