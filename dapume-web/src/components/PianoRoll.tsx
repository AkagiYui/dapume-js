/**
 * 钢琴卷帘（Canvas 绘制）。
 *
 * 横轴为时间、纵轴为音高；左侧为固定的钢琴键，音符按音轨着色。
 * 支持播放指针、跟随播放自动滚动、当前发声音符高亮，以及滚轮平移/缩放。
 */
import { createEffect, onCleanup, onMount } from 'solid-js';
import type { DapumeNote } from 'dapume-js';
import { clamp } from '~/lib/utils';
import { isDark, themeColor } from '~/stores/settings';

export interface PianoRollProps {
  notes: DapumeNote[];
  durationMs: number;
  currentTimeMs: number;
  isPlaying: boolean;
  /** 是否跟随播放进度自动滚动。 */
  follow: boolean;
}

/** 左侧键盘宽度（CSS px）。 */
const KEYBOARD_W = 48;
/** 黑键的音级（半音）。 */
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);

/** 读取根元素上的 CSS 变量值。 */
function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** 音轨配色（不同色相）。 */
function trackColor(track: number, alpha = 1): string {
  const hue = (track * 53 + 205) % 360;
  return `oklch(0.62 0.17 ${hue} / ${alpha})`;
}

export function PianoRoll(props: PianoRollProps) {
  let containerEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let pxPerMs = 0.12; // 缩放：像素/毫秒
  let userScrollX = 0; // 非跟随模式下的滚动位置（毫秒）
  let cssW = 0;
  let cssH = 0;

  /** 计算可见音高范围。 */
  function pitchRange(): { lo: number; hi: number } {
    if (props.notes.length === 0) return { lo: 48, hi: 84 };
    let lo = 127;
    let hi = 0;
    for (const n of props.notes) {
      if (n.pitch < lo) lo = n.pitch;
      if (n.pitch > hi) hi = n.pitch;
    }
    return { lo: Math.max(0, lo - 2), hi: Math.min(127, hi + 2) };
  }

  function draw() {
    const ctx = canvasEl.getContext('2d');
    if (!ctx || cssW === 0 || cssH === 0) return;

    const bg = cssVar('--card') || '#fff';
    const border = cssVar('--border') || '#ddd';
    const mutedFg = cssVar('--muted-foreground') || '#999';
    const primary = cssVar('--primary') || '#3b82f6';
    const fg = cssVar('--foreground') || '#111';

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const { lo, hi } = pitchRange();
    const rows = hi - lo + 1;
    const rowH = cssH / rows;
    const noteAreaW = cssW - KEYBOARD_W;
    const visibleMs = noteAreaW / pxPerMs;
    const maxScroll = Math.max(0, props.durationMs - visibleMs);

    // 计算滚动位置。仅在「跟随 且 正在播放」时自动跟随；其余情况允许手动平移。
    // 这样开启跟随但处于停止/暂停态时，仍可拖动查看谱面；播放时恢复自动跟随。
    const autoFollow = props.follow && props.isPlaying;
    let scrollX: number;
    if (autoFollow) {
      const anchor = visibleMs * 0.4;
      scrollX = clamp(props.currentTimeMs - anchor, 0, maxScroll);
      userScrollX = scrollX; // 同步，便于暂停后从当前位置继续手动平移
    } else {
      scrollX = clamp(userScrollX, 0, maxScroll);
      userScrollX = scrollX;
    }

    const yOf = (pitch: number) => (hi - pitch) * rowH;
    const xOf = (t: number) => KEYBOARD_W + (t - scrollX) * pxPerMs;

    // 背景行（黑键行加深）
    for (let p = lo; p <= hi; p++) {
      if (BLACK_KEYS.has(((p % 12) + 12) % 12)) {
        ctx.fillStyle = `color-mix(in oklch, ${mutedFg} 12%, transparent)`;
        ctx.fillRect(KEYBOARD_W, yOf(p), noteAreaW, rowH);
      }
    }

    // 时间网格（每秒一条）
    ctx.strokeStyle = `color-mix(in oklch, ${border} 70%, transparent)`;
    ctx.lineWidth = 1;
    const startSec = Math.floor(scrollX / 1000);
    const endSec = Math.ceil((scrollX + visibleMs) / 1000);
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillStyle = mutedFg;
    for (let s = startSec; s <= endSec; s++) {
      const x = xOf(s * 1000);
      if (x < KEYBOARD_W) continue;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, cssH);
      ctx.stroke();
      ctx.fillText(`${s}s`, x + 3, 11);
    }

    // 音符
    for (const n of props.notes) {
      const x = xOf(n.startTime);
      const w = Math.max(1.5, n.duration * pxPerMs);
      if (x + w < KEYBOARD_W || x > cssW) continue;
      const y = yOf(n.pitch);
      const active = n.startTime <= props.currentTimeMs && props.currentTimeMs < n.startTime + n.duration;
      // 裁剪到音符区域
      const drawX = Math.max(x, KEYBOARD_W);
      const drawW = x + w - drawX;
      if (drawW <= 0) continue;
      ctx.fillStyle = trackColor(n.trackNo, active ? 1 : 0.82);
      ctx.fillRect(drawX, y + 0.5, drawW, Math.max(1.5, rowH - 1.5));
      if (active) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(drawX + 0.5, y + 1, drawW - 1, Math.max(1, rowH - 2.5));
      }
    }

    // 左侧键盘
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, KEYBOARD_W, cssH);
    for (let p = lo; p <= hi; p++) {
      const y = yOf(p);
      const isBlack = BLACK_KEYS.has(((p % 12) + 12) % 12);
      ctx.fillStyle = isBlack ? `color-mix(in oklch, ${fg} 82%, ${bg})` : bg;
      ctx.fillRect(0, y, KEYBOARD_W - 6, rowH);
      ctx.strokeStyle = `color-mix(in oklch, ${border} 60%, transparent)`;
      ctx.strokeRect(0.5, y + 0.5, KEYBOARD_W - 6, rowH);
      // 每个 C 标注音名
      if (((p % 12) + 12) % 12 === 0) {
        ctx.fillStyle = mutedFg;
        ctx.font = '9px ui-sans-serif, system-ui';
        ctx.fillText(`C${Math.floor(p / 12) - 1}`, 2, y + rowH - 2);
      }
    }
    // 键盘右边界
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(KEYBOARD_W + 0.5, 0);
    ctx.lineTo(KEYBOARD_W + 0.5, cssH);
    ctx.stroke();

    // 播放指针
    const px = xOf(props.currentTimeMs);
    if (px >= KEYBOARD_W && px <= cssW) {
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, 0);
      ctx.lineTo(px, cssH);
      ctx.stroke();
    }
  }

  /** 根据容器尺寸调整画布（考虑高清屏）。 */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = containerEl.getBoundingClientRect();
    cssW = rect.width;
    cssH = rect.height;
    canvasEl.width = Math.round(cssW * dpr);
    canvasEl.height = Math.round(cssH * dpr);
    canvasEl.style.width = `${cssW}px`;
    canvasEl.style.height = `${cssH}px`;
    const ctx = canvasEl.getContext('2d');
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    draw();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // 缩放
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      pxPerMs = clamp(pxPerMs * factor, 0.01, 2);
    } else if (!(props.follow && props.isPlaying)) {
      // 平移（仅在「跟随且正在播放」时禁用，其余情况允许）
      const delta = (e.deltaY + e.deltaX) / pxPerMs;
      userScrollX = Math.max(0, userScrollX + delta);
    }
    draw();
  }

  onMount(() => {
    const ro = new ResizeObserver(() => resize());
    ro.observe(containerEl);
    resize();
    onCleanup(() => ro.disconnect());
  });

  // 响应式重绘：时间、音符、跟随状态、深浅色/主题色变化均触发
  createEffect(() => {
    // 读取依赖
    void props.currentTimeMs;
    void props.notes;
    void props.follow;
    void props.isPlaying; // 播放/暂停切换时重绘，切换自动跟随/手动平移
    void props.durationMs;
    void isDark(); // 深浅色切换后重绘，使画布配色同步更新
    void themeColor(); // 主题色切换后重绘（播放指针颜色）
    draw();
  });

  return (
    <div ref={containerEl} class="relative h-full w-full overflow-hidden">
      <canvas ref={canvasEl} class="block" onWheel={onWheel} />
    </div>
  );
}
