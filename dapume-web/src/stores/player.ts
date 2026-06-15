/**
 * 音频播放器（基于 smplr 预采样钢琴音色）。
 *
 * 不使用 Web Audio 振荡器合成，而是用 smplr 的 SplendidGrandPiano（自 CDN 加载采样），
 * 以获得真实的钢琴音色。负责：加载音色、按绝对时间调度音符、维护播放进度信号。
 */
import { createSignal } from 'solid-js';
import type { DapumeNote } from 'dapume-js';
// 注意：smplr 在 ensurePiano() 中动态导入，避免其进入 SSR/预渲染的模块图。

/** 播放器对外暴露的音色加载状态。 */
export type PianoState = 'idle' | 'loading' | 'ready' | 'error';

/** 单个音符的停止函数（smplr 的 start() 返回值）。 */
type StopFn = (time?: number) => void;

/** 仅声明本模块用到的 smplr 实例方法，避免对其内部类型的强耦合。 */
interface Instrument {
  start(event: { note: number; time?: number; duration?: number; velocity?: number }): StopFn;
  stop(): void;
  ready: Promise<unknown>;
}

const [isPlaying, setIsPlaying] = createSignal(false);
const [currentTimeMs, setCurrentTimeMs] = createSignal(0);
const [pianoState, setPianoState] = createSignal<PianoState>('idle');
/** 音色加载进度（0~1）。 */
const [loadProgress, setLoadProgress] = createSignal(0);

let ctx: AudioContext | null = null;
let piano: Instrument | null = null;
let pianoLoad: Promise<Instrument> | null = null;

let rafId = 0;
let endTimer = 0; // 兜底定时器：即使 rAF 在后台被暂停也能在结束时停止
let baseCtxTime = 0; // 播放开始时的 AudioContext 时刻（秒）
let baseOffsetMs = 0; // 该时刻对应的乐谱毫秒位置（用于从中途续播）
let totalDurationMs = 0;
let pausedAtMs = 0;
let activeStops: StopFn[] = []; // 本次播放已调度音符的停止函数

/** 懒创建 AudioContext。 */
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** 确保钢琴音色已开始加载并返回实例（可提前调用以预热）。 */
export function ensurePiano(): Promise<Instrument> {
  if (pianoLoad) return pianoLoad;
  setPianoState('loading');
  setLoadProgress(0);
  // 动态导入 smplr（仅客户端）。
  // storage: 用 CacheStorage（基于浏览器 Cache API）缓存采样，刷新后不再重复下载；
  //          非安全上下文（非 https/localhost）会自动回退为普通网络请求。
  // onLoadProgress: 上报加载进度，供 UI 显示。
  pianoLoad = import('smplr')
    .then(({ SplendidGrandPiano, CacheStorage }) => {
      const instrument = new SplendidGrandPiano(getCtx(), {
        storage: CacheStorage(),
        onLoadProgress: (p: { loaded: number; total: number }) => {
          setLoadProgress(p.total > 0 ? p.loaded / p.total : 0);
        },
      }) as unknown as Instrument;
      piano = instrument;
      return instrument.ready.then(() => {
        setLoadProgress(1);
        setPianoState('ready');
        return instrument;
      });
    })
    .catch((err) => {
      setPianoState('error');
      throw err;
    });
  return pianoLoad;
}

/** 停止当前播放循环（内部用）。 */
function stopLoop(): void {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  if (endTimer) {
    clearTimeout(endTimer);
    endTimer = 0;
  }
}

/**
 * 立即停止所有已调度/正在发声的音符。
 *
 * 关键：smplr 用绝对时间一次性排程了全部音符，仅调用 `piano.stop()` 不一定能取消
 * 那些「尚未到时」的音符。因此这里同时调用每个音符 start() 返回的停止函数，确保彻底停止。
 */
function stopAllNotes(): void {
  for (const s of activeStops) {
    try {
      s();
    } catch {
      /* 忽略 */
    }
  }
  activeStops = [];
  try {
    piano?.stop();
  } catch {
    /* 忽略 */
  }
}

/** 进度刷新循环。 */
function tick(): void {
  if (!ctx) return;
  const elapsed = (ctx.currentTime - baseCtxTime) * 1000 + baseOffsetMs;
  setCurrentTimeMs(elapsed);
  if (elapsed >= totalDurationMs) {
    stop();
    return;
  }
  rafId = requestAnimationFrame(tick);
}

/**
 * 从 `fromMs` 处开始播放给定音符序列。
 *
 * @param notes 乐谱音符（含 MIDI 音高与毫秒时间）。
 * @param durationMs 乐谱总时长。
 * @param fromMs 起始毫秒位置（用于续播）。
 */
export async function play(notes: DapumeNote[], durationMs: number, fromMs = 0): Promise<void> {
  const context = getCtx();
  await context.resume(); // 用户手势内解锁音频
  const instrument = await ensurePiano();

  stopLoop();
  stopAllNotes(); // 清除先前仍在调度/发声的音符，避免叠加
  totalDurationMs = durationMs;
  baseOffsetMs = fromMs;
  baseCtxTime = context.currentTime + 0.12; // 留一点调度提前量

  for (const n of notes) {
    const end = n.startTime + n.duration;
    if (end <= fromMs) continue; // 已结束的音符跳过
    // 续播时，对仍在发声的音符做尾段截断
    const startMs = Math.max(n.startTime, fromMs);
    const dur = end - startMs;
    const stopFn = instrument.start({
      note: n.pitch,
      time: baseCtxTime + (startMs - fromMs) / 1000,
      duration: dur / 1000,
      velocity: 96,
    });
    activeStops.push(stopFn);
  }

  setCurrentTimeMs(fromMs);
  setIsPlaying(true);
  rafId = requestAnimationFrame(tick);
  // 兜底：到时强制停止（应对后台标签页中 rAF 被暂停的情况）
  endTimer = window.setTimeout(() => stop(), Math.max(0, totalDurationMs - fromMs) + 250);
}

/** 暂停：停止发声并记住当前位置，便于续播。 */
export function pause(): void {
  pausedAtMs = currentTimeMs();
  stopLoop();
  stopAllNotes();
  setIsPlaying(false);
}

/** 停止：停止发声并将进度归零。 */
export function stop(): void {
  stopLoop();
  stopAllNotes();
  pausedAtMs = 0;
  setIsPlaying(false);
  setCurrentTimeMs(0);
}

/** 上次暂停的位置（毫秒）。 */
export function getPausedAt(): number {
  return pausedAtMs;
}

/** 跳转进度（仅在未播放时调整起点）。 */
export function seek(ms: number): void {
  pausedAtMs = ms;
  setCurrentTimeMs(ms);
}

export { isPlaying, currentTimeMs, pianoState, loadProgress };
