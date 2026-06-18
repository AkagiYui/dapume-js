/**
 * 和弦解析测试。期望值由 dapume-py 实际运行产出。
 * 单独成行的和弦时值为 0（其持续时间由后续旋律决定），此处只校验音高与音轨编排。
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../src/index';
import { flattenTracks } from './helpers';

/** 解析「C 大调下单个和弦」并返回按音轨展平的音高列表。 */
function chordPitches(name: string): number[] {
  const score = parse(`1=C\n[${name}]`);
  return flattenTracks(score).map((row) => row[1]!);
}

describe('和弦', () => {
  it('伴奏和弦：[1]1234[5]567 与旋律同轨（同时音），自动持续到下一个和弦', () => {
    const score = parse('1=C 120bpm\n[1]1234[5]567');
    // 同时音（和弦）并入同一音轨
    expect(score.trackCount).toBe(1);
    const t0 = score.tracks[0]!;
    const has = (p: number, st: number, d: number) =>
      t0.some((n) => n.pitch === p && n.startTime === st && n.duration === d);
    // 主旋律仍在
    for (const p of [60, 62, 64, 65, 67, 69, 71]) expect(t0.some((n) => n.pitch === p)).toBe(true);
    // [1] = C 大三和弦（低八度）48/52/55，持续 2 拍(1000ms)
    for (const p of [48, 52, 55]) expect(has(p, 0, 1000)).toBe(true);
    // [5] = G 大三和弦 55/59/62，持续 1.5 拍(750ms)，从 1000ms 起
    for (const p of [55, 59, 62]) expect(has(p, 1000, 750)).toBe(true);
  });

  it('一级大三和弦 [1]', () => {
    expect(chordPitches('1')).toEqual([48, 52, 55]);
  });

  it('第二转位 [1/5] = 5(1.)(3.)', () => {
    expect(chordPitches('1/5')).toEqual([60, 64, 55]);
  });

  it('下加 5 的四级和弦 [4/6]', () => {
    expect(chordPitches('4/6')).toEqual([65, 57, 60]);
  });

  it('升四级半减七和弦 [4#m7b5]', () => {
    expect(chordPitches('4#m7b5')).toEqual([54, 57, 60, 64]);
  });

  it('一级加九和弦 [1add9]', () => {
    expect(chordPitches('1add9')).toEqual([48, 52, 55, 62]);
  });

  it('降七级挂四和弦 [7bsus]', () => {
    expect(chordPitches('7bsus')).toEqual([58, 63, 65]);
  });

  it('五级属十一省略三五音 [511omit3omit5]', () => {
    expect(chordPitches('511omit3omit5')).toEqual([55, 65, 69, 72]);
  });

  it('源位置覆盖整个和弦记号', () => {
    const score = parse('1=C\n[4M7]2');
    // 行 1 偏移 4；'[4M7]' 占 [4,9)。和弦与旋律同轨，取首个和弦音校验
    const chordNote = score.tracks[0]!.find((n) => n.isChord)!;
    expect(chordNote.isChord).toBe(true);
    expect(chordNote.srcStart).toBe(4);
    expect(chordNote.srcEnd).toBe(9);
  });
});
