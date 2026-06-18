/**
 * 线性乐谱解析器
 *
 * 在 dapume-py 的 `NoteLine` / `LinearScore` 解析逻辑之上扩展，并增加「源文本字符位置」
 * 追踪（srcStart/srcEnd）以便上层做播放高亮。音高、时值、调号、速度、休止符等听感与原版一致。
 *
 * 音轨语义（round-23 起，换行符敏感，不再追求与 dapume-py 的音轨编排一致）：
 * - 行内的「同时音」——括号 `(...)` 与和弦 `[...]`——都作为复音叠加在同一音轨（右对齐到主光标）。
 * - 「多轨谱（双手谱）」：当**一整行**被一对括号包围时，该行作为一条新音轨，与上一条普通行同起点；
 *   普通行依次推进主轨光标。例如四行 `1111111` / `(2222222)` / `3333333` / `(4444444)`：
 *   主轨为 1111111 接 3333333，第二轨为 2222222、4444444 分别与之并行。
 *
 * 健壮性：对空音符块、空括号、行首修饰符等会让原版崩溃的边界情况做静默跳过。
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
 * 解析一「行」线性乐谱为相对音符列表（均属同一音轨 trackNo=0）。
 *
 * 行内的「同时音」——括号 `(...)` 与和弦 `[...]`——都作为复音叠加在同一音轨上
 * （右对齐到当前主光标）。多轨（双手谱）由 {@link parse} 在「整行被括号包围」时分配新音轨。
 *
 * @param score 待解析的文本（通常是去掉换行后的单行内容）。
 * @param src   与 `score` 等长的数组，`src[i]` 为 `score[i]` 在原始源文本中的下标。
 */
