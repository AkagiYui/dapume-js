/** 示例曲目冒烟测试：确保每个示例都能正常解析并渲染为 MIDI。 */
import { describe, expect, it } from 'vitest';
import { parse, toMidi } from 'dapume-js';
import { EXAMPLES } from './examples';

describe('内置示例', () => {
  for (const ex of EXAMPLES) {
    it(`${ex.id} 可解析并渲染`, () => {
      const score = parse(ex.code);
      expect(score.notes.length).toBeGreaterThan(0);
      expect(score.trackCount).toBeGreaterThan(0);
      const midi = toMidi(score);
      expect(midi.length).toBeGreaterThan(0);
      // MThd 头
      expect(Array.from(midi.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
    });
  }
});
