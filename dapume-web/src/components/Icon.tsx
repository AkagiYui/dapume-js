/**
 * 图标封装。基于 @iconify-icon/solid，配合 vite-plugin-iconify-offline 离线化。
 * 注意：icon 名称需为静态字符串字面量（如 "lucide:play"），插件才能在构建时扫描到。
 */
import { Icon as IconifyIcon } from '@iconify-icon/solid';
import type { JSX } from 'solid-js';

export function Icon(props: { icon: string; class?: string }): JSX.Element {
  return <IconifyIcon icon={props.icon} class={props.class} />;
}
