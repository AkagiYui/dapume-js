/**
 * Cloudflare Pages Functions 共享工具（仅导出辅助函数，无 onRequest* 导出 → 不会成为路由）。
 *
 * 提供：CORS 头、SHA-256、以及「按请求体缓存」的封装。
 * 注意：Workers 的 Cache API（caches.default）默认按 URL 缓存、忽略 POST body，
 * 因此用「请求体哈希」构造一个合成 GET 请求作为缓存键。
 */

/** 允许跨源调用本 API（公开只读接口）。 */
export const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  // 让浏览器能读取到 render 返回的自定义头
  'Access-Control-Expose-Headers': 'X-Note-Count, X-Track-Count, X-Duration-Ms',
};

/** OPTIONS 预检统一响应。 */
export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS });
}

/** SHA-256 → 十六进制。 */
export async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

interface Ctx {
  request: Request;
  waitUntil: (p: Promise<unknown>) => void;
}

/**
 * 读取请求体 → 命中缓存则直接返回；否则用 `compute(body)` 计算响应，
 * 写入缓存（按 body 哈希）后返回。相同请求体直接复用缓存。
 *
 * @param routeKey 缓存键前缀（区分不同端点）。
 * @param compute  根据请求体文本生成响应（需自带 Cache-Control 才会被缓存）。
 */
export async function withBodyCache(
  ctx: Ctx,
  routeKey: string,
  compute: (body: string) => Response | Promise<Response>,
): Promise<Response> {
  const body = await ctx.request.clone().text();
  const hash = await sha256hex(body);
  const cacheKey = new Request(`https://dapume.cache/${routeKey}/${hash}`, { method: 'GET' });
  // Workers 专有：caches.default（DOM 类型里没有，运行时存在）
  const cache = (caches as unknown as { default: Cache }).default;

  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  let res: Response;
  try {
    res = await compute(body);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...CORS },
    });
  }

  if (res.ok && res.headers.get('Cache-Control')) {
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return res;
}
