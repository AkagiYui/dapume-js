/**
 * 二维码导出图片的「信息卡」：在二维码上方加标题，下方加音符数 / 时长 / 更新时间 / 导出时间。
 *
 * 二维码本身仍画在原尺寸（300px）的方形槽位里、四周留足白边作静默区，像素不变 ——
 * 导入端 jsQR 仍按定位图样在整帧中找码，文字不构成定位图样，故扫描行为不受影响。
 *
 * 布局常量与文本格式化是**纯函数**（不碰 canvas / DOM），可在 node 环境单测；
 * 真正的 canvas 绘制 drawShareCard 仅在浏览器调用。
 */

// ---------------------------------------------------------------------------
// 布局（纯函数，可测）
// ---------------------------------------------------------------------------

/** 引导语里要加粗的站点域名（提示扫码者去这里导入获取乐谱）。 */
export const SITE = 'dapu.me';

/** 二维码槽位边长（沿用导出前的尺寸，保证扫描行为一致）。 */
const QR_SIZE = 300;
/** 卡片宽度：QR 居中后两侧各留 30px 白边（≥ 静默区）。 */
const WIDTH = 360;
/** 内容内边距（分隔线、文字横向不超出此边界）。 */
const PAD = 24;

const TOP = 26; // 顶部留白
const TITLE_BAND = 30; // 标题行高
const TITLE_FONT = 21; // 标题字号（过宽时自适应缩小）
const TITLE_MIN = 14; // 标题最小字号
const GAP_TITLE_QR = 16;
const GAP_QR_CTA = 18;
const CTA_BAND = 22; // 「打开 dapu.me」引导语行高
const CTA_FONT = 15;
const GAP_CTA_STATS = 12;
const STATS_BAND = 20; // 统计行高
const STATS_FONT = 15;
const GAP_STATS_DIV = 14;
const GAP_DIV_META = 16;
const META_BAND = 22; // 时间行高
const META_FONT = 13;
const BOTTOM = 26; // 底部留白

export interface ShareCardLayout {
  width: number;
  height: number;
  pad: number;
  qr: { x: number; y: number; size: number };
  titleTop: number;
  titleFontPx: number;
  titleMinFontPx: number;
  ctaTop: number;
  ctaFontPx: number;
  statsTop: number;
  statsFontPx: number;
  dividerY: number;
  metaTops: number[];
  metaFontPx: number;
}

/**
 * 自上而下排版，返回各元素的顶端坐标与画布尺寸。
 * metaRows 为时间行数（仅导出时间 = 1；含更新时间 = 2），决定底部高度。
 */
export function computeShareCardLayout(metaRows: number): ShareCardLayout {
  const rows = Math.max(1, Math.floor(metaRows));
  let y = TOP;
  const titleTop = y;
  y += TITLE_BAND + GAP_TITLE_QR;
  const qrY = y;
  y += QR_SIZE + GAP_QR_CTA;
  const ctaTop = y;
  y += CTA_BAND + GAP_CTA_STATS;
  const statsTop = y;
  y += STATS_BAND + GAP_STATS_DIV;
  const dividerY = y;
  y += 1 + GAP_DIV_META;
  const metaTops: number[] = [];
  for (let i = 0; i < rows; i++) {
    metaTops.push(y);
    y += META_BAND;
  }
  return {
    width: WIDTH,
    height: y + BOTTOM,
    pad: PAD,
    qr: { x: (WIDTH - QR_SIZE) / 2, y: qrY, size: QR_SIZE },
    titleTop,
    titleFontPx: TITLE_FONT,
    titleMinFontPx: TITLE_MIN,
    ctaTop,
    ctaFontPx: CTA_FONT,
    statsTop,
    statsFontPx: STATS_FONT,
    dividerY,
    metaTops,
    metaFontPx: META_FONT,
  };
}

// ---------------------------------------------------------------------------
// 文本格式化（纯函数，可测）
// ---------------------------------------------------------------------------

