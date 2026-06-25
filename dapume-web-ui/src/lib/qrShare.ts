/**
 * 动态二维码分享协议。
 *
 * 长谱无法塞进单张二维码，这里把 {title, content} 切分成多帧循环播放，扫描端归集分片后还原。
 *
 * 当前导出用 v3（二进制 + 压缩，见文件下半部 buildShareFramesV3）：先 deflate-raw 压缩
 * {title, content}，再把压缩字节切片放进二维码字节模式，省去 JSON/base64 开销，长谱帧数大减。
 *
 * 兼容解码：
 * - v2 多帧 JSON：{ v:2, k:checksum, t:title, n:total, i:index, d:slice }
 * - v1 旧版单帧 JSON：{ v:1, t, c }
 *   二者仍由 parseFrame / assemble 处理；导入端先试二进制 v3（看魔数），不是再回退文本 v1/v2。
 *
 * 公共要点：key 既是「会话标识」（区分不同乐谱，扫到新值即清零重来），也是「完整性校验」
 * （拼回后比对，错一片不放行）；每帧偏小、配合高纠错（EC 'H'）二维码，便于稳定扫描。
 */

/** 协议版本：2 = 多帧。 */
export const PROTOCOL_VERSION = 2;
/** 每帧 JSON 的目标 UTF-8 字节数（含骨架）；偏小以换取更易扫描的低版本二维码。 */
const TARGET_BYTES = 180;
/** 单帧内容分片的字节下限（标题过长时兜底，保证每帧至少带一点内容）。 */
const MIN_SLICE_BYTES = 16;

export interface ParsedFrame {
  /** 会话标识 / 完整性校验（完整 content 的 checksum）。 */
  key: string;
  title: string;
  /** 分片总数。 */
  total: number;
  /** 本帧分片序号（0 起）。 */
  index: number;
  /** 本帧携带的内容分片。 */
  data: string;
}

/** 单个字符的 UTF-8 字节数。 */
function utf8Len(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x80) return 1;
  if (code < 0x800) return 2;
  if (code < 0x10000) return 3;
  return 4;
}

/** 字符串的 UTF-8 字节长度（按码点遍历，正确处理代理对）。 */
function utf8ByteLength(s: string): number {
  let n = 0;
  for (const ch of s) n += utf8Len(ch);
  return n;
}

/** 字符落入 JSON 字符串后的字节数（计入转义：`"`、`\`、控制字符）。 */
function jsonByteLen(ch: string): number {
  if (ch === '"' || ch === '\\') return 2;
  const code = ch.codePointAt(0) ?? 0;
  // \b \t \n \f \r 转义为 2 字节，其余控制字符转义为 \u00XX（6 字节）。
  if (code === 0x08 || code === 0x09 || code === 0x0a || code === 0x0c || code === 0x0d) return 2;
  if (code < 0x20) return 6;
  return utf8Len(ch);
}

/**
 * cyrb53 字符串哈希 → base36 字符串。
 * 作为会话标识与完整性校验：碰撞概率足够低，长度也短（约 11 字符）。
 */
export function checksum(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(36);
}

/**
 * 按 JSON 编码后的字节预算把内容切分为分片。
 * 按码点遍历，绝不切断代理对；单个字符若超预算则单独成片（不会死循环）。
 */
function sliceContent(content: string, budget: number): string[] {
  const slices: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of content) {
    const b = jsonByteLen(ch);
    if (curBytes + b > budget && cur !== '') {
      slices.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur !== '' || slices.length === 0) slices.push(cur);
  return slices;
}

/**
 * 把 {title, content} 编码为可循环播放的多帧 JSON 字符串数组。
 * 返回帧数组、总帧数与会话 checksum。
 */
export function buildShareFrames(
  title: string,
  content: string,
): { frames: string[]; total: number; key: string } {
  const key = checksum(content);
  // 用最大可能的 n/i 位数估算骨架长度，预算偏保守，确保真实帧不超目标。
  const skeleton = JSON.stringify({ v: PROTOCOL_VERSION, k: key, t: title, n: 99999, i: 99999, d: '' });
  const budget = Math.max(MIN_SLICE_BYTES, TARGET_BYTES - utf8ByteLength(skeleton));
  const slices = sliceContent(content, budget);
  const total = slices.length;
  const frames = slices.map((d, i) =>
    JSON.stringify({ v: PROTOCOL_VERSION, k: key, t: title, n: total, i, d }),
  );
  return { frames, total, key };
}

