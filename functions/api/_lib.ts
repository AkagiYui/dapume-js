/**
 * Cloudflare Pages Functions 共享工具（仅导出辅助函数，无 onRequest* 导出 → 不会成为路由）。
 *
 * 提供：同域 CORS 头、SHA-256、以及「按请求体缓存」的封装。
 * 注意：Workers 的 Cache API（caches.default）默认按 URL 缓存、忽略 POST body，
 * 因此用「请求体哈希」构造一个合成 GET 请求作为缓存键。
 */

/**
 * 计算响应的 CORS 头：**仅允许同域请求**。
 * 只有当请求的 Origin 与本部署自身的源完全一致时才回显 Allow-Origin；
 * 跨域请求拿不到放行头，浏览器据此拦截其读取响应。非浏览器客户端（无 Origin）不受影响。
 */
export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  const origin = request.headers.get('Origin');
  // 本函数自身的源：生产为 https://dapu.me，预览为 https://<hash>.<proj>.pages.dev
  let self: string | null = null;
  try {
    self = new URL(request.url).origin;
  } catch {
    self = null;
  }
  if (origin && origin === self) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
    headers['Access-Control-Expose-Headers'] = 'X-Note-Count, X-Track-Count, X-Duration-Ms';
  }
  return headers;
}

/** OPTIONS 预检：同源放行，否则不带放行头（浏览器据此拦截跨域）。 */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

/** SHA-256 → 十六进制。 */
export async function sha256hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 复制响应并补上额外响应头（cache.match 返回的响应头不可直接写，故新建）。 */
function withExtraHeaders(res: Response, extra: Record<string, string>): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

interface Ctx {
  request: Request;
  waitUntil: (p: Promise<unknown>) => void;
}

/**
 * 读取请求体 → 命中缓存则直接返回；否则用 `compute(body)` 计算响应，
 * 写入缓存（按 body 哈希）后返回。相同请求体直接复用缓存。
 *
 * CORS 头在「缓存之外」按请求逐个追加，因此缓存内容与来源无关，
 * 同一份缓存可服务任意同源请求。
 *
 * @param routeKey 缓存键前缀（区分不同端点）。
 * @param compute  根据请求体文本生成响应（需自带 Cache-Control 才会被缓存；勿自带 CORS 头）。
 */
export async function withBodyCache(
  ctx: Ctx,
  routeKey: string,
  compute: (body: string) => Response | Promise<Response>,
): Promise<Response> {
  const cors = corsHeaders(ctx.request);
  const body = await ctx.request.clone().text();
  const hash = await sha256hex(body);
  const cacheKey = new Request(`https://dapume.cache/${routeKey}/${hash}`, { method: 'GET' });
  // caches.default 即 Cloudflare 的边缘缓存（与 CDN 同一套缓存，按 colo 分布）。
  // Pages Functions 运行在 Workers 运行时，生产环境可用；这里直接读写它，而非仅靠 Cache-Control。
  // Cache-Control 的 s-maxage 仅用作该缓存条目的 TTL。（context 上并没有独立的缓存对象。）
  const cache = (caches as unknown as { default: Cache }).default;

  const hit = await cache.match(cacheKey);
  if (hit) return withExtraHeaders(hit, cors);

  let res: Response;
  try {
    res = await compute(body);
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  if (res.ok && res.headers.get('Cache-Control')) {
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
  }
  return withExtraHeaders(res, cors);
}
