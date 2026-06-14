/**
 * 模板曲目集成测试。
 * trackCount / totalNotes / 首尾音符均与 dapume-py 实际运行产出逐一比对，
 * 这是「完美复刻」最强的端到端验证。
 */
import { describe, expect, it } from 'vitest';
import { parse, toMidi } from '../src/index';
import { flattenTracks, loadFixture } from './helpers';

interface Ref {
  trackCount: number;
  totalNotes: number;
  first10: number[][];
  last5: number[][];
}

const REFS: Record<string, Ref> = {
  'canon.txt': {
    trackCount: 4,
    totalNotes: 1083,
    first10: [
      [0, 66, 0, 1463], [0, 64, 1463, 1463], [0, 62, 2926, 1463], [0, 61, 4390, 1463],
      [0, 59, 5853, 1463], [0, 57, 7317, 1463], [0, 59, 8780, 1463], [0, 61, 10243, 1463],
      [0, 78, 11707, 1463], [0, 76, 13170, 1463],
    ],
    last5: [
      [2, 50, 184753, 365], [2, 55, 185119, 365], [2, 59, 185485, 365],
      [2, 57, 210729, 2926], [3, 50, 210729, 2926],
    ],
  },
  'orchid_pavilion.txt': {
    trackCount: 6,
    totalNotes: 93,
    first10: [
      [0, 57, 0, 333], [0, 59, 333, 333], [0, 62, 666, 333], [0, 64, 1000, 1000],
      [0, 62, 2000, 333], [0, 64, 2333, 333], [0, 62, 2666, 333], [0, 66, 3000, 666],
      [0, 64, 3666, 333], [0, 62, 4000, 1000],
    ],
    last5: [
      [4, 51, 13666, 666], [4, 62, 14333, 2666], [4, 67, 17000, 2666],
      [4, 64, 19666, 2666], [5, 57, 5000, 1333],
    ],
  },
  'tori_no_uta.txt': {
    trackCount: 1,
    totalNotes: 184,
    first10: [
      [0, 59, 0, 491], [0, 61, 491, 245], [0, 62, 737, 245], [0, 69, 983, 245],
      [0, 66, 1229, 491], [0, 66, 1721, 245], [0, 64, 1967, 122], [0, 66, 2090, 1598],
      [0, 64, 3688, 245], [0, 66, 3934, 245],
    ],
    last5: [
      [0, 66, 96267, 245], [0, 64, 96513, 245], [0, 66, 96759, 245],
      [0, 68, 97004, 491], [0, 68, 97496, 983],
    ],
  },
  'flower_dance.txt': {
    trackCount: 4,
    totalNotes: 319,
    first10: [
      [0, 70, 0, 750], [0, 63, 750, 150], [0, 66, 900, 150], [0, 70, 1050, 150],
      [0, 68, 1200, 600], [0, 65, 1800, 37], [0, 68, 1837, 37], [0, 73, 1875, 525],
      [0, 68, 2400, 450], [0, 77, 2850, 150],
    ],
    last5: [
      [3, 61, 11400, 600], [3, 53, 27000, 300], [3, 46, 27600, 300],
      [3, 47, 27900, 300], [3, 50, 28200, 600],
    ],
  },
};

describe('模板曲目', () => {
  for (const [name, ref] of Object.entries(REFS)) {
    describe(name, () => {
      const score = parse(loadFixture(name));
      const flat = flattenTracks(score);

      it('音轨数与总音符数', () => {
        expect(score.trackCount).toBe(ref.trackCount);
        expect(flat).toHaveLength(ref.totalNotes);
      });

      it('前 10 个音符', () => {
        expect(flat.slice(0, 10)).toEqual(ref.first10);
      });

      it('后 5 个音符', () => {
        expect(flat.slice(-5)).toEqual(ref.last5);
      });

      it('可生成非空 MIDI', () => {
        const bytes = toMidi(score);
        expect(bytes.length).toBeGreaterThan(0);
        // 以 MThd 开头
        expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
      });
    });
  }
});
