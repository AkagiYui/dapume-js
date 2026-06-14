/**
 * 测试辅助函数
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { DapumeScore } from '../src/index';

/** 读取 test/fixtures 下的模板文件。 */
export function loadFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');
}

/** Uint8Array → 十六进制字符串。 */
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/**
 * 将各音轨按 Python 版 `track_notes` 的遍历顺序展平为
 * `[trackNo, pitch, startTime, duration]` 四元组数组，用于与参考数据比对。
 */
export function flattenTracks(score: DapumeScore): number[][] {
  const out: number[][] = [];
  score.tracks.forEach((track, ti) => {
    for (const n of track) out.push([ti, n.pitch, n.startTime, n.duration]);
  });
  return out;
}
