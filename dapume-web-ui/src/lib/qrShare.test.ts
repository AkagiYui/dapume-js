import { describe, expect, it } from 'vitest';
import {
  assemble,
  assembleBin,
  buildShareFrames,
  buildShareFramesV3,
  checksum,
  parseBinFrame,
  parseFrame,
  PROTOCOL_VERSION,
} from './qrShare';

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

/** v3：压缩 + 二进制分帧的「分享 → 逐帧扫描 → 归集解压」往返。 */
async function roundTripV3(title: string, content: string) {
  const { frames, total, key } = await buildShareFramesV3(title, content);
  const slices = new Map<number, Uint8Array>();
  for (const frame of frames) {
    const p = parseBinFrame(frame);
    expect(p).not.toBeNull();
    if (!p) throw new Error('parseBinFrame returned null');
    expect(p.key).toBe(key);
    expect(p.total).toBe(total);
    slices.set(p.index, p.payload);
  }
  const asm = await assembleBin(key, total, slices);
  expect(asm).not.toBeNull();
  return { title: asm!.title, content: asm!.content, total };
}

describe('v3 二进制 + 压缩往返', () => {
  it('短谱单帧往返（含中文标题）', async () => {
    const content = '1=C 120bpm\n1-2-3-4-5-6-7-1.-';
    const r = await roundTripV3('C 大调音阶', content);
    expect(r.content).toBe(content);
    expect(r.title).toBe('C 大调音阶');
    expect(r.total).toBe(1);
  });

  it('长谱多帧 + Unicode 标题/内容完整还原', async () => {
    // 带递增序号/模运算的内容，熵足够高，压缩后仍需多帧（纯重复内容会被压成单帧）。
    const content =
      Array.from({ length: 500 }, (_, i) => `m${i}:${(i * 37) % 97}/${((i * 13) % 7) + 1}`).join(' ') +
      '【尾巴】♭♯—🎵';
    const r = await roundTripV3('卡农 🎵 Canon', content);
    expect(r.content).toBe(content);
    expect(r.title).toBe('卡农 🎵 Canon');
    expect(r.total).toBeGreaterThan(1);
  });

  it('压缩确实把帧数压下来（vs 未压缩 v2）', async () => {
    const content = '1234567 '.repeat(400);
    const v3 = await buildShareFramesV3('R', content);
    const v2 = buildShareFrames('R', content);
    expect(v3.total).toBeLessThan(v2.total);
  });

  it('乱序归集仍可还原', async () => {
    const content = '5671234 '.repeat(120);
    const { frames, total, key } = await buildShareFramesV3('X', content);
    const slices = new Map<number, Uint8Array>();
    for (const f of [...frames].reverse()) {
      const p = parseBinFrame(f)!;
      slices.set(p.index, p.payload);
    }
    expect((await assembleBin(key, total, slices))!.content).toBe(content);
  });

  it('分片被篡改 → 完整性校验失败返回 null', async () => {
    const { frames, total, key } = await buildShareFramesV3('X', '1234567 '.repeat(80));
    const slices = new Map<number, Uint8Array>();
    for (const f of frames) {
      const p = parseBinFrame(f)!;
      slices.set(p.index, new Uint8Array(p.payload));
    }
    slices.get(0)![0] ^= 0xff; // 篡改首片
    expect(await assembleBin(key, total, slices)).toBeNull();
  });

  it('parseBinFrame 拒绝非本协议', () => {
    expect(parseBinFrame(new TextEncoder().encode('{"v":2}'))).toBeNull(); // 文本 JSON（魔数 ≠ 0xDA）
    expect(parseBinFrame(new Uint8Array([0xda, 0x02, 1, 0, 0, 0, 0, 0]))).toBeNull(); // 版本不符
    expect(parseBinFrame(new Uint8Array([0xda, 0x03, 2, 5, 0, 0, 0, 0]))).toBeNull(); // index ≥ total
    expect(parseBinFrame(new Uint8Array([0xda, 0x03]))).toBeNull(); // 长度不足
  });
});
