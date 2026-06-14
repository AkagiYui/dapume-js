/**
 * 和弦引擎
 *
 * 完整复刻 dapume-py 的 `Chord` 类与 `Chord.from_score`。
 * 和弦本质是维护一个长度为 7 的数组
 *   [根音, 三音, 五音, 七音, 九音, 十一音, 十三音]
 * 每个位置上的数值代表该音相对「纯/大音程」的升降半音数，`null` 表示该音不存在。
 */

import {
  CHORD_FAMILIES,
  CHORD_FAMILY_NOTES,
  CHORD_INDEX_TO_PITCH,
  CHORD_INTERVAL_TO_INDEX,
  CHORD_TYPES,
  RE_PATTERN_CHORD_SUFFIX,
  SOLFEGE_PITCH,
} from './constants';
import type { RelativeNote } from './types';

/** 三度叠置和弦。 */
export class Chord {
  /** 长度为 7 的升降表，`null` 表示该音不存在。 */
  notes: (number | null)[];

  /**
   * @param family 和弦家族（'M' | 'm' | 'dim' | 'aug' | '' | 'mM' | 'augM'）。
   * @param type   叠置到的最高音程（3=三和弦, 7, 9, 11, 13）。
   */
  constructor(family: string = 'M', type: number = 3) {
    // 复制一份可变的家族模板。
    this.notes = [...(CHORD_FAMILY_NOTES[family] ?? CHORD_FAMILY_NOTES.M)];
    if (type === 3) {
      this.notes[3] = null; // 三和弦：去掉七音
    }
    if (type === 9 || type === 11 || type === 13) {
      this.add(9);
    }
    if (type === 11 || type === 13) {
      this.add(11);
    }
    if (type === 13) {
      this.add(13);
    }
  }

  /** 添加某一「纯/大音程」的音。若音程非法（不在映射表内）则忽略，避免崩溃。 */
  add(interval: number): void {
    const idx = CHORD_INTERVAL_TO_INDEX[interval];
    if (idx !== undefined) this.notes[idx] = 0;
  }

  /** （添加并）将某一音程升半音。 */
  sharp(interval: number): void {
    const idx = CHORD_INTERVAL_TO_INDEX[interval];
    if (idx !== undefined) this.notes[idx] = 1;
  }

  /** （添加并）将某一音程降半音。 */
  flat(interval: number): void {
    const idx = CHORD_INTERVAL_TO_INDEX[interval];
    if (idx !== undefined) this.notes[idx] = -1;
  }

  /** 删除某一音程的音。 */
  omit(interval: number): void {
    const idx = CHORD_INTERVAL_TO_INDEX[interval];
    if (idx !== undefined) this.notes[idx] = null;
  }

  /** 将三音替换为纯四度音（second=false）或大二度音（second=true），即 sus4 / sus2。 */
  sus(second: boolean = false): void {
    this.notes[1] = second ? -2 : 1;
  }

  /**
   * 给定根音音高与低音（bass）音高，返回和弦所有音的相对音高列表。
   * 低于 bass 的音会被向上移动若干个八度，从而实现转位 / 斜杠和弦。
   */
  getNotes(rootNote: number = 0, on: number | null = null): number[] {
    const ret: number[] = [];
    for (let i = 0; i < this.notes.length; i++) {
      const k = this.notes[i];
      if (k !== null && k !== undefined) {
        ret.push(rootNote + CHORD_INDEX_TO_PITCH[i] + k);
      }
    }
    // on 为 null 时，bass 取根音。注意 0 是合法的 bass 值，不能与 null 混淆。
    let bass = on;
    if (bass === null) bass = rootNote;
    if (!ret.includes(bass)) ret.push(bass);
    const highest = Math.max(...ret);
    for (let i = 0; i < ret.length; i++) {
      const k = ret[i];
      if (k < bass) {
        ret[i] = k + Math.ceil((highest - k) / 12) * 12;
      }
    }
    return ret;
  }
}

