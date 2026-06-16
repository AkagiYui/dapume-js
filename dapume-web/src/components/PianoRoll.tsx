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
  /**
   * 「琴键方向」开关原始状态。OFF（false，默认）：横向 下→上 低→高、纵向 左→右 低→高；
   * ON（true）：横向 下→上 高→低、纵向 左→右 高→低。
   */
  pitchAscending?: boolean;
  /** 卷帘朝向：'horizontal'（默认，时间横向）| 'vertical'（时间纵向）。 */
  orientation?: 'horizontal' | 'vertical';
  /**
   * 「琴键位置」开关原始状态。OFF（false，默认）：横向键盘在左、纵向键盘在底；
   * ON（true）：横向键盘在右、纵向键盘在顶。
   */
  keyboardFlip?: boolean;
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

/** 缩放（像素/毫秒）持久化。 */
const ZOOM_KEY = 'dapume.pianoZoom';
const DEFAULT_ZOOM = 0.12;
function readZoom(): number {
  try {
    const v = parseFloat(localStorage.getItem(ZOOM_KEY) || '');
    return Number.isFinite(v) && v >= 0.01 && v <= 2 ? v : DEFAULT_ZOOM;
  } catch {
    return DEFAULT_ZOOM;
  }
}
function writeZoom(v: number): void {
  try {
    localStorage.setItem(ZOOM_KEY, String(v));
  } catch {
    /* 忽略 */
  }
}