export function parseNoteLineRelative(
  score: string,
  src: number[],
  startBeat = 0,
): { notes: RelativeNote[]; endBeat: number } {
  /** 主拍光标：从 startBeat 起，本行旋律依次推进的当前拍位置（行内同时音右对齐、不推进它）。
   *  由调用方把上一行的结束拍续传进来，使整段乐谱的浮点累加与「一次性连续解析」逐位一致。 */
  let mainBeat = startBeat;
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

  /** 终止当前音符；时值为零则置为默认 0.5 拍，并推进主光标。 */
  function endNote(): void {
    if (noteEnded) return;
    noteEnded = true;
    if (relativeNotes.length > 0) {
      const last = relativeNotes[relativeNotes.length - 1]!;
      if (last.noteValue === 0) last.noteValue = 0.5;
      mainBeat += last.noteValue;
    }
  }

  /** 终止当前和弦：生成和弦音，作为「同时音」叠加在同一音轨（trackNo=0）。 */
  function endChord(): void {
    if (chordName === '') return;
    const chordNoteValue = mainBeat - chordStartBeat;
    const chordNotes = chordFromScore(chordName, chordStartBeat, chordNoteValue, chordStartSrc, chordEndSrc);
    for (const note of chordNotes) note.trackNo = 0;
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
      chordStartBeat = mainBeat;
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
        const bracketNotes = parseNoteLineRelative(innerScore, innerSrc).notes;
        if (bracketNotes.length > 0) {
          const lastBN = bracketNotes[bracketNotes.length - 1]!;
          const bracketTotalValue = lastBN.startBeat + lastBN.noteValue;
          // 行内括号 = 同时音：叠加在同一音轨（trackNo=0），右对齐到当前主光标
          for (const note of bracketNotes) {
            note.trackNo = 0;
            note.startBeat = mainBeat - bracketTotalValue + note.startBeat;
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
        startBeat: mainBeat,
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
  return { notes: relativeNotes, endBeat: mainBeat };
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
  const rel = parseNoteLineRelative(mini, identityIndices(mini)).notes;
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
 * 判断一行是否「整行被一对括号包围」（多轨谱：该行作为新音轨）。
 * 是则返回去掉外层括号后的内部文本与对应源下标；否则返回 null。
 * 要求首个 `(` 恰好与末个 `)` 配对——`(1)(2)` 这种行内并列不算整行括号。
 */
function fullBracketLine(line: string, base: number): { inner: string; innerSrc: number[] } | null {
  let start = 0;
  let end = line.length;
  while (start < end && /\s/.test(line[start]!)) start++;
  while (end > start && /\s/.test(line[end - 1]!)) end--;
  if (end - start < 2 || line[start] !== '(' || line[end - 1] !== ')') return null;
  let depth = 0;
  for (let k = start; k < end; k++) {
    if (line[k] === '(') depth++;
    else if (line[k] === ')') {
      depth--;
      if (depth === 0 && k < end - 1) return null; // 提前闭合 → 非整行括号
    }
  }
  if (depth !== 0) return null; // 括号不平衡
  const innerChars: string[] = [];
  const innerSrc: number[] = [];
  for (let k = start + 1; k < end - 1; k++) {
    innerChars.push(line[k]!);
    innerSrc.push(base + k);
  }
  return { inner: innerChars.join(''), innerSrc };
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

  // 逐行解析（换行符敏感）：
  //  - 普通行 → 主轨(track 0)，依次推进主光标；
  //  - 整行被括号包围 → 新音轨（双手谱的另一只手），与上一条普通行同起点；
  //  - 行内 (...)/[...] = 同时音，仍叠加在本行所属音轨（见 parseNoteLineRelative）。
  // 连续的非参数行属于同一「块」（同段速度/调号），遇参数行或文末时结算为绝对时间。
  const allNotes: DapumeNote[] = [];
  const sections: DapumeSection[] = [];
  let curParam: ScoreParameters = { tonic: DEFAULT_TONIC, bpm: DEFAULT_BPM };
  let curKey = 'C';
  let stTime = 0;

  // 当前块累积（相对拍）
  let blockRel: RelativeNote[] = [];
  let mainBeat = 0; // 主轨拍光标
  let lineStartBeat = 0; // 上一条普通行的起始拍（整行括号行据此对齐）
  let bracketIdx = 0; // 当前普通行之后的整行括号计数 → 决定其音轨号

  function flushBlock(): void {
    if (blockRel.length > 0) {
      const abs = relativeToAbsolute(blockRel, curParam);
      const blockStart = stTime;
      for (const n of abs) {
        n.startTime += stTime;
        allNotes.push(n);
      }
      // 记录该段的调号/速度（用于按时间查询当前 1=? 与 bpm）
      sections.push({ startTime: blockStart, tonic: curParam.tonic, bpm: curParam.bpm, key: curKey });
      // 下一块从「主轨(track 0)最后一个音符的结束」处接续——与原单块顺序解析逐位一致；
      // 行内同时音右对齐、不延长主轨；若本块仅有整行括号（无主轨），退回用整块最后一个音符。
      let lastMain = abs[abs.length - 1]!;
      for (let k = abs.length - 1; k >= 0; k--) {
        if (abs[k]!.trackNo === 0) {
          lastMain = abs[k]!;
          break;
        }
      }
      stTime = lastMain.startTime + lastMain.duration;
    }
    blockRel = [];
    mainBeat = 0;
    lineStartBeat = 0;
    bracketIdx = 0;
  }

  for (let i = 0; i < rawLines.length; i++) {
    if (paramByLine[i]!.changed) {
      flushBlock();
      curParam = { tonic: paramByLine[i]!.tonic, bpm: paramByLine[i]!.bpm };
      curKey = paramByLine[i]!.key;
      continue;
    }
    const line = rawLines[i]!;
    const base = lineStart[i]!;
    const fb = fullBracketLine(line, base);
    if (fb) {
      // 整行括号 → 新音轨，从上一条普通行的起拍开始（不推进主光标）
      bracketIdx += 1;
      const { notes: rel } = parseNoteLineRelative(fb.inner, fb.innerSrc, lineStartBeat);
      for (const n of rel) {
        n.trackNo = bracketIdx;
        blockRel.push(n);
      }
    } else {
      // 普通行 → 主轨；从当前主光标续解析，主光标随旋律推进（行内同时音右对齐、不延长主轨）
      lineStartBeat = mainBeat;
      bracketIdx = 0;
      const src: number[] = [];
      for (let j = 0; j < line.length; j++) src.push(base + j);
      const { notes: rel, endBeat } = parseNoteLineRelative(line, src, mainBeat);
      for (const n of rel) blockRel.push(n);
      mainBeat = endBeat;
    }
  }
  flushBlock();

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
