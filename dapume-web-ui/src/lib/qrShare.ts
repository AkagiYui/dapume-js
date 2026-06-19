/**
 * 动态二维码分享协议（v2）。
 *
 * 长谱无法塞进单张二维码，这里把 {title, content} 切分成多帧，每帧编码为一段 JSON：
 *   { v:2, k:checksum, t:title, n:total, i:index, d:slice }
 * 分享端循环播放这组帧；扫描端按 checksum 归集分片，集齐并校验后还原乐谱。
 *
 * - checksum 既是「会话标识」（区分不同乐谱/不同版本，扫到新值即清零重来），
 *   也是「完整性校验」（拼回后比对，错一片就不放行）。
 * - 每帧按 UTF-8 字节预算切分，分片偏小、配合高纠错（EC 'H'）二维码，便于稳定扫描。
 * - 兼容旧版单帧格式 { v:1, t, c }：parseFrame 将其视为「总数 1」的单帧。
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
