/**
 * 线性乐谱解析器
 *
 * 完整复刻 dapume-py 的 `NoteLine` 与 `LinearScore` 解析逻辑，并在此基础上
 * 增加「源文本字符位置」追踪（srcStart/srcEnd），以便上层应用做播放高亮。
 *
 * 设计说明（与原版的细微差异，均为提升健壮性，不改变合法乐谱的音乐结果）：
 * - 原版用「函数默认参数」实现参数继承，存在跨实例状态泄漏的隐患；
 *   这里改为每次 {@link parse} 调用从默认值（C 大调 / 120bpm）重新开始，符合规范。
 * - 对空音符块、空括号、行首修饰符等会让原版崩溃的边界情况做了静默跳过处理。
 */

import { chordFromScore } from './chord';
import {
  DEFAULT_BPM,
  DEFAULT_TONIC,
  NOTATION_BEATS,
  NOTATION_PITCH,
  RE_PATTERN_BPM,
  RE_PATTERN_KEY_SIGNATURE,
  SOLFEGE_PITCH,
} from './constants';
import type {
  DapumeNote,
  DapumeScore,
  DapumeSection,
  RelativeNote,
  ScoreParameters,
} from './types';

/** Python 风格取模（结果与除数同号），用于调号字母换算。 */
function pymod(a: number, b: number): number {
  return ((a % b) + b) % b;
}

/** 为字符串构造「下标即源位置」的平凡映射，用于不关心源位置的内部解析（如调号探测）。 */
function identityIndices(s: string): number[] {
  const arr: number[] = [];
  for (let i = 0; i < s.length; i++) arr.push(i);
  return arr;
}

/**
 * 解析一个「音符行」（可能是多行拼接而成）为相对音符列表。
 *
 * @param score 待解析的文本。
 * @param src   与 `score` 等长的数组，`src[i]` 为 `score[i]` 在原始源文本中的下标。
 */
