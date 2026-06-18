/**
 * 解析器测试：音高、时值、多轨、参数、源位置。
 * 期望值由 dapume-py（Python 原版）实际运行产出，确保「完美复刻」。
 */
import { describe, expect, it } from 'vitest';
import { parse, paramsAt } from '../src/index';
import { flattenTracks } from './helpers';

describe('基础解析', () => {
  it('简单单轨：1234567 在 C 大调 120bpm', () => {
    const score = parse('1=C 120bpm\n1234567');
    expect(score.trackCount).toBe(1);
    expect(score.tracks[0]!.map((n) => n.pitch)).toEqual([60, 62, 64, 65, 67, 69, 71]);
    expect(score.tracks[0]!.map((n) => n.startTime)).toEqual([0, 250, 500, 750, 1000, 1250, 1500]);
    expect(score.tracks[0]!.every((n) => n.duration === 250)).toBe(true);
    expect(score.notes).toHaveLength(7);
    expect(score.durationMs).toBe(1750);
  });

  it('时值后缀：每个音符 1 拍（- 后缀）', () => {
    const score = parse('1=C 120bpm\n1-2-3-4-5-6-7-');
    expect(score.tracks[0]!.every((n) => n.duration === 500)).toBe(true);
    expect(score.tracks[0]!.map((n) => n.startTime)).toEqual([0, 500, 1000, 1500, 2000, 2500, 3000]);
  });

  it('默认参数：未写参数行时为 C 大调 120bpm', () => {
    const score = parse('1234');
    expect(score.tracks[0]!.map((n) => n.pitch)).toEqual([60, 62, 64, 65]);
  });

  it('调号改变音高：1=D', () => {
    const score = parse('1=D\n1');
    expect(score.tracks[0]![0]!.pitch).toBe(62);
  });

  it('各调号主音音高', () => {
    const tonic = (key: string) => parse(`1=${key}\n1`).tracks[0]![0]!.pitch;
    expect(tonic('C')).toBe(60);
    expect(tonic('D')).toBe(62);
    expect(tonic('E')).toBe(64);
    expect(tonic('F')).toBe(65);
    expect(tonic('G')).toBe(67);
    expect(tonic('A')).toBe(69);
    expect(tonic('B')).toBe(71);
  });
});

describe('行内同时音（括号 = 同一音轨）', () => {
  it('1234(567)：括号内是同时音，并入同一音轨、右对齐', () => {
    const score = parse('1=C 120bpm\n1234(567)');
    // 行内括号 = 同时音 → 同一音轨（不再分轨）
    expect(score.trackCount).toBe(1);
    expect(flattenTracks(score)).toEqual([
      [0, 60, 0, 250],
      [0, 62, 250, 250],
      [0, 64, 500, 250],
      [0, 65, 750, 250],
      // (567) 右对齐到 1234 的结束(1000ms)：5@250 6@500 7@750，与 1234 重叠成同时音
      [0, 67, 250, 250],
      [0, 69, 500, 250],
      [0, 71, 750, 250],
    ]);
  });

  it('嵌套括号同样并入同一音轨', () => {
    const score = parse('1=D\n5-345-34(1+(3+(5+)))');
    expect(score.trackCount).toBe(1);
    const pitches = score.tracks[0]!.map((n) => n.pitch);
    // 旋律音
    expect(pitches).toEqual(expect.arrayContaining([69, 66, 67]));
    // 括号内低音 1/3/5 = 62/66/69 也在同一音轨；1+ 持续 4 拍(2000ms)
    expect(pitches).toContain(62);
    expect(score.notes.some((n) => n.pitch === 62 && n.startTime === 0 && n.duration === 2000)).toBe(true);
  });
});

