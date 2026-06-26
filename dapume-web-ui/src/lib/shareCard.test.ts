import { describe, expect, it } from 'vitest';
import {
  buildShareCardText,
  computeShareCardLayout,
  formatDuration,
  formatShareTime,
} from './shareCard';

const LABELS = { notes: '音符', updated: '更新于', exported: '导出于' };
// 固定为年中时刻，避开时区把年份推到边界。
const TS = Date.UTC(2026, 5, 26, 4, 30, 0);

describe('formatDuration', () => {
  it('毫秒格式化为 m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9000)).toBe('0:09');
    expect(formatDuration(95000)).toBe('1:35');
    expect(formatDuration(605000)).toBe('10:05');
  });
  it('负数与非有限值兜底为 0:00', () => {
    expect(formatDuration(-1000)).toBe('0:00');
    expect(formatDuration(NaN)).toBe('0:00');
    expect(formatDuration(Infinity)).toBe('0:00');
  });
});

describe('formatShareTime', () => {
  it('有效时间戳产出非空本地化串（含年份）', () => {
    expect(formatShareTime(TS, 'zh')).toContain('2026');
    expect(formatShareTime(TS, 'en')).toContain('2026');
  });
  it('非有限值返回空串', () => {
    expect(formatShareTime(NaN, 'zh')).toBe('');
    expect(formatShareTime(Infinity, 'en')).toBe('');
  });
});

describe('buildShareCardText', () => {
  it('统计行为「音符数 标签 · 时长」', () => {
    const text = buildShareCardText({
      title: '小星星',
      notes: 128,
      durationMs: 95000,
      exportedAt: TS,
      locale: 'zh',
      labels: LABELS,
    });
    expect(text.title).toBe('小星星');
    expect(text.stats).toBe('128 音符 · 1:35');
  });
  it('有更新时间则含更新行 + 导出行（共两行，更新在前）', () => {
    const text = buildShareCardText({
      title: 't',
      notes: 1,
      durationMs: 0,
      updatedAt: TS,
      exportedAt: TS,
      locale: 'zh',
      labels: LABELS,
    });
    expect(text.metaRows).toHaveLength(2);
    expect(text.metaRows[0].startsWith('更新于 ')).toBe(true);
    expect(text.metaRows[1].startsWith('导出于 ')).toBe(true);
  });
  it('无更新时间则仅导出行', () => {
    const text = buildShareCardText({
      title: 't',
      notes: 1,
      durationMs: 0,
      exportedAt: TS,
      locale: 'zh',
      labels: LABELS,
    });
    expect(text.metaRows).toHaveLength(1);
    expect(text.metaRows[0].startsWith('导出于 ')).toBe(true);
  });
  it('标题去除首尾空白', () => {
    const text = buildShareCardText({
      title: '  曲名  ',
      notes: 0,
      durationMs: 0,
      exportedAt: TS,
      locale: 'zh',
      labels: LABELS,
    });
    expect(text.title).toBe('曲名');
  });
});

describe('computeShareCardLayout', () => {
  it('二维码槽位保持 300px 且水平居中（静默区不变，扫描行为一致）', () => {
    const l = computeShareCardLayout(2);
    expect(l.qr.size).toBe(300);
    expect(l.qr.x).toBe((l.width - 300) / 2);
    expect(l.qr.x).toBeGreaterThanOrEqual(24);
  });
  it('各元素自上而下严格递增、互不重叠', () => {
    const l = computeShareCardLayout(2);
    expect(l.titleTop).toBeLessThan(l.qr.y);
    expect(l.qr.y + l.qr.size).toBeLessThan(l.statsTop);
    expect(l.statsTop).toBeLessThan(l.dividerY);
    expect(l.dividerY).toBeLessThan(l.metaTops[0]);
    expect(l.metaTops[0]).toBeLessThan(l.metaTops[1]);
    expect(l.metaTops[l.metaTops.length - 1]).toBeLessThan(l.height);
  });
  it('时间行数决定行数组长度与总高度（多一行高一些）', () => {
    const one = computeShareCardLayout(1);
    const two = computeShareCardLayout(2);
    expect(one.metaTops).toHaveLength(1);
    expect(two.metaTops).toHaveLength(2);
    expect(two.height).toBeGreaterThan(one.height);
  });
  it('至少一行（入参为 0 也兜底为 1）', () => {
    expect(computeShareCardLayout(0).metaTops).toHaveLength(1);
  });
});