export function parseNoteLineRelative(score: string, src: number[]): RelativeNote[] {
  /** 每条音轨「最后一个音符的结束拍」。下标 0 为主轨。 */
  const lastNoteBeat: number[] = [0];
  const relativeNotes: RelativeNote[] = [];
  let noteEnded = false;
  let bracketsLayer = 0;
  let bracketsScore = '';
  let bracketsSrc: number[] = [];
  let chordName = '';
  let chordNameReading = false;
  let chordStartBeat = 0;
  let chordStartSrc = -1;
  let chordEndSrc = -1;

  /** 终止当前音符；时值为零则置为默认 0.5 拍，并推进主轨光标。 */
  function endNote(): void {
    if (noteEnded) return;
    noteEnded = true;
    if (relativeNotes.length > 0) {
      const last = relativeNotes[relativeNotes.length - 1]!;
      if (last.noteValue === 0) last.noteValue = 0.5;
      lastNoteBeat[0]! += last.noteValue;
    }
  }

  /**
   * 编排 n 条音轨，要求它们在最近的 totalValue 拍内空闲。返回音轨编号数组；
   * 不足时新建音轨。同时把选中的音轨光标对齐到主轨当前位置。
   */
  function arrangeTrack(nTracks: number, totalValue: number): number[] {
    const available: number[] = [];
    for (let k = 0; k < lastNoteBeat.length; k++) {
      if (lastNoteBeat[k]! <= lastNoteBeat[0]! - totalValue) available.push(k);
    }
    const toAppend = nTracks - available.length;
    if (toAppend > 0) {
      const base = lastNoteBeat.length;
      for (let k = base; k < base + toAppend; k++) {
        available.push(k);
        lastNoteBeat.push(0);
      }
    }
    const result = available.slice(0, nTracks);
    for (const k of result) lastNoteBeat[k] = lastNoteBeat[0]!;
    return result;
  }

  /** 终止当前和弦：根据记号生成和弦音并编排到空闲音轨。 */
  function endChord(): void {
    if (chordName === '') return;
    const chordNoteValue = lastNoteBeat[0]! - chordStartBeat;
    const chordNotes = chordFromScore(chordName, chordStartBeat, chordNoteValue, chordStartSrc, chordEndSrc);
    const available = arrangeTrack(chordNotes.length, chordNoteValue);
    for (const note of chordNotes) note.trackNo = available[note.trackNo]!;
    relativeNotes.push(...chordNotes);
    chordName = '';
  }

  // 逐字符扫描
  for (let i = 0; i < score.length; i++) {
    const c = score[i]!;
    const pos = src[i]!;

    // ——— 和弦与多轨括号的状态机 ———
    if (c === ']') {
      chordNameReading = false;
      chordEndSrc = pos + 1;
    } else if (chordNameReading) {
      chordName += c;
      chordEndSrc = pos + 1;
      continue;
    } else if (c === '[') {
      endNote();
      endChord();
      chordStartBeat = lastNoteBeat[0]!;
      chordStartSrc = pos;
      chordEndSrc = pos + 1;
      chordNameReading = true;
    } else if (c === '(') {
      endNote();
      endChord();
      bracketsLayer += 1;
    } else if (c === ')') {
      bracketsLayer -= 1;
      if (bracketsLayer === 0) {
        // 递归解析括号内容（去掉开头的 '('）
        const innerScore = bracketsScore.slice(1);
        const innerSrc = bracketsSrc.slice(1);
        const bracketNotes = parseNoteLineRelative(innerScore, innerSrc);
        if (bracketNotes.length > 0) {
          const lastBN = bracketNotes[bracketNotes.length - 1]!;
          const bracketTotalValue = lastBN.startBeat + lastBN.noteValue;
          // 括号内出现过的音轨编号（按首次出现顺序去重）
          const uniqueTracks: number[] = [];
          const seen = new Set<number>();
          for (const n of bracketNotes) {
            if (!seen.has(n.trackNo)) {
              seen.add(n.trackNo);
              uniqueTracks.push(n.trackNo);
            }
          }
          const available = arrangeTrack(uniqueTracks.length, bracketTotalValue);
          const trackMap = new Map<number, number>();
          uniqueTracks.forEach((k, idx) => trackMap.set(k, available[idx]!));
          // 将括号内音符右对齐到主轨当前位置，并并入外层
          for (const note of bracketNotes) {
            note.trackNo = trackMap.get(note.trackNo)!;
            note.startBeat = lastNoteBeat[0]! - bracketTotalValue + note.startBeat;
            relativeNotes.push(note);
          }
        }
        bracketsScore = '';
        bracketsSrc = [];
      }
    }

    // 处于括号内：累积字符（含源下标），跳过音符处理
    if (bracketsLayer > 0) {
      bracketsScore += c;
      bracketsSrc.push(pos);
      continue;
    }

    // ——— 音高与时值 ———
    if (c >= '0' && c <= '7') {
      endNote();
      relativeNotes.push({
        trackNo: 0,
        solfa: SOLFEGE_PITCH[Number(c)]!,
        startBeat: lastNoteBeat[0]!,
        noteValue: 0,
        srcStart: pos,
        srcEnd: pos + 1,
        isChord: false,
      });
      noteEnded = false;
    } else if (c === '.' || c === ',' || c === '#' || c === 'b') {
      // 音高修饰符。若当前没有音符（如行首），静默忽略以避免崩溃。
      const last = relativeNotes[relativeNotes.length - 1];
      if (last) {
        last.solfa += NOTATION_PITCH[c]!;
        last.srcEnd = pos + 1;
      }
    } else if (c === '-' || c === '~' || c === '=' || c === '+' || c === '*' || c === '^' || c === "'") {
      // 时值修饰符。
      const last = relativeNotes[relativeNotes.length - 1];
      if (last) {
        last.noteValue += NOTATION_BEATS[c]!;
        last.srcEnd = pos + 1;
      }
    }
    // 其它字符（'/' 小节线、换行、空白等）一律忽略
  }

  // 收尾：终止最后的音符与和弦
  endNote();
  endChord();
  return relativeNotes;
}

/** 将相对音符转换为绝对音符（应用调号与速度）。 */
function relativeToAbsolute(rel: RelativeNote[], param: ScoreParameters): DapumeNote[] {
  const msPerBeat = param.bpm > 0 ? (60 / param.bpm) * 1000 : 0;
  return rel.map((n) => ({
    trackNo: n.trackNo,
    pitch: n.solfa + param.tonic,
    // 与 Python int() 一致：对非负数取整即截断
    startTime: Math.trunc(n.startBeat * msPerBeat),
    duration: Math.trunc(n.noteValue * msPerBeat),
    srcStart: n.srcStart,
    srcEnd: n.srcEnd,
    isChord: n.isChord,
  }));
}

/** 由调号记号（如 `1=D`、`1=Bb.`）计算主音音高（MIDI）。 */
function keySignatureToTonic(keySign: string): number {
  const letter = keySign[2]!;
  const solfaToC = pymod(letter.charCodeAt(0) - 'C'.charCodeAt(0), 7) + 1;
  const mini = String(solfaToC) + keySign.slice(3);
  const rel = parseNoteLineRelative(mini, identityIndices(mini));
  return (rel[0]?.solfa ?? 0) + DEFAULT_TONIC;
}

/** 每行解析出的参数快照。 */
interface LineParam {
  changed: boolean;
  tonic: number;
  bpm: number;
  /** 调号标签，如 "C"、"Bb."（不含前缀 "1="）。 */
  key: string;
}

/**
 * 解析一段 dapume（线性乐谱）文本，返回解析好的乐谱对象。
 *
 * 这是本库对外暴露的第一个核心函数。
 *
 * @param text dapume 语法文本。
 * @returns 解析后的乐谱对象 {@link DapumeScore}。
 *
 * @example
 * ```ts
 * import { parse } from 'dapume-js';
 * const score = parse('1=C 120bpm\n1234567');
 * console.log(score.notes.length); // 7
 * ```
 */
