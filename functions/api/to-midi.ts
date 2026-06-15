/**
 * POST /api/to-midi
 * 请求体：乐谱对象（DapumeScore，JSON）。
 * 响应：MIDI 文件字节（audio/midi）。相同请求体直接缓存。
 */
import { toMidi } from 'dapume-js';
import type { DapumeScore } from 'dapume-js';
import { CORS, preflight, withBodyCache } from './_lib';

export const onRequestOptions = () => preflight();

export const onRequestPost = (context: { request: Request; waitUntil: (p: Promise<unknown>) => void }) =>
  withBodyCache(context, 'to-midi', (body) => {
    const score = JSON.parse(body) as DapumeScore;
    const bytes = toMidi(score);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'audio/midi',
        'Cache-Control': 'public, s-maxage=86400',
        ...CORS,
      },
    });
  });
