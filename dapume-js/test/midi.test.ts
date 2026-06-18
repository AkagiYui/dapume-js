/**
 * MIDI 编码测试。
 *
 * 不再与 dapume-py 做字节级比对：现在写入真实 tempo 与「音乐时间」tick。
 * 这里就地解析生成的 SMF，验证结构、tempo 与按拍对齐的 tick 时值。
 */
import { describe, expect, it } from 'vitest';
import { parse, render, toMidi } from '../src/index';

// ── 一个最小 SMF 解析器（仅供测试；本库的编码器总是写出完整状态字节，无 running status）──
interface MEvent {
  delta: number;
  type: string;
  data: number[];
}
interface MFile {
  format: number;
  ntracks: number;
  division: number;
  tracks: { events: MEvent[] }[];
}

function parseMidi(bytes: Uint8Array): MFile {
  let p = 0;
  const u32 = () =>
    ((bytes[p++]! << 24) | (bytes[p++]! << 16) | (bytes[p++]! << 8) | bytes[p++]!) >>> 0;
  const u16 = () => (bytes[p++]! << 8) | bytes[p++]!;
  const str = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[p++]!);
    return s;
  };
  const vlq = () => {
    let v = 0;
    let b: number;
    do {
      b = bytes[p++]!;
      v = (v << 7) | (b & 0x7f);
    } while (b & 0x80);
    return v;
  };

  expect(str(4)).toBe('MThd');
  const headLen = u32();
  const format = u16();
  const ntracks = u16();
  const division = u16();
  p += headLen - 6;

  const tracks: { events: MEvent[] }[] = [];
  for (let t = 0; t < ntracks; t++) {
    expect(str(4)).toBe('MTrk');
    const len = u32(); // 先求长度（u32 会推进 p），再计算 end，避免求值顺序坑
    const end = p + len;
    const events: MEvent[] = [];
    while (p < end) {
      const delta = vlq();
      const status = bytes[p++]!;
      if (status === 0xff) {
        const metaType = bytes[p++]!;
        const len = vlq();
        const data = Array.from(bytes.slice(p, p + len));
        p += len;
        events.push({ delta, type: `meta:${metaType.toString(16)}`, data });
      } else {
        const hi = status & 0xf0;
        const n = hi === 0xc0 || hi === 0xd0 ? 1 : 2;
        const data = [status, ...Array.from(bytes.slice(p, p + n))];
        p += n;
        events.push({ delta, type: `ch:${hi.toString(16)}`, data });
      }
    }
    tracks.push({ events });
  }
  return { format, ntracks, division, tracks };
}

const tempoUs = (ev: MEvent) => (ev.data[0]! << 16) | (ev.data[1]! << 8) | ev.data[2]!;

describe('MIDI 结构', () => {
  it('SMF format 1、division 480、含指挥轨', () => {
    const m = parseMidi(render('1=C 120bpm\n1234567'));
    expect(m.format).toBe(1);
    expect(m.division).toBe(480);
    expect(m.ntracks).toBe(2); // 指挥轨 + 一条音轨
  });

  it('轨道数 = 指挥轨 + score.trackCount', () => {
    const score = parse('1=C 120bpm\n1234(567)');
    const m = parseMidi(toMidi(score));
    expect(m.ntracks).toBe(1 + score.trackCount);
  });

  it('每条轨道以 end_of_track 结尾', () => {
    const m = parseMidi(render('1=C\n1234567'));
    for (const tr of m.tracks) {
      expect(tr.events.at(-1)!.type).toBe('meta:2f');
    }
  });

  it('头块以 MThd 开头', () => {
    const bytes = render('1=C\n1234567');
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
  });
});

describe('MIDI 速度（真实 tempo）', () => {
  it('指挥轨写入 4/4 拍号与正确 set_tempo（120bpm → 500000）', () => {
    const cond = parseMidi(render('1=C 120bpm\n1234567')).tracks[0]!;
    const timeSig = cond.events.find((e) => e.type === 'meta:58');
    expect(timeSig?.data.slice(0, 2)).toEqual([4, 2]); // 4/4
    const tempo = cond.events.find((e) => e.type === 'meta:51');
    expect(tempo).toBeDefined();
    expect(tempoUs(tempo!)).toBe(500000);
  });

  it('90bpm → 666667 us/beat', () => {
    const cond = parseMidi(render('1=C 90bpm\n1234567')).tracks[0]!;
    const tempo = cond.events.find((e) => e.type === 'meta:51')!;
    expect(tempoUs(tempo)).toBe(Math.round(60000000 / 90));
  });

  it('变速：逐段写入多个 set_tempo', () => {
    const cond = parseMidi(render('1=C 120bpm\n1234567\n1=G 90bpm\n5671234')).tracks[0]!;
    const tempos = cond.events.filter((e) => e.type === 'meta:51');
    expect(tempos.length).toBe(2);
    expect(tempoUs(tempos[0]!)).toBe(500000);
    expect(tempoUs(tempos[1]!)).toBe(666667);
  });
});

describe('MIDI 时值（音乐时间 tick，按拍对齐）', () => {
  it('120bpm 八分音符 = 240 tick，音高为中央 C', () => {
    const instr = parseMidi(render('1=C 120bpm\n1')).tracks[1]!;
    const noteOn = instr.events.find((e) => e.type === 'ch:90')!;
    const noteOff = instr.events.find((e) => e.type === 'ch:80')!;
    expect(noteOn.data[1]).toBe(60); // 中央 C
    expect(noteOff.delta).toBe(240); // 八分音符 = 半拍 = 240 tick
  });

  it('120bpm 四分音符 = 480 tick', () => {
    const instr = parseMidi(render('1=C 120bpm\n1-')).tracks[1]!;
    const noteOff = instr.events.find((e) => e.type === 'ch:80')!;
    expect(noteOff.delta).toBe(480); // 一拍 = 480 tick
  });
});