export function parse(text: string): DapumeScore {
  const rawLines = text.split('\n');

  // 计算每行在原始文本中的起始偏移
  const lineStart: number[] = [];
  {
    let off = 0;
    for (const ln of rawLines) {
      lineStart.push(off);
      off += ln.length + 1; // +1 为换行符
    }
  }

  // 逐行计算参数（用 running 状态实现「未指定则继承」）
  let runTonic = DEFAULT_TONIC;
  let runBpm = DEFAULT_BPM;
  let runKey = 'C';
  const paramByLine: LineParam[] = [];
  for (const line of rawLines) {
    let changed = false;
    const km = line.match(RE_PATTERN_KEY_SIGNATURE);
    if (km) {
      runTonic = keySignatureToTonic(km[0]);
      runKey = km[0].slice(2); // "1=Bb." → "Bb."
      changed = true;
    }
    const bm = line.match(RE_PATTERN_BPM);
    if (bm) {
      const digits = bm[1] ?? '';
      if (digits !== '') runBpm = Number.parseInt(digits, 10);
      changed = true;
    }
    paramByLine.push({ changed, tonic: runTonic, bpm: runBpm, key: runKey });
  }
  // 末尾哨兵：保证最后一个音符块被解析
  paramByLine.push({ changed: true, tonic: runTonic, bpm: runBpm, key: runKey });

  // 逐块解析：连续的非参数行拼接为一个音符块
  const allNotes: DapumeNote[] = [];
  const sections: DapumeSection[] = [];
  let curParam: ScoreParameters = { tonic: DEFAULT_TONIC, bpm: DEFAULT_BPM };
  let curKey = 'C';
  let stTime = 0;
  let blockStr = '';
  let blockSrc: number[] = [];

  for (let i = 0; i < rawLines.length; i++) {
    if (paramByLine[i]!.changed) {
      curParam = { tonic: paramByLine[i]!.tonic, bpm: paramByLine[i]!.bpm };
      curKey = paramByLine[i]!.key;
    } else {
      const line = rawLines[i]!;
      const base = lineStart[i]!;
      for (let j = 0; j < line.length; j++) {
        blockStr += line[j];
        blockSrc.push(base + j);
      }
      if (paramByLine[i + 1]!.changed) {
        const rel = parseNoteLineRelative(blockStr, blockSrc);
        const abs = relativeToAbsolute(rel, curParam);
        if (abs.length > 0) {
          const blockStart = stTime; // 本块首音符的时刻
          for (const n of abs) n.startTime += stTime;
          const last = abs[abs.length - 1]!;
          stTime = last.startTime + last.duration;
          for (const n of abs) allNotes.push(n);
          // 记录该段的调号/速度（用于按时间查询当前 1=? 与 bpm）
          sections.push({ startTime: blockStart, tonic: curParam.tonic, bpm: curParam.bpm, key: curKey });
        }
        blockStr = '';
        blockSrc = [];
      }
    }
  }

  // 过滤超出 MIDI 范围（0~127）的音符——休止符（0）即由此被剔除
  const valid = allNotes.filter((n) => n.pitch >= 0 && n.pitch <= 127);

  // 按音轨分组（保持解析顺序，以便渲染 MIDI）
  let trackCount = 0;
  for (const n of valid) trackCount = Math.max(trackCount, n.trackNo + 1);
  const tracks: DapumeNote[][] = [];
  for (let i = 0; i < trackCount; i++) tracks.push([]);
  for (const n of valid) tracks[n.trackNo]!.push(n);

  // 扁平列表，按开始时刻升序（再以音轨、音高稳定排序）
  const notes = valid.slice().sort((a, b) => {
    if (a.startTime !== b.startTime) return a.startTime - b.startTime;
    if (a.trackNo !== b.trackNo) return a.trackNo - b.trackNo;
    return a.pitch - b.pitch;
  });

  // 总时长
  let durationMs = 0;
  for (const n of valid) durationMs = Math.max(durationMs, n.startTime + n.duration);

  return { tracks, notes, trackCount, durationMs, sections };
}

/**
 * 返回给定时刻（毫秒）生效的调号与速度（用于播放时实时显示 1=? 与 bpm）。
 *
 * @param score 乐谱对象。
 * @param timeMs 当前时刻（毫秒）。
 */
export function paramsAt(score: DapumeScore, timeMs: number): DapumeSection {
  let cur: DapumeSection = { startTime: 0, tonic: DEFAULT_TONIC, bpm: DEFAULT_BPM, key: 'C' };
  for (const s of score.sections) {
    if (s.startTime <= timeMs) cur = s;
    else break;
  }
  return cur;
}