/** 解析扫描到的单帧文本；非本协议返回 null。兼容旧版单帧 { v:1, t, c }。 */
export function parseFrame(text: string): ParsedFrame | null {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  // v2 多帧
  if (
    o.v === PROTOCOL_VERSION &&
    typeof o.k === 'string' &&
    typeof o.d === 'string' &&
    typeof o.n === 'number' &&
    typeof o.i === 'number' &&
    Number.isInteger(o.n) &&
    Number.isInteger(o.i) &&
    o.n >= 1 &&
    o.i >= 0 &&
    o.i < o.n
  ) {
    return {
      key: o.k,
      title: typeof o.t === 'string' ? o.t : '',
      total: o.n,
      index: o.i,
      data: o.d,
    };
  }
  // v1 旧版单帧：整段内容即一帧。
  if (typeof o.c === 'string') {
    const content = o.c;
    return { key: checksum(content), title: typeof o.t === 'string' ? o.t : '', total: 1, index: 0, data: content };
  }
  return null;
}

/**
 * 归集分片还原内容。集齐 total 片且 checksum 校验通过返回 { content }，否则 null。
 * slices 以「序号 → 分片」存放，可乱序收集（循环播放时本就乱序到达）。
 */
export function assemble(
  key: string,
  total: number,
  slices: Map<number, string>,
): { content: string } | null {
  if (slices.size !== total) return null;
  let content = '';
  for (let i = 0; i < total; i++) {
    const part = slices.get(i);
    if (part === undefined) return null;
    content += part;
  }
  if (checksum(content) !== key) return null;
  return { content };
}

// ===========================================================================
// v3：二进制 + 压缩分享协议
//
// 把 {title, content} 用 deflate-raw 压缩，压缩字节切片后直接进二维码「字节模式」，
// 不再裹 JSON、也不 base64。dapume 是高度重复的数字简谱文本，压缩率常 60~78%，长谱帧数大减。
// 每帧：8 字节头 [magic, ver, total, index, key(4 大端)] + 压缩载荷分片。
// key = 压缩字节的 32 位哈希，兼作会话标识与完整性校验。
// ===========================================================================

/** 二进制协议版本。 */
export const BIN_PROTOCOL_VERSION = 3;
/** 帧头魔数（≠ JSON 起始 '{'=0x7B，便于和 v1/v2 文本帧区分）。 */
const BIN_MAGIC = 0xda;
/** 帧头长度：magic + ver + total + index + key(4)。 */
const BIN_HEADER = 8;
/** 每帧压缩载荷字节上限（含头 ≤ 158B，控制在原 ~180B 以内，保扫描稳定）。 */
const BIN_PAYLOAD = 150;

export interface ParsedBinFrame {
  /** 会话标识 / 完整性校验（压缩字节的 32 位哈希）。 */
  key: number;
  total: number;
  index: number;
  /** 本帧携带的压缩载荷分片。 */
  payload: Uint8Array;
}

