/**
 * 模板曲目集成测试。
 *
 * 自 round-23 起，行内括号 `(...)` 与和弦 `[...]` 都作为「同时音」并入同一音轨，多轨只由
 * 「整行被括号包围」产生（见 parser）。这些模板均未使用整行括号，故都收敛为单音轨（trackCount=1）。
 *
 * 本测试不再逐位比对 dapume-py 的音轨编排（该目标已废弃），而是验证：
 * - 音轨数收敛为 1、总音符数不变；
 * - 总时长与各采样音符的 (音高,起始,时长) 与改造前逐一一致（即「听感完全不变」，仅音轨归并）。
 */
import { describe, expect, it } from 'vitest';
import { parse, toMidi } from '../src/index';
import { loadFixture } from './helpers';

interface Ref {
  totalNotes: number;
  durationMs: number;
  /** 采样音符 [音高, 起始ms, 时长ms]——取自改造前的首尾音符，用于校验听感不变。 */
  samples: [number, number, number][];
}

const REFS: Record<string, Ref> = {
  'canon.txt': {
    totalNotes: 1083,
    durationMs: 213655,
    samples: [
      [66, 0, 1463], [64, 1463, 1463], [62, 2926, 1463], [61, 4390, 1463], [59, 5853, 1463],
      [78, 11707, 1463], [50, 184753, 365], [55, 185119, 365], [59, 185485, 365],
      [57, 210729, 2926], [50, 210729, 2926],
    ],
  },
  'orchid_pavilion.txt': {
    totalNotes: 93,
    durationMs: 22332,
    samples: [
      [57, 0, 333], [64, 1000, 1000], [66, 3000, 666], [62, 4000, 1000],
      [51, 13666, 666], [62, 14333, 2666], [67, 17000, 2666], [64, 19666, 2666], [57, 5000, 1333],
    ],
  },
  'tori_no_uta.txt': {
    totalNotes: 184,
    durationMs: 98479,
    samples: [
      [59, 0, 491], [61, 491, 245], [69, 983, 245], [66, 2090, 1598],
      [66, 96267, 245], [64, 96513, 245], [68, 97004, 491], [68, 97496, 983],
    ],
  },
  'flower_dance.txt': {
    totalNotes: 319,
    durationMs: 38400,
    samples: [
      [70, 0, 750], [68, 1200, 600], [73, 1875, 525], [68, 2400, 450],
      [61, 11400, 600], [53, 27000, 300], [46, 27600, 300], [47, 27900, 300], [50, 28200, 600],
    ],
  },
};

describe('模板曲目', () => {
  for (const [name, ref] of Object.entries(REFS)) {
    describe(name, () => {
      const score = parse(loadFixture(name));
      const audio = new Set(score.notes.map((n) => `${n.pitch}|${n.startTime}|${n.duration}`));

      it('收敛为单音轨、总音符数与总时长不变', () => {
        expect(score.trackCount).toBe(1);
        expect(score.notes).toHaveLength(ref.totalNotes);
        expect(score.durationMs).toBe(ref.durationMs);
      });

      it('采样音符（音高/起始/时长）与改造前完全一致', () => {
        const missing = ref.samples.filter((t) => !audio.has(`${t[0]}|${t[1]}|${t[2]}`));
        expect(missing).toEqual([]);
      });

      it('可生成非空 MIDI（以 MThd 开头）', () => {
        const bytes = toMidi(score);
        expect(bytes.length).toBeGreaterThan(0);
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
      });
    });
  }
});