describe('多轨谱（整行括号 = 新音轨）', () => {
  it('双手谱：整行被括号包围的行作为与上一行同起点的新音轨', () => {
    const score = parse('1=C 120bpm\n1111111\n(2222222)\n3333333\n(4444444)');
    expect(score.trackCount).toBe(2);
    // 主轨：1111111(C) 接 3333333(E)，顺序推进
    expect(score.tracks[0]!.map((n) => n.pitch)).toEqual([60, 60, 60, 60, 60, 60, 60, 64, 64, 64, 64, 64, 64, 64]);
    // 第二轨：2222222(D) 与第一行同起点(0)，4444444(F) 与第三行同起点(1750)
    expect(score.tracks[1]!.map((n) => n.pitch)).toEqual([62, 62, 62, 62, 62, 62, 62, 65, 65, 65, 65, 65, 65, 65]);
    expect(score.tracks[1]![0]!.startTime).toBe(0);
    expect(score.tracks[1]![7]!.startTime).toBe(1750);
  });

  it('区分行内括号(同时音)与整行括号(新音轨)', () => {
    expect(parse('1=C\n11(22)').trackCount).toBe(1); // 同一行 → 同时音、同轨
    expect(parse('1=C\n11\n(22)').trackCount).toBe(2); // 整行括号 → 新音轨
  });
});

describe('多段（参数行切换）', () => {
  it('两段不同调号时间累加', () => {
    const score = parse('1=C\n123\n1=D\n456');
    expect(score.trackCount).toBe(1);
    expect(flattenTracks(score)).toEqual([
      [0, 60, 0, 250],
      [0, 62, 250, 250],
      [0, 64, 500, 250],
      [0, 67, 750, 250],
      [0, 69, 1000, 250],
      [0, 71, 1250, 250],
    ]);
  });
});

describe('休止符', () => {
  it('0 占位但不发声（被过滤）', () => {
    const withRest = parse('1=C\n10203');
    // 仅 1、2、3 三个音符；0 被过滤，但仍占用时间
    expect(withRest.notes.map((n) => n.pitch)).toEqual([60, 62, 64]);
    expect(withRest.notes.map((n) => n.startTime)).toEqual([0, 500, 1000]);
  });
});

describe('源位置追踪', () => {
  it('记录触发音符的字符范围（含修饰符）', () => {
    const score = parse('1=C\n5-');
    // 行 1 起始偏移 = len("1=C") + 1 = 4
    const note = score.tracks[0]![0]!;
    expect(note.srcStart).toBe(4); // '5'
    expect(note.srcEnd).toBe(6); // 覆盖 '5' 与 '-'
  });

  it('简谱每个数字对应一个字符位置', () => {
    const score = parse('1=C 120bpm\n1234567');
    // 行 1 起始偏移 = len("1=C 120bpm") + 1 = 11
    const first = score.notes[0]!;
    expect(first.srcStart).toBe(11);
    expect(first.srcEnd).toBe(12);
  });
});

describe('参数段（sections / paramsAt）', () => {
  it('记录每段的调号与速度及其起始时刻', () => {
    const score = parse('1=C\n123\n1=D\n456');
    expect(score.sections).toEqual([
      { startTime: 0, tonic: 60, bpm: 120, key: 'C' },
      { startTime: 750, tonic: 62, bpm: 120, key: 'D' },
    ]);
  });

  it('paramsAt 按时间返回生效的调号/速度', () => {
    const score = parse('1=C\n123\n1=D\n456');
    expect(paramsAt(score, 0).key).toBe('C');
    expect(paramsAt(score, 700).key).toBe('C');
    expect(paramsAt(score, 800).key).toBe('D');
  });

  it('带 bpm 与默认值', () => {
    const score = parse('1=G 100bpm\n1');
    expect(paramsAt(score, 0)).toMatchObject({ key: 'G', bpm: 100, tonic: 67 });
    // 空乐谱返回默认 C / 120
    expect(paramsAt(parse(''), 0)).toMatchObject({ key: 'C', bpm: 120 });
  });
});

describe('健壮性', () => {
  it('空字符串不抛异常', () => {
    const score = parse('');
    expect(score.notes).toEqual([]);
    expect(score.trackCount).toBe(0);
    expect(score.durationMs).toBe(0);
  });

  it('仅参数行不抛异常', () => {
    expect(() => parse('1=C 120bpm')).not.toThrow();
  });

  it('包含非法字符时忽略之', () => {
    const score = parse('1=C\n12xy34');
    expect(score.notes.map((n) => n.pitch)).toEqual([60, 62, 64, 65]);
  });
});
