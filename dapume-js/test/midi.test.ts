/**
 * MIDI 编码测试。
 * 期望的十六进制字节由 dapume-py 通过 mido 实际保存产出，逐字节比对以确保兼容。
 */
import { describe, expect, it } from 'vitest';
import { parse, render, toMidi } from '../src/index';
import { toHex } from './helpers';

describe('MIDI 编码（与 mido 字节级一致）', () => {
  it('简单单轨', () => {
    expect(toHex(render('1=C 120bpm\n1234567'))).toBe(
      '4d546864000000060001000101e0' +
        '4d54726b00000046' +
        '00c00000903c40817a803c4000903e40817a803e4000904040817a80404000904140817a80414000904340817a80434000904540817a80454000904740817a80474000ff2f00',
    );
  });

  it('整拍时值', () => {
    expect(toHex(render('1=C 120bpm\n1-2-3-4-5-6-7-'))).toBe(
      '4d546864000000060001000101e0' +
        '4d54726b00000046' +
        '00c00000903c408374803c4000903e408374803e4000904040837480404000904140837480414000904340837480434000904540837480454000904740837480474000ff2f00',
    );
  });

  it('多轨（两条音轨）', () => {
    expect(toHex(render('1=C 120bpm\n1234(567)'))).toBe(
      '4d546864000000060001000201e0' +
        '4d54726b0000002b00c00000903c40817a803c4000903e40817a803e4000904040817a80404000904140817a80414000ff2f00' +
        '4d54726b0000002300c000817a904340817a80434000904540817a80454000904740817a80474000ff2f00',
    );
  });

  it('含和弦的多轨', () => {
    expect(toHex(render('1=C 120bpm\n[1]1234[5]567'))).toBe(
      '4d546864000000060001000401e0' +
        '4d54726b0000004600c00000903c40817a803c4000903e40817a803e4000904040817a80404000904140817a80414000904340817a80434000904540817a80454000904740817a80474000ff2f00' +
        '4d54726b0000001900c00000903040876880304000903740856e80374000ff2f00' +
        '4d54726b0000001900c00000903440876880344000903b40856e803b4000ff2f00' +
        '4d54726b0000001900c00000903740876880374000903e40856e803e4000ff2f00',
    );
  });
});

describe('MIDI 结构', () => {
  it('头块以 MThd 开头、格式 1、每分音符 480 ticks', () => {
    const bytes = render('1=C\n1234567');
    // "MThd"
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x4d, 0x54, 0x68, 0x64]);
    // 头块长度 6
    expect(Array.from(bytes.slice(4, 8))).toEqual([0, 0, 0, 6]);
    // 格式 1
    expect(Array.from(bytes.slice(8, 10))).toEqual([0, 1]);
    // division 480 = 0x01e0
    expect(Array.from(bytes.slice(12, 14))).toEqual([0x01, 0xe0]);
  });

  it('轨道数与 trackCount 一致', () => {
    const score = parse('1=C 120bpm\n1234(567)');
    const bytes = toMidi(score);
    expect(Array.from(bytes.slice(10, 12))).toEqual([0, score.trackCount]);
  });

  it('每条音轨以 MTrk 开头、以 end_of_track 结尾', () => {
    const bytes = toHex(render('1=C\n1234567'));
    expect(bytes).toContain('4d54726b'); // MTrk
    expect(bytes.endsWith('ff2f00')).toBe(true); // end of track
  });
});
