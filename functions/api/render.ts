/**
 * POST /api/render
 * 请求体：dapume 文本（text/plain）。
 * 响应：MIDI 文件字节（audio/midi），并在响应头返回乐谱统计：
 *   X-Note-Count（音符数）、X-Track-Count（音轨数）、X-Duration-Ms（总时长，毫秒）。
 * 相同请求体直接缓存。
 */
import { parse, toMidi } from 'dapume-js';
import { preflight, withBodyCache } from './_lib';

export const onRequestOptions = (context: { request: Request }) => preflight(context.request);

export const onRequestPost = (context: { request: Request; waitUntil: (p: Promise<unknown>) => void }) =>
  withBodyCache(context, 'render', (body) => {
    const score = parse(body);
    const bytes = toMidi(score);
    return new Response(bytes, {
      headers: {
        'Content-Type': 'audio/midi',
        'Cache-Control': 'public, s-maxage=86400',
        'X-Note-Count': String(score.notes.length),
        'X-Track-Count': String(score.trackCount),
        'X-Duration-Ms': String(score.durationMs),
      },
    });
  });
