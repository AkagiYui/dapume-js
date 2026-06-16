/**
 * MIDI 文件编码器
 *
 * 生成标准 MIDI 文件（SMF，format 1）：
 * - division = 480 ticks/四分音符（PPQ）。
 * - 第 0 轨为「指挥轨」：写入 4/4 拍号，并按乐谱各段 bpm 写入 set_tempo
 *   （真实速度；多段变速也逐段写入对应 tempo）。
 * - 第 1 轨为单条复音演奏轨：program_change(0) + 全部音符的 note_on/note_off + end_of_track
 *   （独奏钢琴的 MIDI 最佳实践，不按声部分轨；听感与分轨完全一致）。
 * - 音符位置由「音乐时间」换算为 tick：先按生效 bpm 把毫秒折算为拍，再乘 PPQ。
 *   因此小节/拍线对齐、速度准确（不再用「把毫秒直接当作 tick」的近似）。
 */

import { DEFAULT_BPM, DEFAULT_TONIC } from './constants';
import type { DapumeNote, DapumeScore, DapumeSection } from './types';

/** 每四分音符的 tick 数（PPQ）。 */
const TICKS_PER_BEAT = 480;
/** 音符力度（velocity）。 */
const VELOCITY = 64;
/** MIDI 通道。 */
const CHANNEL = 0;

/** 将无符号整数编码为可变长度数值（VLQ）。 */
function writeVarLen(value: number): number[] {
  let v = value < 0 ? 0 : Math.floor(value);
  const bytes: number[] = [v & 0x7f];
  v = Math.floor(v / 128);
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  return bytes;
}

