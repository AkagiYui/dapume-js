import type { DapumeSection } from 'dapume-js';

/** 当前版本固定使用 4/4 拍。 */
export const BEATS_PER_MEASURE = 4;

const DEFAULT_BPM = 120;

/**
 * 清理速度段：按时间排序、同一时刻保留最后一项，并保证 0ms 有速度。
 * 解析器通常已经满足这些条件，这里仍做防御处理，方便卷帘独立使用。
 */
function normalizedSections(sections: DapumeSection[]): DapumeSection[] {
  const sorted = sections
    .filter((section) => Number.isFinite(section.startTime) && section.bpm > 0)
    .slice()
    .sort((a, b) => a.startTime - b.startTime);
  const normalized: DapumeSection[] = [];
  for (const section of sorted) {
    if (normalized.at(-1)?.startTime === section.startTime) normalized[normalized.length - 1] = section;
    else normalized.push(section);
  }
  if (normalized.length === 0 || normalized[0]!.startTime > 0) {
    normalized.unshift({ startTime: 0, tonic: 60, bpm: DEFAULT_BPM, key: 'C' });
  }
  return normalized;
}

/** 把绝对毫秒换算为从乐谱开头累计的拍数，支持中途变速。 */
export function beatAtTime(timeMs: number, sections: DapumeSection[]): number {
  const target = Math.max(0, timeMs);
  const timeline = normalizedSections(sections);
  let beats = 0;
  for (let i = 0; i < timeline.length; i++) {
    const section = timeline[i]!;
    const end = timeline[i + 1]?.startTime ?? Infinity;
    if (target <= section.startTime) break;
    const segmentMs = Math.max(0, Math.min(target, end) - section.startTime);
    beats += segmentMs / (60000 / section.bpm);
    if (target <= end) break;
  }
  return beats;
}

/** 把从乐谱开头累计的拍数换算为绝对毫秒，支持中途变速。 */
export function timeAtBeat(beat: number, sections: DapumeSection[]): number {
  let remaining = Math.max(0, beat);
  const timeline = normalizedSections(sections);
  for (let i = 0; i < timeline.length; i++) {
    const section = timeline[i]!;
    const end = timeline[i + 1]?.startTime ?? Infinity;
    const msPerBeat = 60000 / section.bpm;
    const segmentBeats = end === Infinity ? Infinity : Math.max(0, end - section.startTime) / msPerBeat;
    if (remaining <= segmentBeats) return section.startTime + remaining * msPerBeat;
    remaining -= segmentBeats;
  }
  return 0;
}

/** 返回所在小节的 1-based 编号。 */
export function measureAtTime(timeMs: number, sections: DapumeSection[]): number {
  return Math.floor((beatAtTime(timeMs, sections) + 1e-7) / BEATS_PER_MEASURE) + 1;
}
