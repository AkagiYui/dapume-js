/**
 * 钢琴卷帘（Canvas 绘制）。
 *
 * 横轴为时间、纵轴为音高；左侧为固定的钢琴键，音符按音轨着色。
 * 支持播放指针、跟随播放自动滚动、当前发声音符高亮，以及滚轮平移/缩放。
 */
import { createEffect, onCleanup, onMount } from 'solid-js';
import type { DapumeNote, DapumeSection } from 'dapume-js';
import { clamp } from '~/lib/utils';
import { BEATS_PER_MEASURE, beatAtTime, measureAtTime, timeAtBeat } from '~/lib/measures';
import { isDark, themeColor } from '~/stores/settings';

export interface PianoRollProps {
  notes: DapumeNote[];
  sections: DapumeSection[];
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
  /**
   * 判定线（播放指针）位置 / 琴键显隐。false（默认）：显示琴键，音符流向琴键交接处「落键」；
   * true：隐藏琴键、铺满音符瀑布，判定线悬在音符区约 40% 处，已演奏的音符继续流过仍可见。
   */
  floatingJudge?: boolean;
  /** 点击卷帘时间轴时跳转到对应毫秒位置。 */
  onSeek?: (timeMs: number) => void;
}

/** 左侧键盘宽度（CSS px）。 */
const KEYBOARD_W = 68;
/** 黑键的音级（半音）。 */
const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
/** 卷帘至少展示三个完整八度。 */
const MIN_VISIBLE_SEMITONES = 36;
const WHITE_KEY_INDEX = new Map([
  [0, 0],
  [2, 1],
  [4, 2],
  [5, 3],
  [7, 4],
  [9, 5],
  [11, 6],
]);

