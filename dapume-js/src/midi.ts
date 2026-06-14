/**
 * MIDI 文件编码器
 *
 * 复刻 dapume-py 通过 mido 生成 MIDI 的行为：
 * - 标准 MIDI 文件，格式 1（format 1），每分音符 480 ticks（ticks_per_beat=480）。
 * - 每条音轨：先写 program_change(program=0)，再依次写 note_on/note_off，最后写 end_of_track。
 * - 不写 set_tempo 元事件，沿用 MIDI 默认速度（120 BPM）。
 * - 与 Python 版一致，直接把「毫秒」当作 delta tick 写入（音符的 startTime/duration 已是毫秒）。
 *   由此保证与原项目导出的 MIDI 在播放时序上完全一致。
 *
 * 说明：本实现对每个事件均写出完整的状态字节（不使用 running status）。由于本场景中
 * note_on(0x90) 与 note_off(0x80) 始终交替出现，running status 本就不会触发，
 * 因此输出与 mido 在语义与字节上均等价。
 */

import type { DapumeNote, DapumeScore } from './types';

/** 每分音符的 tick 数（与 mido 默认值一致）。 */
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

/** 生成单条音轨的事件字节（不含 MTrk 头）。 */
function encodeTrack(notes: DapumeNote[]): number[] {
  const events: number[] = [];
  // 音色切换：钢琴（program 0）
  events.push(...writeVarLen(0), 0xc0 | CHANNEL, 0x00);

  let time = 0;
  for (const note of notes) {
    const pitch = Math.max(0, Math.min(127, note.pitch));
    // note_on：delta = 本音符起始 - 上一事件时刻
    events.push(...writeVarLen(note.startTime - time), 0x90 | CHANNEL, pitch & 0x7f, VELOCITY);
    // note_off：delta = 持续时长
    events.push(...writeVarLen(note.duration), 0x80 | CHANNEL, pitch & 0x7f, VELOCITY);
    time = note.startTime + note.duration;
  }

  // end_of_track 元事件
  events.push(...writeVarLen(0), 0xff, 0x2f, 0x00);
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
  const tracks = score.tracks;
  const bytes: number[] = [];

  // 头块 MThd：长度 6、格式 1、轨道数、每分音符 tick 数
  bytes.push(...ascii('MThd'));
  bytes.push(...uint32BE(6));
  bytes.push(...uint16BE(1));
  bytes.push(...uint16BE(tracks.length));
  bytes.push(...uint16BE(TICKS_PER_BEAT));

  // 各音轨块 MTrk
  for (const track of tracks) {
    const trackBytes = encodeTrack(track);
    bytes.push(...ascii('MTrk'));
    bytes.push(...uint32BE(trackBytes.length));
    bytes.push(...trackBytes);
  }

  return Uint8Array.from(bytes);
}
