import { describe, expect, it } from 'vitest';
import { assemble, buildShareFrames, checksum, parseFrame, PROTOCOL_VERSION } from './qrShare';

/** 模拟「分享 → 逐帧扫描 → 归集还原」的完整往返。 */
function roundTrip(title: string, content: string): { title: string; content: string; total: number } {
  const { frames, total, key } = buildShareFrames(title, content);
  const slices = new Map<number, string>();
  let parsedTitle = '';
  for (const frame of frames) {
    const p = parseFrame(frame);
    expect(p).not.toBeNull();
    if (!p) throw new Error('parseFrame returned null');
    expect(p.key).toBe(key);
    expect(p.total).toBe(total);
    parsedTitle = p.title;
    slices.set(p.index, p.data);
  }
  const asm = assemble(key, total, slices);
  expect(asm).not.toBeNull();
  return { title: parsedTitle, content: asm!.content, total };
}

const byteLen = (s: string) => new TextEncoder().encode(s).length;

describe('checksum', () => {
  it('确定且对内容敏感', () => {
    expect(checksum('1234567')).toBe(checksum('1234567'));
    expect(checksum('1234567')).not.toBe(checksum('1234568'));
    expect(checksum('')).toBe(checksum(''));
  });
});

describe('多帧分享往返', () => {
  it('纯 ASCII 乐谱', () => {
    const content = '120 C\n1234 5671 | 1234 5671 |\n5353 4321 | 5353 4321 |';
    const r = roundTrip('Twinkle', content);
    expect(r.content).toBe(content);
    expect(r.title).toBe('Twinkle');
  });

  it('含中文标题与换行', () => {
    const content = '欢乐颂\n3345 5432 1123 322-\n3345 5432 1123 211-';
    const r = roundTrip('欢乐颂（贝多芬）', content);
    expect(r.content).toBe(content);
    expect(r.title).toBe('欢乐颂（贝多芬）');
  });

  it('长谱切成多帧', () => {
    const content = '1234567 '.repeat(400);
    const r = roundTrip('Long', content);
    expect(r.total).toBeGreaterThan(1);
    expect(r.content).toBe(content);
  });

  it('空内容仍产出一帧', () => {
    const { frames, total } = buildShareFrames('Empty', '');
    expect(total).toBe(1);
    expect(frames).toHaveLength(1);
    const r = roundTrip('Empty', '');
    expect(r.content).toBe('');
    expect(r.title).toBe('Empty');
  });

  it('特殊字符（引号 / 反斜杠 / 制表）无损还原', () => {
    const content = 'a"b\\c\td\ne\rf';
    const r = roundTrip('Special', content);
    expect(r.content).toBe(content);
  });

  it('代理对（emoji）不被切坏', () => {
    const content = '🎵🎶'.repeat(60);
    const r = roundTrip('Emoji', content);
    expect(r.content).toBe(content);
    expect(r.total).toBeGreaterThan(1);
  });

  it('每帧体积受控（便于扫描）', () => {
    const { frames } = buildShareFrames('Twinkle Twinkle Little Star', '1234567 '.repeat(200));
    for (const f of frames) expect(byteLen(f)).toBeLessThanOrEqual(220);
  });
});

describe('parseFrame', () => {
  it('兼容旧版单帧 v1', () => {
    const legacy = JSON.stringify({ v: 1, t: 'Old', c: 'abcXYZ' });
    const p = parseFrame(legacy);
    expect(p).not.toBeNull();
    expect(p!.total).toBe(1);
    expect(p!.index).toBe(0);
    expect(p!.data).toBe('abcXYZ');
    expect(p!.title).toBe('Old');
    expect(p!.key).toBe(checksum('abcXYZ'));
  });

  it('非本协议文本返回 null', () => {
    expect(parseFrame('not json')).toBeNull();
    expect(parseFrame('{}')).toBeNull();
    expect(parseFrame(JSON.stringify({ v: PROTOCOL_VERSION, k: 'x' }))).toBeNull();
    // 序号越界
    expect(parseFrame(JSON.stringify({ v: 2, k: 'x', n: 2, i: 5, d: 'a' }))).toBeNull();
  });
});

describe('assemble', () => {
  it('乱序收集仍能还原', () => {
    const content = '1234567 '.repeat(50);
    const { frames, total, key } = buildShareFrames('R', content);
    const slices = new Map<number, string>();
    // 逆序灌入
    for (let i = frames.length - 1; i >= 0; i--) {
      const p = parseFrame(frames[i])!;
      slices.set(p.index, p.data);
    }
    expect(assemble(key, total, slices)!.content).toBe(content);
  });

  it('缺帧返回 null', () => {
    const { frames, total, key } = buildShareFrames('R', '1234567 '.repeat(50));
    const slices = new Map<number, string>();
    for (let i = 0; i < frames.length - 1; i++) {
      const p = parseFrame(frames[i])!;
      slices.set(p.index, p.data);
    }
    expect(assemble(key, total, slices)).toBeNull();
  });

  it('checksum 不符返回 null', () => {
    const content = '1234567 '.repeat(20);
    const { frames, total } = buildShareFrames('R', content);
    const slices = new Map<number, string>();
    for (const f of frames) {
      const p = parseFrame(f)!;
      slices.set(p.index, p.data);
    }
    expect(assemble('deadbeef', total, slices)).toBeNull();
  });
});
