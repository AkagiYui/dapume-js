/**
 * POST /api/parse
 * 请求体：dapume 文本（text/plain）。
 * 响应：解析后的乐谱对象（JSON）。相同请求体直接缓存。
 */
import { parse } from 'dapume-js';
import { preflight, withBodyCache } from './_lib';

export const onRequestOptions = (context: { request: Request }) => preflight(context.request);

export const onRequestPost = (context: { request: Request; waitUntil: (p: Promise<unknown>) => void }) =>
  withBodyCache(context, 'parse', (body) =>
    Response.json(parse(body), {
      headers: { 'Cache-Control': 'public, s-maxage=86400' },
    }),
  );