/** 大端 32 位整数。 */
function uint32BE(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

/** 大端 16 位整数。 */
function uint16BE(n: number): number[] {
  return [(n >>> 8) & 0xff, n & 0xff];
}

/** 把 ASCII 字符串转为字节数组。 */
function ascii(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}

/**
 * 把绝对毫秒时间换算为绝对 tick：按各段 bpm 分段累加，支持变速。
 *
 * 段 i 内每毫秒对应的 tick 数 = PPQ / (60000 / bpm_i)；跨段时分别累计。
 */
function msToTicks(tMs: number, sections: DapumeSection[]): number {
  if (tMs <= 0) return 0;
  let ticks = 0;
  for (let i = 0; i < sections.length; i++) {
    const segStart = sections[i]!.startTime;
    if (tMs <= segStart) break;
    const segEnd = i + 1 < sections.length ? sections[i + 1]!.startTime : Infinity;
    const msPerBeat = 60000 / sections[i]!.bpm;
    const segMs = Math.min(tMs, segEnd) - segStart;
    ticks += (segMs / msPerBeat) * TICKS_PER_BEAT;
    if (tMs <= segEnd) break;
  }
  return Math.round(ticks);
}

/** 指挥轨（track 0）：4/4 拍号 + 各段 set_tempo + end_of_track。 */
function encodeConductor(sections: DapumeSection[]): number[] {
  const events: number[] = [];
  // 拍号 4/4：分子 4、分母 2（=2^2=4）、24 MIDI clocks/拍、8 个 32 分音符/四分音符
  events.push(...writeVarLen(0), 0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08);

  let lastTick = 0;
  for (const sec of sections) {
    const tick = msToTicks(sec.startTime, sections);
    const usPerBeat = Math.round(60000000 / sec.bpm); // 每拍微秒数
    events.push(
      ...writeVarLen(Math.max(0, tick - lastTick)),
      0xff, 0x51, 0x03,
      (usPerBeat >> 16) & 0xff, (usPerBeat >> 8) & 0xff, usPerBeat & 0xff,
    );
    lastTick = tick;
  }

  events.push(...writeVarLen(0), 0xff, 0x2f, 0x00); // end_of_track
  return events;
}

/**
 * 单条复音演奏轨：program_change(0) + 全部音符的 note_on/note_off（tick 制）+ end_of_track。
 *
 * MIDI 最佳实践：独奏钢琴用一条复音音轨即可，不必为每个并行声部单开一条 MTrk
 * （所有声部本就同通道、同音色，分轨只是组织形式、听感无区别）。这里把所有音符的
 * on/off 事件按 tick 排序后顺序写入：同 tick 时 note_off 先于 note_on，避免切断刚结束的音。
 */
function encodePerformanceTrack(notes: DapumeNote[], sections: DapumeSection[]): number[] {
  const events: number[] = [];
  events.push(...writeVarLen(0), 0xc0 | CHANNEL, 0x00); // 音色：钢琴（program 0）

  interface Ev {
    tick: number;
    on: boolean;
    pitch: number;
  }
  const evs: Ev[] = [];
  for (const note of notes) {
    const pitch = Math.max(0, Math.min(127, note.pitch)) & 0x7f;
    const startTick = msToTicks(note.startTime, sections);
    // 至少 1 tick，避免零长度音符把 on/off 落在同一 tick 造成排序歧义
    const endTick = Math.max(startTick + 1, msToTicks(note.startTime + note.duration, sections));
    evs.push({ tick: startTick, on: true, pitch }, { tick: endTick, on: false, pitch });
  }
  // 先按 tick；同 tick 时 note_off 先于 note_on；再按音高稳定排序
  evs.sort((a, b) => a.tick - b.tick || (a.on === b.on ? a.pitch - b.pitch : a.on ? 1 : -1));

  let lastTick = 0;
  for (const ev of evs) {
    events.push(
      ...writeVarLen(Math.max(0, ev.tick - lastTick)),
      (ev.on ? 0x90 : 0x80) | CHANNEL,
      ev.pitch,
      VELOCITY,
    );
    lastTick = ev.tick;
  }

  events.push(...writeVarLen(0), 0xff, 0x2f, 0x00); // end_of_track
  return events;
}

/**
 * 将解析好的 dapume 乐谱对象渲染为 MIDI 文件字节。
 *
 * 这是本库对外暴露的第二个核心函数。返回的 {@link Uint8Array} 可由调用方
 * 自行写入文件（Node：`fs.writeFileSync('out.mid', bytes)`；浏览器：用 Blob 下载）。
 *
 * @param score 由 {@link parse} 得到的乐谱对象。
 * @returns MIDI 文件的二进制内容。
 *
 * @example
 * ```ts
 * import { parse, toMidi } from 'dapume-js';
 * const bytes = toMidi(parse('1=C 120bpm\n1234567'));
 * // Node: fs.writeFileSync('out.mid', bytes)
 * ```
 */
export function toMidi(score: DapumeScore): Uint8Array {
  // 至少要有一段速度信息；缺省回退到默认值
  const sections: DapumeSection[] =
    score.sections.length > 0
      ? score.sections
      : [{ startTime: 0, tonic: DEFAULT_TONIC, bpm: DEFAULT_BPM, key: 'C' }];

  // 指挥轨 + 一条复音演奏轨（所有声部合并；听感与多轨一致，但更符合独奏 MIDI 习惯）
  const trackBlocks: number[][] = [
    encodeConductor(sections),
    encodePerformanceTrack(score.notes, sections),
  ];

  const bytes: number[] = [];
  // 头块 MThd：长度 6、格式 1、轨道数、每四分音符 tick 数
  bytes.push(...ascii('MThd'));
  bytes.push(...uint32BE(6));
  bytes.push(...uint16BE(1));
  bytes.push(...uint16BE(trackBlocks.length));
  bytes.push(...uint16BE(TICKS_PER_BEAT));

  // 各音轨块 MTrk
  for (const block of trackBlocks) {
    bytes.push(...ascii('MTrk'));
    bytes.push(...uint32BE(block.length));
    bytes.push(...block);
  }

  return Uint8Array.from(bytes);
}
