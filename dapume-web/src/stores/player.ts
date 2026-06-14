/**
 * 音频播放器（基于 smplr 预采样钢琴音色）。
 *
 * 不使用 Web Audio 振荡器合成，而是用 smplr 的 SplendidGrandPiano（自 CDN 加载采样），
 * 以获得真实的钢琴音色。负责：加载音色、按绝对时间调度音符、维护播放进度信号。
 */
import { createSignal } from 'solid-js';
import { SplendidGrandPiano } from 'smplr';
import type { DapumeNote } from 'dapume-js';

/** 播放器对外暴露的音色加载状态。 */
export type PianoState = 'idle' | 'loading' | 'ready' | 'error';

/** 仅声明本模块用到的 smplr 实例方法，避免对其内部类型的强耦合。 */
interface Instrument {
  start(event: { note: number; time?: number; duration?: number; velocity?: number }): unknown;
  stop(): void;
  ready: Promise<unknown>;
}

const [isPlaying, setIsPlaying] = createSignal(false);
const [currentTimeMs, setCurrentTimeMs] = createSignal(0);
const [pianoState, setPianoState] = createSignal<PianoState>('idle');

let ctx: AudioContext | null = null;
let piano: Instrument | null = null;
let pianoLoad: Promise<Instrument> | null = null;

let rafId = 0;
let endTimer = 0; // 兜底定时器：即使 rAF 在后台被暂停也能在结束时停止
let baseCtxTime = 0; // 播放开始时的 AudioContext 时刻（秒）
let baseOffsetMs = 0; // 该时刻对应的乐谱毫秒位置（用于从中途续播）
let totalDurationMs = 0;
let pausedAtMs = 0;

/** 懒创建 AudioContext。 */
function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

/** 确保钢琴音色已开始加载并返回实例（可提前调用以预热）。 */
export function ensurePiano(): Promise<Instrument> {
  if (pianoLoad) return pianoLoad;
  setPianoState('loading');
  const instrument = new SplendidGrandPiano(getCtx()) as unknown as Instrument;
  piano = instrument;
  pianoLoad = instrument.ready
    .then(() => {
      setPianoState('ready');
      return instrument;
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
  instrument.stop(); // 清除先前仍在调度/发声的音符，避免叠加
  totalDurationMs = durationMs;
  baseOffsetMs = fromMs;
  baseCtxTime = context.currentTime + 0.12; // 留一点调度提前量

  for (const n of notes) {
    const end = n.startTime + n.duration;
    if (end <= fromMs) continue; // 已结束的音符跳过
    // 续播时，对仍在发声的音符做尾段截断
    const startMs = Math.max(n.startTime, fromMs);
    const dur = end - startMs;
    instrument.start({
      note: n.pitch,
      time: baseCtxTime + (startMs - fromMs) / 1000,
      duration: dur / 1000,
      velocity: 96,
    });
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
  piano?.stop();
  setIsPlaying(false);
}

/** 停止：停止发声并将进度归零。 */
export function stop(): void {
  stopLoop();
  piano?.stop();
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

export { isPlaying, currentTimeMs, pianoState };
