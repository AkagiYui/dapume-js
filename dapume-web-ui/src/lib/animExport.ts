/**
 * 多格式动图导出：把一组同尺寸画面（这里是二维码帧）编码为「动图」文件，可选格式。
 *
 * 两种格式都产出**真正的多帧动画**，与导入端 WebCodecs ImageDecoder 的逐帧解码对应，
 * 因而都能完整往返还原长谱（不是只取一帧的静图）：
 *   - GIF ：gifenc。二维码黑白，量化到极少颜色即可，体积小、各浏览器通用。
 *   - WebP：每帧用 canvas 编码为静态 WebP，再手工封装为 RIFF/ANMF 动画容器（动画 WebP）。
 *
 * WebP 依赖浏览器的 webp 编码能力（Chromium/Firefox/Safari17+ 均支持）；若不支持，
 * supportedFormats() 会将其标为不可用，UI 据此禁用，绝不产出坏文件。
 *
 * 注：未提供 AVIF —— 浏览器没有 canvas AVIF 编码，且把 WebCodecs 的 AV1 关键帧封装成
 * 「可被浏览器解码的动画 AVIF（图像序列）」需完整 AV1 序列头解析 + MIAF 封装，浏览器内无
 * 可靠实现（除非引入较重的 WASM 编码器）。如需 AVIF，建议后续以 WASM 方案单独支持。
 */

/** 支持的导出格式。 */
export type AnimFormat = 'gif' | 'webp';

/** 各格式的扩展名与 MIME。顺序即 UI 展示顺序。 */
export const ANIM_FORMATS: { id: AnimFormat; ext: string; mime: string }[] = [
  { id: 'gif', ext: 'gif', mime: 'image/gif' },
  { id: 'webp', ext: 'webp', mime: 'image/webp' },
];

// ---------------------------------------------------------------------------
// 字节写入辅助
// ---------------------------------------------------------------------------

/** 增长式字节缓冲，提供小端整型与 FourCC 写入。 */
class ByteWriter {
  private buf = new Uint8Array(1024);
  private len = 0;

  private ensure(n: number) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
  }

  u8(v: number): this {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
    return this;
  }

  /** 16 位小端。 */
  u16le(v: number): this {
    this.ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    return this;
  }

  /** 24 位小端（WebP 容器多处使用）。 */
  u24le(v: number): this {
    this.ensure(3);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    return this;
  }

  /** 32 位小端（RIFF/WebP 块长度）。 */
  u32le(v: number): this {
    this.ensure(4);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >>> 8) & 0xff;
    this.buf[this.len++] = (v >>> 16) & 0xff;
    this.buf[this.len++] = (v >>> 24) & 0xff;
    return this;
  }

  /** 写入 4 字节 ASCII 标识（FourCC）。 */
  fourcc(s: string): this {
    this.ensure(4);
    for (let i = 0; i < 4; i++) this.buf[this.len++] = s.charCodeAt(i) & 0xff;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.ensure(b.length);
    this.buf.set(b, this.len);
    this.len += b.length;
    return this;
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.len);
  }
}

