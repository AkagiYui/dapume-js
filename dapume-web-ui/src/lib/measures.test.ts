import { describe, expect, it } from 'vitest';
import { parse, type DapumeSection } from 'dapume-js';
import { beatAtTime, measureAtBeat, measureAtTime, musicalPositionAtTime, timeAtBeat } from './measures';

const section = (startTime: number, bpm: number, startBeat = 0): DapumeSection => ({
  startTime,
  startBeat,
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
    const sections = [section(0, 120), section(2000, 60, 4)];
    expect(beatAtTime(4000, sections)).toBeCloseTo(6);
    expect(timeAtBeat(8, sections)).toBeCloseTo(6000);
    expect(measureAtTime(5999, sections)).toBe(2);
    expect(measureAtTime(6000, sections)).toBe(3);
  });

  it('空速度段回退到 120bpm', () => {
    expect(beatAtTime(1000, [])).toBeCloseTo(2);
    expect(timeAtBeat(2, [])).toBeCloseTo(1000);
  });

  it('同一乐谱改变 BPM 后，每个音符仍属于同一小节', () => {
    const source = '1234567123456712345671234567';
    const slow = parse(`1=C 61bpm\n${source}`);
    const fast = parse(`1=C 197bpm\n${source}`);
    expect(slow.events.map((event) => measureAtBeat(event.startBeat))).toEqual(
      fast.events.map((event) => measureAtBeat(event.startBeat)),
    );
  });

  it('毫秒截断不会把整数拍边界显示到上一拍', () => {
    const score = parse('1=C 122bpm\n1=1=1=1=1=');
    const secondMeasure = score.events.find((event) => event.startBeat === 4)!;
    expect(secondMeasure.startTime).toBe(1967);
    expect(musicalPositionAtTime(secondMeasure.startTime, score.sections)).toEqual({
      measure: 2,
      beat: 1,
    });
  });
});
