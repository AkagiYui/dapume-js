import type { Component, ComponentProps } from 'solid-js';
import { splitProps } from 'solid-js';

import { cn } from '../../lib/utils';

export const Card: Component<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <div
      class={cn('rounded-lg border bg-card text-card-foreground shadow-sm', local.class)}
      {...others}
    />
  );
};

export const CardHeader: Component<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return <div class={cn('flex flex-col space-y-1.5 p-6', local.class)} {...others} />;
};

export const CardTitle: Component<ComponentProps<'h3'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return (
    <h3 class={cn('text-lg font-semibold leading-none tracking-tight', local.class)} {...others} />
  );
};

export const CardDescription: Component<ComponentProps<'p'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return <p class={cn('text-sm text-muted-foreground', local.class)} {...others} />;
};

export const CardContent: Component<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return <div class={cn('p-6 pt-0', local.class)} {...others} />;
};

export const CardFooter: Component<ComponentProps<'div'>> = (props) => {
  const [local, others] = splitProps(props, ['class']);
  return <div class={cn('flex items-center p-6 pt-0', local.class)} {...others} />;
};