// ---------------------------------------------------------------------------
// 通用：把 ImageData 画到 canvas，按 MIME 编码为静态图（用于 WebP / 能力探测）
// ---------------------------------------------------------------------------

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** canvas.toBlob 的 Promise 化封装。 */
function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** 把一帧 ImageData 编码为指定 MIME 的静态图字节；若浏览器不支持该编码返回 null。 */
async function encodeStill(frame: ImageData, type: string, quality?: number): Promise<Uint8Array | null> {
  const c = makeCanvas(frame.width, frame.height);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.putImageData(frame, 0, 0);
  const blob = await canvasToBlob(c, type, quality);
  // 浏览器不支持目标格式时会回退到 image/png，类型不符即视为不支持。
  if (!blob || blob.type !== type) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// GIF（gifenc）
// ---------------------------------------------------------------------------

async function encodeGif(frames: ImageData[], delayMs: number): Promise<Uint8Array> {
  // gifenc 无类型声明；此处忽略其隐式 any（仅用到下面三个函数）。
  // @ts-ignore -- gifenc has no bundled types
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const enc = GIFEncoder();
  for (const f of frames) {
    const palette = quantize(f.data, 4);
    const index = applyPalette(f.data, palette);
    enc.writeFrame(index, f.width, f.height, { palette, delay: delayMs });
  }
  enc.finish();
  return enc.bytes();
}

// ---------------------------------------------------------------------------
// 动画 WebP（RIFF/VP8X/ANIM/ANMF）
// ---------------------------------------------------------------------------

/** 取静态 WebP 中的图像子块（VP8 /VP8L/ALPH），拼接为可放入 ANMF 的帧数据。 */
function extractWebpImageChunks(still: Uint8Array): Uint8Array | null {
  if (still.length < 12) return null;
  const dv = new DataView(still.buffer, still.byteOffset, still.byteLength);
  if (String.fromCharCode(still[0], still[1], still[2], still[3]) !== 'RIFF') return null;
  if (String.fromCharCode(still[8], still[9], still[10], still[11]) !== 'WEBP') return null;
  let p = 12;
  const wanted = new Set(['VP8 ', 'VP8L', 'ALPH']);
  const parts: Uint8Array[] = [];
  while (p + 8 <= still.length) {
    const cc = String.fromCharCode(still[p], still[p + 1], still[p + 2], still[p + 3]);
    const size = dv.getUint32(p + 4, true);
    const padded = size + (size & 1); // 块按偶数对齐
    const end = p + 8 + padded;
    if (end > still.length) break;
    if (wanted.has(cc)) parts.push(still.subarray(p, end)); // 含 FourCC+size+负载+pad 的整块
    p = end;
  }
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  const total = parts.reduce((n, b) => n + b.length, 0);
  const merged = new Uint8Array(total);
  let off = 0;
  for (const b of parts) {
    merged.set(b, off);
    off += b.length;
  }
  return merged;
}

/** 写一个 RIFF 子块（小端长度 + 偶数对齐）。 */
function writeRiffChunk(out: ByteWriter, fourcc: string, payload: Uint8Array) {
  out.fourcc(fourcc).u32le(payload.length);
  out.bytes(payload);
  if (payload.length & 1) out.u8(0); // 奇数长度补 1 字节
}

async function encodeWebp(frames: ImageData[], delayMs: number): Promise<Uint8Array> {
  const w = frames[0].width;
  const h = frames[0].height;

  // 逐帧编码为静态 WebP，并抽出图像子块作为各 ANMF 的帧数据。
  const frameChunks: Uint8Array[] = [];
  for (const f of frames) {
    const still = await encodeStill(f, 'image/webp', 0.94);
    if (!still) throw new Error('webp encode unsupported');
    const img = extractWebpImageChunks(still);
    if (!img) throw new Error('webp parse failed');
    frameChunks.push(img);
  }

  const body = new ByteWriter();

  // VP8X：动画标志位 = 0x02；其后 3 保留字节，再画布宽-1、高-1（各 24 位小端）。
  const vp8x = new ByteWriter();
  vp8x.u8(0x02).u8(0).u8(0).u8(0).u24le(w - 1).u24le(h - 1);
  writeRiffChunk(body, 'VP8X', vp8x.finish());

  // ANIM：背景色（BGRA，用白）+ 循环次数（0 = 无限）。
  const anim = new ByteWriter();
  anim.u8(0xff).u8(0xff).u8(0xff).u8(0xff).u16le(0);
  writeRiffChunk(body, 'ANIM', anim.finish());

  // 每帧一个 ANMF：16 字节头（x/2,y/2,w-1,h-1,duration 各 24 位小端 + 1 字节标志）+ 帧图像数据。
  for (const img of frameChunks) {
    const anmf = new ByteWriter();
    anmf
      .u24le(0) // frame x / 2
      .u24le(0) // frame y / 2
      .u24le(w - 1)
      .u24le(h - 1)
      .u24le(delayMs)
      .u8(0x02); // blending: do-not-blend（整帧不透明覆盖），disposal: none
    anmf.bytes(img);
    writeRiffChunk(body, 'ANMF', anmf.finish());
  }

  // 外层 RIFF：'RIFF' <size> 'WEBP' <chunks>，size = 4('WEBP') + body。
  const payload = body.finish();
  const out = new ByteWriter();
  out.fourcc('RIFF').u32le(payload.length + 4).fourcc('WEBP').bytes(payload);
  return out.finish();
}

// ---------------------------------------------------------------------------
// 对外：能力探测 + 统一编码入口
// ---------------------------------------------------------------------------

let cachedSupport: Record<AnimFormat, boolean> | null = null;

/** 探测当前浏览器能产出哪些格式（GIF 恒为 true）。结果缓存。 */
export async function supportedFormats(): Promise<Record<AnimFormat, boolean>> {
  if (cachedSupport) return { ...cachedSupport };

  // WebP：尝试把一个小 canvas 编码为 webp，类型相符即支持。
  let webp = false;
  try {
    webp = (await encodeStill(new ImageData(2, 2), 'image/webp', 0.9)) !== null;
  } catch {
    webp = false;
  }

  cachedSupport = { gif: true, webp };
  return { ...cachedSupport };
}

/** 把若干帧编码为指定格式的动图字节。delayMs 为每帧时延。 */
export async function encodeAnim(
  format: AnimFormat,
  frames: ImageData[],
  delayMs: number,
): Promise<Uint8Array> {
  if (!frames.length) throw new Error('no frames');
  return format === 'gif' ? encodeGif(frames, delayMs) : encodeWebp(frames, delayMs);
}