function isBlackKey(pitch: number): boolean {
  return BLACK_KEYS.has(((pitch % 12) + 12) % 12);
}

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
  let viewState: {
    vertical: boolean;
    kbAtStart: boolean;
    naLo: number;
    naHi: number;
    scrollMs: number;
  } | null = null;

  /** 计算可见音高范围。 */
  function pitchRange(): { lo: number; hi: number } {
    if (props.notes.length === 0) return { lo: 48, hi: 83 };
    let lo = 127;
    let hi = 0;
    for (const n of props.notes) {
      if (n.pitch < lo) lo = n.pitch;
      if (n.pitch > hi) hi = n.pitch;
    }
    const paddedSpan = hi - lo + 5;
    let rangeLo: number;
    let rangeHi: number;
    if (paddedSpan > MIN_VISIBLE_SEMITONES) {
      rangeLo = Math.floor((lo - 2) / 12) * 12;
      rangeHi = Math.ceil((hi + 3) / 12) * 12 - 1;
    } else {
      const center = (lo + hi) / 2;
      rangeLo = Math.floor((center - (MIN_VISIBLE_SEMITONES - 1) / 2) / 12) * 12;
      rangeHi = rangeLo + MIN_VISIBLE_SEMITONES - 1;
      while (lo - 2 < rangeLo) {
        rangeLo -= 12;
        rangeHi -= 12;
      }
      while (hi + 2 > rangeHi) {
        rangeLo += 12;
        rangeHi += 12;
      }
    }
    if (rangeLo < 0) {
      rangeHi -= rangeLo;
      rangeLo = 0;
    }
    if (rangeHi > 127) {
      rangeLo -= rangeHi - 127;
      rangeHi = 127;
    }
    return { lo: Math.max(0, rangeLo), hi: Math.min(127, rangeHi) };
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
    // 悬浮判定线模式：隐藏琴键、瀑布铺满整条时间轴。
    const floating = !!props.floatingJudge;
    const showKeyboard = !floating;

    const { lo, hi } = pitchRange();
    const timeAxisLen = vertical ? cssH : cssW; // 时间轴总长（含键盘）
    const pitchAxisLen = vertical ? cssW : cssH; // 音高轴总长
    // 卷帘按十二平均律等分：黑键与白键的音符瀑布使用完全相同的宽度。
    const rows = hi - lo + 1;
    const cell = pitchAxisLen / Math.max(1, rows);
    const pitchRect = (pitch: number): { start: number; length: number } => {
      const index = pitch - lo;
      const start = highAtCoord0 ? pitchAxisLen - (index + 1) * cell : index * cell;
      return { start, length: cell };
    };
    const keyboardW = showKeyboard ? KEYBOARD_W : 0; // 隐藏键盘时瀑布占满整条时间轴
    const noteAreaTime = timeAxisLen - keyboardW; // 时间轴上音符区长度

    const naLo = kbAtStart ? keyboardW : 0; // 音符区时间坐标下界
    const naHi = naLo + noteAreaTime; // 上界
    const keyBodyStart = kbAtStart ? 0 : naHi; // 琴键紧贴瀑布，不留悬空缝隙
    const keyBodyLen = KEYBOARD_W;
    const kbBorder = kbAtStart ? keyboardW : naHi; // 键盘与音符区的分隔线

    const visibleMs = noteAreaTime / pxPerMs;
    const maxScroll = Math.max(0, props.durationMs - visibleMs);

    // 计算滚动位置。仅在「跟随 且 正在播放」时自动跟随；其余情况允许手动平移。
    const autoFollow = props.follow && props.isPlaying;
    let scrollX: number;
    if (autoFollow) {
      if (floating) {
        // 悬浮判定线：当前音符停在音符区约 40% 处，已演奏音符继续向远端流过、仍可见。
        scrollX = clamp(props.currentTimeMs - visibleMs * 0.4, 0, maxScroll);
      } else {
        // 贴键盘：当前音符落在琴键交接处；末尾继续滚动，直到最后一个音落键。
        scrollX = Math.max(0, props.currentTimeMs);
      }
      userScrollX = scrollX;
    } else {
      scrollX = clamp(userScrollX, 0, maxScroll);
      userScrollX = scrollX;
    }
    viewState = { vertical, kbAtStart, naLo, naHi, scrollMs: scrollX };

    // 逻辑坐标：tPos 沿时间轴、pPos 沿音高轴。
    // 让「瀑布」始终朝着琴键所在的位置流动：键盘在起点时时间正向、在末端时时间反向，
    // 使演奏指针贴近键盘、未来音符在远端、随播放向键盘汇聚。
    const tPos = (t: number) =>
      kbAtStart ? naLo + (t - scrollX) * pxPerMs : naHi - (t - scrollX) * pxPerMs;
    // 逻辑矩形（沿时间 [t0,tLen]、沿音高 [p0,pLen]）→ 屏幕矩形
    const fillRect = (t0: number, tLen: number, p0: number, pLen: number) => {
      if (vertical) ctx.fillRect(p0, t0, pLen, tLen);
      else ctx.fillRect(t0, p0, tLen, pLen);
    };
    const strokeRect = (t0: number, tLen: number, p0: number, pLen: number) => {
      if (vertical) ctx.strokeRect(p0, t0, pLen, tLen);
      else ctx.strokeRect(t0, p0, tLen, pLen);
    };
    const drawLogicalPolygon = (points: readonly { t: number; p: number }[]) => {
      ctx.beginPath();
      points.forEach((point, index) => {
        const x = vertical ? point.p : point.t;
        const y = vertical ? point.t : point.p;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
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
      if (isBlackKey(p)) {
        const lane = pitchRect(p);
        ctx.fillStyle = `color-mix(in oklch, ${mutedFg} 12%, transparent)`;
        fillRect(naLo, noteAreaTime, lane.start, lane.length);
      }
    }

    // 小节网格：当前版本固定 4/4，跨速度段时仍按累计拍数准确换算。
    ctx.strokeStyle = `color-mix(in oklch, ${border} 70%, transparent)`;
    ctx.lineWidth = 1;
    ctx.font = '10px ui-sans-serif, system-ui';
    ctx.fillStyle = mutedFg;
    const startMeasure = Math.floor(beatAtTime(scrollX, props.sections) / BEATS_PER_MEASURE);
    const endMeasure = Math.ceil(
      beatAtTime(scrollX + visibleMs, props.sections) / BEATS_PER_MEASURE,
    );
    for (let measure = startMeasure; measure <= endMeasure; measure++) {
      const tc = tPos(timeAtBeat(measure * BEATS_PER_MEASURE, props.sections));
      if (tc < naLo || tc > naHi) continue;
      lineAcrossPitch(tc);
      const label = String(measure + 1);
      // 标号放在小节线的“未来”一侧，也就是瀑布运动方向的远端：
      // 下落时在线上方、左落时在线右侧；镜像布局自动反向。
      if (vertical) {
        ctx.fillText(label, 3, kbAtStart ? tc + 11 : tc - 4);
      } else {
        ctx.textAlign = kbAtStart ? 'left' : 'right';
        ctx.fillText(label, kbAtStart ? tc + 3 : tc - 3, 11);
        ctx.textAlign = 'left';
      }
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
      const lane = pitchRect(n.pitch);
      const active =
        n.startTime <= props.currentTimeMs && props.currentTimeMs < n.startTime + n.duration;
      ctx.fillStyle = trackColor(n.trackNo, active ? 1 : 0.82);
      // 末尾留约 1.5px 间隙：同一琴键连续按多次时相邻音符不再连成一条，可视觉区分
      const noteLen = Math.max(1.5, drawTLen - 1.5);
      fillRect(drawT, noteLen, lane.start + 0.75, Math.max(1.5, lane.length - 1.5));
      if (active) {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 1.5;
        strokeRect(
          drawT + 0.5,
          Math.max(1, noteLen - 1),
          lane.start + 1,
          Math.max(1, lane.length - 2.5),
        );
      }
    }

    // 当前发声的音高 → 其音轨色：「按下」高亮用与瀑布音符相同的颜色，
    // 任何主题色 / 明暗模式下都清晰可见（主色为黑时也不会在黑键上看不出）。
    const activePitchColor = new Map<number, string>();
    for (const n of props.notes) {
      if (n.startTime <= props.currentTimeMs && props.currentTimeMs < n.startTime + n.duration) {
        const ap = Math.max(0, Math.min(127, n.pitch));
        if (!activePitchColor.has(ap)) activePitchColor.set(ap, trackColor(n.trackNo, 1));
      }
    }

    // 悬浮判定线模式隐藏琴键、铺满瀑布；否则绘制扁平键盘。
    if (showKeyboard) {
      // 扁平键盘：每个半音与卷帘等宽；黑键只在时间轴方向缩短，不再绘制拟物倒角。
      ctx.fillStyle = bg;
      fillRect(kbAtStart ? 0 : naHi, KEYBOARD_W, 0, pitchAxisLen);
      const blackKeyLen = keyBodyLen * 0.62;
      const blackKeyStart = kbAtStart ? keyBodyStart + keyBodyLen - blackKeyLen : keyBodyStart;
      const whiteFill = bg;
      const whiteBorder = border;

      // 现实键盘的七个白键前端等宽；黑键并不要求正压在白键前端缝隙的中心。
      // 后段在有黑键的一侧收至黑键中心，无黑键的 E/F、B/C 则沿前端缝隙直通到底。
      for (let p = lo; p <= hi; p++) {
        if (isBlackKey(p)) continue;
        const lane = pitchRect(p);
        const octaveBase = Math.floor(p / 12) * 12;
        const octaveFirst = pitchRect(octaveBase);
        const octaveLast = pitchRect(octaveBase + 11);
        const octaveStart = Math.min(octaveFirst.start, octaveLast.start);
        const octaveEnd = Math.max(
          octaveFirst.start + octaveFirst.length,
          octaveLast.start + octaveLast.length,
        );
        const whiteIndex = WHITE_KEY_INDEX.get(((p % 12) + 12) % 12) ?? 0;
        const coordinateIndex = highAtCoord0 ? 6 - whiteIndex : whiteIndex;
        const whiteFrontWidth = (octaveEnd - octaveStart) / 7;
        const wideStart = octaveStart + coordinateIndex * whiteFrontWidth;
        const wideEnd = wideStart + whiteFrontWidth;
        let narrowStart = wideStart;
        let narrowEnd = wideEnd;
        for (const neighborPitch of [p - 1, p + 1]) {
          if (!isBlackKey(neighborPitch)) continue;
          const neighbor = pitchRect(neighborPitch);
          const middle = neighbor.start + neighbor.length / 2;
          if (middle < (wideStart + wideEnd) / 2) narrowStart = middle;
          else narrowEnd = middle;
        }
        const pressFill = activePitchColor.get(p);
        const pressed = pressFill !== undefined;
        ctx.fillStyle = pressed ? pressFill : whiteFill;
        ctx.strokeStyle = whiteBorder;
        ctx.lineWidth = 1;
        const keyEnd = keyBodyStart + keyBodyLen;
        const shoulder = kbAtStart ? blackKeyStart : blackKeyStart + blackKeyLen;
        const points = kbAtStart
          ? [
              { t: keyBodyStart + 0.5, p: wideStart + 0.5 },
              { t: shoulder, p: wideStart + 0.5 },
              { t: shoulder, p: narrowStart + 0.5 },
              { t: keyEnd - 0.5, p: narrowStart + 0.5 },
              { t: keyEnd - 0.5, p: narrowEnd - 0.5 },
              { t: shoulder, p: narrowEnd - 0.5 },
              { t: shoulder, p: wideEnd - 0.5 },
              { t: keyBodyStart + 0.5, p: wideEnd - 0.5 },
            ]
          : [
              { t: keyBodyStart + 0.5, p: narrowStart + 0.5 },
              { t: shoulder, p: narrowStart + 0.5 },
              { t: shoulder, p: wideStart + 0.5 },
              { t: keyEnd - 0.5, p: wideStart + 0.5 },
              { t: keyEnd - 0.5, p: wideEnd - 0.5 },
              { t: shoulder, p: wideEnd - 0.5 },
              { t: shoulder, p: narrowEnd - 0.5 },
              { t: keyBodyStart + 0.5, p: narrowEnd - 0.5 },
            ];
        drawLogicalPolygon(points);

        if (p % 12 === 0) {
          ctx.fillStyle = pressed ? primaryFg : '#77746d';
          ctx.font = '9px ui-sans-serif, system-ui';
          const label = `C${Math.floor(p / 12) - 1}`;
          if (vertical) {
            const ly = kbAtStart ? keyBodyStart + 9 : keyBodyStart + keyBodyLen - 3;
            ctx.fillText(label, lane.start + 2, ly);
          } else {
            ctx.textAlign = kbAtStart ? 'left' : 'right';
            ctx.fillText(
              label,
              kbAtStart ? keyBodyStart + 2 : keyBodyStart + keyBodyLen - 2,
              lane.start + lane.length - 2,
            );
            ctx.textAlign = 'left';
          }
        }
      }

      // 黑键保持纯色平面；音高轴宽度与白键、瀑布音符完全一致。
      for (let p = lo; p <= hi; p++) {
        if (!isBlackKey(p)) continue;
        const lane = pitchRect(p);
        const pressFill = activePitchColor.get(p);
        ctx.fillStyle = pressFill ?? fg;
        fillRect(blackKeyStart, blackKeyLen, lane.start, lane.length);
        ctx.strokeStyle = border;
        ctx.lineWidth = 1;
        strokeRect(blackKeyStart + 0.5, blackKeyLen - 1, lane.start + 0.5, lane.length - 1);
      }
      // 键盘与音符区的分隔线
      ctx.strokeStyle = border;
      ctx.lineWidth = 1;
      lineAcrossPitch(kbBorder);
    }

    // 判定线：悬浮模式下始终画（音符流经它）；贴键盘模式仅在非跟随时画指针（跟随时音符已落键）。
    const tc = tPos(props.currentTimeMs);
    if ((floating || !autoFollow) && tc >= naLo && tc <= naHi) {
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

  // 指针拖动平移（触屏/鼠标皆可，沿时间轴）；自动跟随播放时禁用。
  // canvas 设 touch-action:none，避免浏览器把触摸当作页面滚动而抢走手势。
  let pointerActive = false;
  let panning = false;
  let dragged = false;
  let downX = 0;
  let downY = 0;
  let panLastX = 0;
  let panLastY = 0;
  function onPointerDown(e: PointerEvent) {
    if (e.button > 0) return;
    pointerActive = true;
    panning = !(props.follow && props.isPlaying);
    dragged = false;
    downX = e.clientX;
    downY = e.clientY;
    panLastX = e.clientX;
    panLastY = e.clientY;
    canvasEl.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!pointerActive) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) dragged = true;
    if (!panning || !dragged) return;
    const vertical = props.orientation === 'vertical';
    // 时间轴方向随键盘位置（kbAtStart）翻转，平移符号需随之翻转，否则
    // 「纵向 + 键盘在底」等布局下拖动方向会与内容相反。
    const kbAtStart = vertical ? !!props.keyboardFlip : !props.keyboardFlip;
    const along = vertical ? e.clientY - panLastY : e.clientX - panLastX;
    panLastX = e.clientX;
    panLastY = e.clientY;
    // 让内容跟随手指：kbAtStart 时时间正向（取相反号），否则时间反向（取同号）
    userScrollX = Math.max(0, userScrollX + ((kbAtStart ? -along : along) / pxPerMs));
    draw();
  }
  function seekAt(clientX: number, clientY: number) {
    const state = viewState;
    if (!state || !props.onSeek) return;
    const rect = canvasEl.getBoundingClientRect();
    const axis = state.vertical ? clientY - rect.top : clientX - rect.left;
    if (axis < state.naLo || axis > state.naHi) return;
    const offset = state.kbAtStart ? axis - state.naLo : state.naHi - axis;
    props.onSeek(clamp(state.scrollMs + offset / pxPerMs, 0, props.durationMs));
  }
  function onPointerUp(e: PointerEvent) {
    if (!pointerActive) return;
    if (!dragged) seekAt(e.clientX, e.clientY);
    pointerActive = false;
    panning = false;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
  }
  function onPointerCancel(e: PointerEvent) {
    pointerActive = false;
    panning = false;
    try {
      canvasEl.releasePointerCapture(e.pointerId);
    } catch {
      /* 忽略 */
    }
  }

  /** 键盘操作与原生 slider 一致：方向键逐拍，Home/End 到首尾。 */
  function onKeyDown(e: KeyboardEvent) {
    let target: number | null = null;
    const currentBeat = beatAtTime(props.currentTimeMs, props.sections);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      target = timeAtBeat(Math.max(0, currentBeat - 1), props.sections);
    } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      target = timeAtBeat(currentBeat + 1, props.sections);
    } else if (e.key === 'Home') {
      target = 0;
    } else if (e.key === 'End') {
      target = props.durationMs;
    }
    if (target === null || !props.onSeek) return;
    e.preventDefault();
    props.onSeek(clamp(target, 0, props.durationMs));
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
    void props.floatingJudge; // 判定线位置 / 琴键显隐切换后重绘
    void isDark(); // 深浅色切换后重绘，使画布配色同步更新
    void themeColor(); // 主题色切换后重绘（播放指针颜色）
    draw();
  });

  return (
    <div ref={containerEl} class="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasEl}
        class="block touch-none cursor-crosshair"
        role="slider"
        tabIndex={0}
        aria-label="Piano roll playback position"
        aria-valuemin={0}
        aria-valuemax={props.durationMs}
        aria-valuenow={Math.round(props.currentTimeMs)}
        aria-valuetext={`Measure ${measureAtTime(props.currentTimeMs, props.sections)}`}
        onWheel={onWheel}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      />
    </div>
  );
}
