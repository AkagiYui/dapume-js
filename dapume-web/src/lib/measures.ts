import type { DapumeSection } from 'dapume-js';

/** 当前版本固定使用 4/4 拍。 */
export const BEATS_PER_MEASURE = 4;

const DEFAULT_BPM = 120;
const BEAT_EPSILON = 1e-9;

/**
 * 清理速度段，并确保每段都有从乐谱开头累计的精确拍位。
 * 新解析结果直接携带 startBeat；兼容旧数据时才由相邻速度段补算。
 */
function normalizedSections(sections: DapumeSection[]): DapumeSection[] {
  const sorted = sections
    .filter((section) => Number.isFinite(section.startTime) && section.bpm > 0)
    .slice()
    .sort((a, b) => a.startTime - b.startTime);
  const deduped: DapumeSection[] = [];
  for (const section of sorted) {
    if (deduped.at(-1)?.startTime === section.startTime) deduped[deduped.length - 1] = section;
    else deduped.push(section);
  }
  if (deduped.length === 0 || deduped[0]!.startTime > 0) {
    deduped.unshift({ startTime: 0, startBeat: 0, tonic: 60, bpm: DEFAULT_BPM, key: 'C' });
  }

  const normalized: DapumeSection[] = [];
  for (const section of deduped) {
    const previous = normalized.at(-1);
    const inferredBeat = previous
      ? previous.startBeat + ((section.startTime - previous.startTime) * previous.bpm) / 60000
      : 0;
    normalized.push({ ...section, startBeat: Number.isFinite(section.startBeat) ? section.startBeat : inferredBeat });
  }
  return normalized;
}

/** 把绝对毫秒换算为从乐谱开头累计的拍数，速度段边界使用解析器记录的精确拍位。 */
export function beatAtTime(timeMs: number, sections: DapumeSection[]): number {
  const target = Math.max(0, timeMs);
  const timeline = normalizedSections(sections);
  let section = timeline[0]!;
  for (const candidate of timeline) {
    if (candidate.startTime <= target) section = candidate;
    else break;
  }
  return section.startBeat + ((target - section.startTime) * section.bpm) / 60000;
}

/** 把从乐谱开头累计的拍数换算为绝对毫秒，速度段边界使用解析器记录的精确拍位。 */
export function timeAtBeat(beat: number, sections: DapumeSection[]): number {
  const target = Math.max(0, beat);
  const timeline = normalizedSections(sections);
  let section = timeline[0]!;
  for (const candidate of timeline) {
    if (candidate.startBeat <= target + BEAT_EPSILON) section = candidate;
    else break;
  }
  return section.startTime + ((target - section.startBeat) * 60000) / section.bpm;
}

/** 返回精确拍位所在小节的 1-based 编号。 */
export function measureAtBeat(beat: number): number {
  return Math.floor((Math.max(0, beat) + BEAT_EPSILON) / BEATS_PER_MEASURE) + 1;
}

/** 返回精确总拍数覆盖的小节数量。 */
export function measureCount(durationBeats: number): number {
  if (durationBeats <= 0) return 0;
  return Math.max(1, Math.ceil((durationBeats - BEAT_EPSILON) / BEATS_PER_MEASURE));
}

/** 返回毫秒时刻所在小节的 1-based 编号。 */
export function measureAtTime(timeMs: number, sections: DapumeSection[]): number {
  return measureAtBeat(beatAtTime(timeMs, sections));
}

/** 返回当前 1-based 小节与拍号；显示用拍号固定为 1~4。 */
export function musicalPositionAtTime(
  timeMs: number,
  sections: DapumeSection[],
): { measure: number; beat: number } {
  const absoluteBeat = beatAtTime(timeMs, sections);
  const nearestInteger = Math.round(absoluteBeat);
  // 毫秒时间来自解析器截断，整数拍边界最多相差约 1ms；仅在边界附近吸附，避免 3.999 显示成上一拍。
  let bpm = DEFAULT_BPM;
  for (const section of normalizedSections(sections)) {
    if (section.startTime <= timeMs) bpm = section.bpm;
    else break;
  }
  const tolerance = Math.max(BEAT_EPSILON, (bpm / 60000) * 1.1);
  const snapped = Math.abs(absoluteBeat - nearestInteger) <= tolerance ? nearestInteger : absoluteBeat;
  return {
    measure: measureAtBeat(snapped),
    beat: Math.floor((snapped + BEAT_EPSILON) % BEATS_PER_MEASURE) + 1,
  };
}