/** 毫秒 → m:ss（与乐谱管理页一致）。 */
export function formatDuration(ms: number): string {
  const safe = Number.isFinite(ms) ? ms : 0;
  const s = Math.max(0, Math.floor(safe / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 时间戳 → 本地化日期时间（与管理页 formatDate 一致）。无效时间返回空串。 */
export function formatShareTime(ms: number, loc: string): string {
  if (!Number.isFinite(ms)) return '';
  try {
    return new Date(ms).toLocaleString(loc === 'zh' ? 'zh-CN' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '';
  }
}

export interface ShareCardInput {
  title: string;
  notes: number;
  durationMs: number;
  /** 乐谱更新时间；缺省则不画「更新时间」行。 */
  updatedAt?: number;
  /** 导出时刻。 */
  exportedAt: number;
  locale: string;
  /** 已本地化的标签文案（避免本模块依赖 i18n 单例，保持可测）。 */
  labels: { notes: string; updated: string; exported: string; cta: string };
}

export interface ShareCardText {
  title: string;
  /** 引导语（如「立即打开 dapu.me 获得该乐谱」），画在二维码下方。 */
  cta: string;
  stats: string;
  metaRows: string[];
}

/** 把元数据组装成卡片要画的文本：标题、引导语、统计行、时间行（1~2 行）。 */
export function buildShareCardText(input: ShareCardInput): ShareCardText {
  const stats = `${input.notes} ${input.labels.notes} · ${formatDuration(input.durationMs)}`;
  const metaRows: string[] = [];
  if (typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt)) {
    metaRows.push(`${input.labels.updated} ${formatShareTime(input.updatedAt, input.locale)}`);
  }
  metaRows.push(`${input.labels.exported} ${formatShareTime(input.exportedAt, input.locale)}`);
  return { title: input.title.trim(), cta: input.labels.cta, stats, metaRows };
}

// ---------------------------------------------------------------------------
// canvas 绘制（仅浏览器）
// ---------------------------------------------------------------------------

const FONT_STACK =
  'system-ui, -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

/** 浅色中性配色（与应用设计令牌同色系）；导出图固定浅色，分享出去更通用。 */
const COLORS = {
  bg: '#ffffff',
  title: '#18181b',
  cta: '#18181b', // 引导语里加粗的域名
  ctaMuted: '#52525b', // 引导语其余文字
  stats: '#3f3f46',
  divider: '#e4e4e7',
  meta: '#71717a',
};

/** 把引导语按域名 SITE 拆成「普通 + 加粗域名 + 普通」三段，便于域名加粗。 */
function splitCta(s: string): { text: string; strong: boolean }[] {
  const i = s.indexOf(SITE);
  if (i < 0) return s ? [{ text: s, strong: false }] : [];
  const parts: { text: string; strong: boolean }[] = [];
  if (i > 0) parts.push({ text: s.slice(0, i), strong: false });
  parts.push({ text: SITE, strong: true });
  const rest = s.slice(i + SITE.length);
  if (rest) parts.push({ text: rest, strong: false });
  return parts;
}

/** 居中画一行引导语：域名加粗深色、其余次强；整体过宽则同步缩小字号。 */
function drawCtaLine(
  ctx: CanvasRenderingContext2D,
  cta: string,
  cx: number,
  top: number,
  maxW: number,
  baseFs: number,
): void {
  const parts = splitCta(cta);
  if (!parts.length) return;
  const fontOf = (strong: boolean, fs: number) => `${strong ? 700 : 500} ${fs}px ${FONT_STACK}`;
  const widthAt = (fs: number) => {
    let w = 0;
    for (const p of parts) {
      ctx.font = fontOf(p.strong, fs);
      w += ctx.measureText(p.text).width;
    }
    return w;
  };
  let fs = baseFs;
  while (fs > 11 && widthAt(fs) > maxW) fs -= 1;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let x = cx - widthAt(fs) / 2;
  for (const p of parts) {
    ctx.font = fontOf(p.strong, fs);
    ctx.fillStyle = p.strong ? COLORS.cta : COLORS.ctaMuted;
    ctx.fillText(p.text, x, top);
    x += ctx.measureText(p.text).width;
  }
  ctx.textAlign = prevAlign;
}

/** 二分查找最长可容纳前缀，超宽时以省略号截断。 */
function ellipsize(ctx: CanvasRenderingContext2D, s: string, maxW: number): string {
  const ell = '…';
  if (ctx.measureText(ell).width > maxW) return '';
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(s.slice(0, mid) + ell).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return s.slice(0, lo) + ell;
}

/**
 * 在画布上画一帧信息卡：白底 + 标题（自适应字号）+ 二维码 + 统计 + 分隔线 + 时间行。
 * QR 每帧不同、文字相同，逐帧复用同一 layout/text 重绘即可。
 */
export function drawShareCard(
  ctx: CanvasRenderingContext2D,
  qr: CanvasImageSource,
  layout: ShareCardLayout,
  text: ShareCardText,
): void {
  const { width, height, pad } = layout;
  const cx = width / 2;
  const maxTextW = width - pad * 2;

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // 标题：自适应缩小到一行，仍超宽则省略号截断。
  if (text.title) {
    ctx.fillStyle = COLORS.title;
    let fs = layout.titleFontPx;
    ctx.font = `700 ${fs}px ${FONT_STACK}`;
    while (fs > layout.titleMinFontPx && ctx.measureText(text.title).width > maxTextW) {
      fs -= 1;
      ctx.font = `700 ${fs}px ${FONT_STACK}`;
    }
    const title =
      ctx.measureText(text.title).width > maxTextW ? ellipsize(ctx, text.title, maxTextW) : text.title;
    ctx.fillText(title, cx, layout.titleTop);
  }

  // 二维码（原尺寸槽位，四周白边作静默区）
  ctx.drawImage(qr, layout.qr.x, layout.qr.y, layout.qr.size, layout.qr.size);

  // 引导语：立即打开 dapu.me 获得该乐谱（域名加粗）
  if (text.cta) drawCtaLine(ctx, text.cta, cx, layout.ctaTop, maxTextW, layout.ctaFontPx);

  // 统计行：音符数 · 时长
  ctx.fillStyle = COLORS.stats;
  ctx.font = `600 ${layout.statsFontPx}px ${FONT_STACK}`;
  ctx.fillText(text.stats, cx, layout.statsTop);

  // 分隔线
  ctx.fillStyle = COLORS.divider;
  ctx.fillRect(pad, layout.dividerY, width - pad * 2, 1);

  // 时间行：更新时间 / 导出时间
  ctx.fillStyle = COLORS.meta;
  ctx.font = `400 ${layout.metaFontPx}px ${FONT_STACK}`;
  text.metaRows.forEach((row, i) => {
    const top = layout.metaTops[i];
    if (top !== undefined) ctx.fillText(row, cx, top);
  });
}