/** 和弦级数（如 "1"、"5#"、"7b"）→ 相对主音的半音数。 */
function degreeToSolfa(degree: string): number {
  let solfa = SOLFEGE_PITCH[Number.parseInt(degree[0]!, 10)] ?? 0;
  if (degree.length > 1) {
    if (degree[1] === '#') solfa += 1;
    else if (degree[1] === 'b') solfa -= 1;
  }
  return solfa;
}

/**
 * 将一段和弦记号文本解析为若干 {@link RelativeNote}。
 * 每个音符的音轨编号从 0 开始依次编号（后续会被音轨编排逻辑重新映射）。
 *
 * @param score     方括号内的和弦记号文本，如 `4M7`、`3/5#`、`57sus`。
 * @param startBeat 和弦起始拍。
 * @param noteValue 和弦持续拍数。
 * @param srcStart  和弦记号在源文本中的起始下标（用于高亮）。
 * @param srcEnd    和弦记号在源文本中的结束下标（不含）。
 */
export function chordFromScore(
  score: string,
  startBeat: number,
  noteValue: number,
  srcStart: number,
  srcEnd: number,
): RelativeNote[] {
  // 1. 分离八度记号（位于末尾的 `,` `.`）。和弦默认比旋律低八度，故 octaveDelta 从 -1 起。
  let octaveDelta = -1;
  while (score.length > 0) {
    const last = score[score.length - 1];
    if (last === '.') octaveDelta += 1;
    else if (last === ',') octaveDelta -= 1;
    else break;
    score = score.slice(0, -1);
  }

  // 2. 分离转位 / 斜杠根音（`/` 之后的级数作为 bass）。
  let on: number | null = null;
  const slashIdx = score.indexOf('/');
  if (slashIdx >= 0) {
    const onStr = score.slice(slashIdx + 1);
    score = score.slice(0, slashIdx);
    on = degreeToSolfa(onStr);
  }

  // 3. 分离根音（首字符为级数，其后可跟 `#` 或 `b`）。
  let rootStr = score[0] ?? '1';
  score = score.slice(1);
  if (score !== '' && (score[0] === '#' || score[0] === 'b')) {
    rootStr += score[0];
    score = score.slice(1);
  }
  const root = degreeToSolfa(rootStr);

  // 4. 分离和弦家族（顺序敏感，见 CHORD_FAMILIES）。
  let family = '';
  for (const f of CHORD_FAMILIES) {
    if (score.startsWith(f)) {
      family = f;
      score = score.slice(f.length);
      break;
    }
  }

  // 5. 分离和弦类型（7/9/11/13，空串兜底为三和弦）。
  let type = 3;
  for (const [k, v] of CHORD_TYPES) {
    if (score.startsWith(k)) {
      type = v;
      score = score.slice(k.length);
      break;
    }
  }

  // 6. 处理后缀（add/omit/sus/升降）。
  const chord = new Chord(family, type);
  const suffixes = score.match(RE_PATTERN_CHORD_SUFFIX) ?? [];
  for (const s of suffixes) {
    if (s.startsWith('add')) {
      chord.add(Number.parseInt(s.slice(3), 10));
    } else if (s.startsWith('omit')) {
      chord.omit(Number.parseInt(s.slice(4), 10));
    } else if (s === 'sus') {
      chord.sus();
    } else if (s === 'sus2') {
      chord.sus(true);
    } else if (s.startsWith('#')) {
      chord.sharp(Number.parseInt(s.slice(1), 10));
    } else if (s.startsWith('b')) {
      chord.flat(Number.parseInt(s.slice(1), 10));
    }
  }

  // 7. 生成相对音符。
  const pitches = chord.getNotes(root, on);
  const ret: RelativeNote[] = [];
  for (let i = 0; i < pitches.length; i++) {
    ret.push({
      trackNo: i,
      solfa: pitches[i]! + octaveDelta * 12,
      startBeat,
      noteValue,
      srcStart,
      srcEnd,
      isChord: true,
    });
  }
  return ret;
}