/** FNV-1a 32 位哈希。 */
function hash32(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** deflate-raw 压缩（浏览器/Node 内置 CompressionStream）。 */
async function deflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const w = cs.writable.getWriter();
  void w.write(new Uint8Array(input)); // 复制一份得到 ArrayBuffer 后端，满足 BufferSource 类型
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** deflate-raw 解压。 */
async function inflateRaw(input: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const w = ds.writable.getWriter();
  void w.write(new Uint8Array(input));
  void w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}

/** 压缩前打包：[u16 标题字节数][标题 UTF-8][内容 UTF-8]。 */
function packTitleContent(title: string, content: string): Uint8Array {
  const enc = new TextEncoder();
  const t = enc.encode(title);
  const c = enc.encode(content);
  const out = new Uint8Array(2 + t.length + c.length);
  out[0] = (t.length >>> 8) & 0xff;
  out[1] = t.length & 0xff;
  out.set(t, 2);
  out.set(c, 2 + t.length);
  return out;
}

/** 解压后还原 {title, content}。 */
function unpackTitleContent(bytes: Uint8Array): { title: string; content: string } {
  const tlen = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  const dec = new TextDecoder();
  return {
    title: dec.decode(bytes.subarray(2, 2 + tlen)),
    content: dec.decode(bytes.subarray(2 + tlen)),
  };
}

/**
 * 把 {title, content} 压缩后编码为可循环播放的二进制多帧（v3）。
 * 返回帧字节数组、总帧数与会话 key。每帧用二维码字节模式编码。
 */
export async function buildShareFramesV3(
  title: string,
  content: string,
): Promise<{ frames: Uint8Array[]; total: number; key: number }> {
  const comp = await deflateRaw(packTitleContent(title, content));
  const key = hash32(comp);
  const total = Math.max(1, Math.ceil(comp.length / BIN_PAYLOAD));
  if (total > 255) throw new Error('content too large for QR sharing'); // 帧序号/总数为 uint8
  // 均匀切片：每帧载荷为 base 或 base+1 字节（前 rem 帧各多 1 字节），各帧至多差 1 字节。
  // 若按定长 BIN_PAYLOAD 贪心切，末帧只剩 comp.length % BIN_PAYLOAD 字节，会选到更低的二维码
  // 版本，密度/尺寸与其余帧不一致。均分后帧数 total 不变、每帧仍 ≤ BIN_PAYLOAD（因 total =
  // ceil(comp.length / BIN_PAYLOAD)），扫描稳定性与解码逻辑均不受影响。
  const base = Math.floor(comp.length / total);
  const rem = comp.length % total;
  const frames: Uint8Array[] = [];
  let off = 0;
  for (let i = 0; i < total; i++) {
    const sliceLen = base + (i < rem ? 1 : 0);
    const slice = comp.subarray(off, off + sliceLen);
    off += sliceLen;
    const frame = new Uint8Array(BIN_HEADER + slice.length);
    frame[0] = BIN_MAGIC;
    frame[1] = BIN_PROTOCOL_VERSION;
    frame[2] = total;
    frame[3] = i;
    frame[4] = (key >>> 24) & 0xff;
    frame[5] = (key >>> 16) & 0xff;
    frame[6] = (key >>> 8) & 0xff;
    frame[7] = key & 0xff;
    frame.set(slice, BIN_HEADER);
    frames.push(frame);
  }
  return { frames, total, key };
}

/** 解析一帧二进制 v3；非本协议（魔数/版本不符或长度不足）返回 null。 */
export function parseBinFrame(bytes: Uint8Array): ParsedBinFrame | null {
  if (bytes.length < BIN_HEADER) return null;
  if (bytes[0] !== BIN_MAGIC || bytes[1] !== BIN_PROTOCOL_VERSION) return null;
  const total = bytes[2];
  const index = bytes[3];
  if (total < 1 || index >= total) return null;
  const key = ((bytes[4] << 24) | (bytes[5] << 16) | (bytes[6] << 8) | bytes[7]) >>> 0;
  return { key, total, index, payload: bytes.subarray(BIN_HEADER) };
}

/**
 * 归集 v3 分片还原 {title, content}。集齐 total 片、压缩字节哈希与 key 相符且解压成功才返回。
 */
export async function assembleBin(
  key: number,
  total: number,
  slices: Map<number, Uint8Array>,
): Promise<{ title: string; content: string } | null> {
  if (slices.size !== total) return null;
  let len = 0;
  for (let i = 0; i < total; i++) {
    const s = slices.get(i);
    if (!s) return null;
    len += s.length;
  }
  const comp = new Uint8Array(len);
  let off = 0;
  for (let i = 0; i < total; i++) {
    const s = slices.get(i)!;
    comp.set(s, off);
    off += s.length;
  }
  if (hash32(comp) !== key) return null; // 完整性校验
  try {
    return unpackTitleContent(await inflateRaw(comp));
  } catch {
    return null;
  }
}
