import { describe, expect, it } from 'vitest';
import type { DapumeSection } from 'dapume-js';
import { beatAtTime, measureAtTime, timeAtBeat } from './measures';

const section = (startTime: number, bpm: number): DapumeSection => ({
  startTime,
  bpm,
  tonic: 60,
  key: 'C',
});

describe('4/4 小节时间轴', () => {
  it('120bpm 时每小节 2000ms', () => {
    const sections = [section(0, 120)];
    expect(beatAtTime(2000, sections)).toBeCloseTo(4);
    expect(timeAtBeat(4, sections)).toBeCloseTo(2000);
    expect(measureAtTime(1999, sections)).toBe(1);
    expect(measureAtTime(2000, sections)).toBe(2);
  });

  it('中途变速后仍按累计拍数标小节', () => {
    const sections = [section(0, 120), section(2000, 60)];
    expect(beatAtTime(4000, sections)).toBeCloseTo(6);
    expect(timeAtBeat(8, sections)).toBeCloseTo(6000);
    expect(measureAtTime(5999, sections)).toBe(2);
    expect(measureAtTime(6000, sections)).toBe(3);
  });

  it('空速度段回退到 120bpm', () => {
    expect(beatAtTime(1000, [])).toBeCloseTo(2);
    expect(timeAtBeat(2, [])).toBeCloseTo(1000);
  });
});
