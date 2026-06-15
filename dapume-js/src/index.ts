/**
 * dapume-js —— 打谱么（线性乐谱）解析与渲染库
 *
 * 线性乐谱（dapume）是一种用 ASCII 字符书写简单乐谱的方式，支持简谱记号、
 * 音高/时值修饰、多轨演奏、和弦演奏与参数控制（调号、BPM）。
 *
 * 本库为 dapume-py 的 TypeScript 完美复刻，可在 Node 与浏览器环境运行，
 * 并额外提供「源位置追踪」与「语法分词」以支撑编辑器类应用。
 *
 * 两个核心函数：
 * - {@link parse}：dapume 文本 → 解析好的乐谱对象。
 * - {@link toMidi}：乐谱对象 → MIDI 文件字节（Uint8Array）。
 *
 * @example
 * ```ts
 * import { parse, toMidi } from 'dapume-js';
 *
 * const score = parse(`1=C 120bpm
 * 1234567`);
 *
 * const midiBytes = toMidi(score);
 * // 浏览器中下载：
 * // const blob = new Blob([midiBytes], { type: 'audio/midi' });
 * ```
 *
 * @packageDocumentation
 */

import { parse } from './parser';
import { toMidi } from './midi';
import type { DapumeNote, DapumeScore } from './types';

export { parse, paramsAt } from './parser';
export { toMidi } from './midi';
export { tokenize } from './tokenize';

export type {
  DapumeScore,
  DapumeNote,
  DapumeSection,
  RelativeNote,
  ScoreParameters,
  Token,
  TokenType,
} from './types';

/**
 * 便捷函数：一步将 dapume 文本渲染为 MIDI 字节，等价于 `toMidi(parse(text))`。
 *
 * @param text dapume 语法文本。
 * @returns MIDI 文件的二进制内容。
 */
export function render(text: string): Uint8Array {
  return toMidi(parse(text));
}

/**
 * 返回在给定时刻（毫秒）正在发声的所有音符。常用于播放时高亮当前音符/和弦。
 *
 * @param score 乐谱对象。
 * @param timeMs 当前播放时刻（毫秒）。
 * @returns 此刻 `startTime <= timeMs < startTime + duration` 的音符列表。
 */
export function activeNotesAt(score: DapumeScore, timeMs: number): DapumeNote[] {
  return score.notes.filter((n) => n.startTime <= timeMs && timeMs < n.startTime + n.duration);
}