export function PianoRoll(props: PianoRollProps) {
  let containerEl!: HTMLDivElement;
  let canvasEl!: HTMLCanvasElement;
  let pxPerMs = readZoom(); // 缩放：像素/毫秒（持久化）
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
    const primaryFg = cssVar('--primary-foreground') || '#fff';
    const fg = cssVar('--foreground') || '#111';

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const vertical = props.orientation === 'vertical';
    // 高音是否在音高轴起点（横向=顶部、纵向=左侧）：纵向时与开关同向、横向时相反
    const highAtCoord0 = vertical ? !!props.pitchAscending : !props.pitchAscending;
    // 键盘是否在时间轴起点（横向=左、纵向=顶）：纵向时与开关同向、横向时相反
    const kbAtStart = vertical ? !!props.keyboardFlip : !props.keyboardFlip;

    const { lo, hi } = pitchRange();
    const rows = hi - lo + 1;
    const timeAxisLen = vertical ? cssH : cssW; // 时间轴总长（含键盘）
    const pitchAxisLen = vertical ? cssW : cssH; // 音高轴总长
    const cell = pitchAxisLen / rows; // 每个半音的宽/高
    const noteAreaTime = timeAxisLen - KEYBOARD_W; // 时间轴上音符区长度

    const naLo = kbAtStart ? KEYBOARD_W : 0; // 音符区时间坐标下界
    const naHi = naLo + noteAreaTime; // 上界
    const keyBodyStart = kbAtStart ? 0 : naHi + 6; // 键本体起点（与音符区间隔 6px）
    const keyBodyLen = KEYBOARD_W - 6;
    const kbBorder = kbAtStart ? KEYBOARD_W : naHi; // 键盘与音符区的分隔线

    const visibleMs = noteAreaTime / pxPerMs;
    const maxScroll = Math.max(0, props.durationMs - visibleMs);

    // 计算滚动位置。仅在「跟随 且 正在播放」时自动跟随；其余情况允许手动平移。
    const autoFollow = props.follow && props.isPlaying;
    let scrollX: number;
    if (autoFollow) {
      const anchor = visibleMs * 0.4;
      scrollX = clamp(props.currentTimeMs - anchor, 0, maxScroll);
      userScrollX = scrollX;
    } else {
      scrollX = clamp(userScrollX, 0, maxScroll);
      userScrollX = scrollX;
    }

    // 逻辑坐标：tPos 沿时间轴、pPos 沿音高轴。
    // 让「瀑布」始终朝着琴键所在的位置流动：键盘在起点时时间正向、在末端时时间反向，
    // 使演奏指针贴近键盘、未来音符在远端、随播放向键盘汇聚。
    const tPos = (t: number) =>
      kbAtStart ? naLo + (t - scrollX) * pxPerMs : naHi - (t - scrollX) * pxPerMs;
    const pPos = (p: number) => (highAtCoord0 ? hi - p : p - lo) * cell;
    // 逻辑矩形（沿时间 [t0,tLen]、沿音高 [p0,pLen]）→ 屏幕矩形
    const fillRect = (t0: number, tLen: number, p0: number, pLen: number) => {
      if (vertical) ctx.fillRect(p0, t0, pLen, tLen);
      else ctx.fillRect(t0, p0, tLen, pLen);
    };
    const strokeRect = (t0: number, tLen: number, p0: number, pLen: number) => {
      if (vertical) ctx.strokeRect(p0, t0, pLen, tLen);
      else ctx.strokeRect(t0, p0, tLen, pLen);
    };
    // 在时间轴坐标 tc 处画一条贯穿音高轴的线
    const lineAcrossPitch = (tc: number) => {
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(0, tc + 0.5);
        ctx.lineTo(cssW, tc + 0.5);
      } else {
        ctx.moveTo(tc + 0.5, 0);
        ctx.lineTo(tc + 0.5, cssH);
      }
      ctx.stroke();
    };

    // 背景行（黑键行加深）
    for (let p = lo; p <= hi; p++) {
      if (BLACK_KEYS.has(((p % 12) + 12) % 12)) {
        ctx.fillStyle = `color-mix(in oklch, ${mutedFg} 12%, transparent)`;
        fillRect(naLo, noteAreaTime, pPos(p), cell);
      }
    }

    // 时间网格（每秒一条）
    ctx.strokeStyle = `color-mix(in oklch, ${border} 70%, transparent)`;
    ctx.lineWidth = 1;
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillStyle = mutedFg;
    const startSec = Math.floor(scrollX / 1000);
    const endSec = Math.ceil((scrollX + visibleMs) / 1000);
    for (let s = startSec; s <= endSec; s++) {
      const tc = tPos(s * 1000);
      if (tc < naLo || tc > naHi) continue;
      lineAcrossPitch(tc);
      if (vertical) ctx.fillText(`${s}s`, 2, tc + 11);
      else ctx.fillText(`${s}s`, tc + 3, 11);
    }

    // 音符（裁剪到音符区 [naLo, naHi]；时间方向可能反向，故取两端的 min/max）
    for (const n of props.notes) {
      const a = tPos(n.startTime);
      const b = tPos(n.startTime + n.duration);
      let lo_ = Math.min(a, b);
      let hi_ = Math.max(a, b);
      if (hi_ - lo_ < 1.5) hi_ = lo_ + 1.5; // 最小可见长度
      if (hi_ < naLo || lo_ > naHi) continue;
      const drawT = Math.max(lo_, naLo);
      const drawTLen = Math.min(hi_, naHi) - drawT;
      if (drawTLen <= 0) continue;
      const p0 = pPos(n.pitch);
      const active =
        n.startTime <= props.currentTimeMs && props.currentTimeMs < n.startTime + n.duration;
      ctx.fillStyle = trackColor(n.trackNo, active ? 1 : 0.82);
      fillRect(drawT, drawTLen, p0 + 0.5, Math.max(1.5, cell - 1.5));
      if (active) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        strokeRect(drawT + 0.5, drawTLen - 1, p0 + 1, Math.max(1, cell - 2.5));
      }
    }

    // 当前发声的音高（用于「按下」反色）
    const activePitches = new Set<number>();
    for (const n of props.notes) {
      if (n.startTime <= props.currentTimeMs && props.currentTimeMs < n.startTime + n.duration) {
        activePitches.add(Math.max(0, Math.min(127, n.pitch)));
      }
    }

    // 键盘：先以 bg 覆盖键盘区（时间轴上 KEYBOARD_W 宽、全音高轴）
    ctx.fillStyle = bg;
    fillRect(kbAtStart ? 0 : naHi, KEYBOARD_W, 0, pitchAxisLen);
    // 像真实钢琴：黑键长度（沿时间）为白键一半、贴远离音符区的一侧，且音高方向更窄
    // （故音符连接处各键同宽，远端白键比黑键宽）。
    const blackKeyLen = keyBodyLen / 2;
    const blackKeyStart = kbAtStart ? keyBodyStart : keyBodyStart + keyBodyLen - blackKeyLen;
    const blackInset = cell * 0.16; // 黑键音高方向两侧各内缩，使其更窄
    const darkKey = `color-mix(in oklch, ${fg} 82%, ${bg})`;
    const lightBorder = `color-mix(in oklch, ${border} 60%, transparent)`;
    for (let p = lo; p <= hi; p++) {
      const p0 = pPos(p);
      const isBlack = BLACK_KEYS.has(((p % 12) + 12) % 12);
      const pressed = activePitches.has(p);
      // 白键整格 + 边界（按下则用主色反白）
      if (!isBlack && pressed) {
        ctx.fillStyle = primary;
        fillRect(keyBodyStart, keyBodyLen, p0, cell);
      }
      ctx.strokeStyle = lightBorder;
      strokeRect(keyBodyStart + 0.5, keyBodyLen, p0 + 0.5, cell);
      // 黑键：半长 + 更窄，贴外侧（按下则用主色）
      if (isBlack) {
        ctx.fillStyle = pressed ? primary : darkKey;
        fillRect(blackKeyStart, blackKeyLen, p0 + blackInset, cell - 2 * blackInset);
      }
      // 每个 C 标注音名（C 是白键，整条都可写）
      if (((p % 12) + 12) % 12 === 0) {
        ctx.fillStyle = pressed ? primaryFg : mutedFg;
        ctx.font = '9px ui-sans-serif, system-ui';
        const label = `C${Math.floor(p / 12) - 1}`;
        if (vertical) ctx.fillText(label, p0 + 1, keyBodyStart + keyBodyLen - 2);
        else ctx.fillText(label, keyBodyStart + 2, p0 + cell - 2);
      }
    }
    // 键盘与音符区的分隔线
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    lineAcrossPitch(kbBorder);

    // 播放指针
    const tc = tPos(props.currentTimeMs);
    if (tc >= naLo && tc <= naHi) {
      ctx.strokeStyle = primary;
      ctx.lineWidth = 2;
      lineAcrossPitch(tc);
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
      // 缩放（持久化）
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      pxPerMs = clamp(pxPerMs * factor, 0.01, 2);
      writeZoom(pxPerMs);
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
    void props.orientation; // 卷帘朝向切换后重绘
    void props.pitchAscending; // 音高方向切换后重绘
    void props.keyboardFlip; // 键盘位置切换后重绘
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
