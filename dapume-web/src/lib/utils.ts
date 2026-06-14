import type { ClassValue } from 'clsx';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 className：clsx 处理条件类，tailwind-merge 处理冲突类。 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** 数值夹取到 [min, max]。 */
export function clamp(val: number, min: number, max: number): number {
  return val > max ? max : val < min ? min : val;
}
