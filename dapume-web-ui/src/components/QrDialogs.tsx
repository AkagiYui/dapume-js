/**
 * 通过动态二维码分享 / 导入乐谱（乐谱管理页用）。
 *
 * 分享：把乐谱切分成多帧（见 ~/lib/qrShare），循环播放一组二维码以支持长谱；
 *   进度条以动画填充表示循环位置（不含文字）。
 * 导入：摄像头实时扫描（jsQR）或上传二维码图片，按 checksum 归集分片；
 *   分段线段展示已收集数量，扫到新 checksum 则清零重来，集齐校验通过后导入。
 * qrcode / jsQR 均按需动态导入，不进首屏包。摄像头需安全上下文（https / localhost）。
 */
import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import { parse } from 'dapume-js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Icon } from './Icon';
import { t } from '../i18n';
import { locale } from '../stores/settings';
import { assemble, assembleBin, buildShareFramesV3, parseBinFrame, parseFrame } from '../lib/qrShare';
import { downloadBytes } from '../lib/download';
import { ANIM_FORMATS, encodeAnim, supportedFormats, type AnimFormat } from '../lib/animExport';
import { buildShareCardText, computeShareCardLayout, drawShareCard } from '../lib/shareCard';

/** 循环播放的帧间隔（毫秒）：留足摄像头锁定每帧的时间。导出动图也用作每帧时延。 */
const FRAME_MS = 500;

/** 扫描一帧：返回二维码的文本与原始字节（字节用于二进制 v3，文本用于回退 v1/v2）。 */
async function decodeImageData(data: ImageData): Promise<{ text: string; bytes: Uint8Array } | null> {
  const { default: jsQR } = await import('jsqr');
  const r = jsQR(data.data, data.width, data.height);
  if (!r) return null;
  return { text: r.data, bytes: Uint8Array.from(r.binaryData) };
}

/** 加载 data URL 为 <img>。 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** 把文件名里的非法字符替换为下划线。 */
function safeName(s: string): string {
  return (s || 'score').replace(/[/\\?%*:|"<>]/g, '_').slice(0, 80);
}

/** 分享对话框：把乐谱编码为一组动态二维码循环播放。 */
export function ShareDialog(props: {
  open: boolean;
  title: string;
  content: string;
  /** 乐谱更新时间（毫秒）；用于导出图片上的「更新时间」，缺省则不显示该行。 */
  updatedAt?: number;
  onClose: () => void;
}) {
  // 导出图片信息卡用的轻量统计（音符数 / 时长），随谱面变化重算并缓存。
  const stats = createMemo(() => {
    try {
      const s = parse(props.content);
      return { notes: s.notes.length, durationMs: s.durationMs };
    } catch {
      return { notes: 0, durationMs: 0 };
    }
  });
  const [urls, setUrls] = createSignal<string[]>([]);
  const [idx, setIdx] = createSignal(0);
  const [ready, setReady] = createSignal(false);

  // 生成二维码：谱面变化时重建。先 deflate 压缩并切成二进制多帧（v3），每帧用二维码字节模式编码。
  // 高纠错（H）+ 偏小分片，便于扫描；压缩后长谱帧数大减。qrcode 按需动态导入，不进首屏包。
  createEffect(() => {
    const { open, title, content } = props;
    if (!open) return;
    let cancelled = false;
    onCleanup(() => {
      cancelled = true;
    });
    setReady(false);
    setUrls([]);
    setIdx(0);
    void (async () => {
      const { frames } = await buildShareFramesV3(title, content);
      const { default: QRCode } = await import('qrcode');
      const out: string[] = [];
      for (const frame of frames) {
        // 二进制字节模式：直接编码压缩字节，不裹 JSON、不 base64。
        const url = await QRCode.toDataURL([{ data: frame, mode: 'byte' }], {
          errorCorrectionLevel: 'H',
          margin: 1,
          width: 320,
        });
        if (cancelled) return;
        out.push(url);
      }
      if (cancelled) return;
      setUrls(out);
      setReady(true);
    })().catch(() => {
      /* 生成失败时保持 loading 占位 */
    });
  });

  // 循环推进：仅在多帧时启动定时器。
  createEffect(() => {
    const n = urls().length;
    if (!ready() || n <= 1) return;
    const timer = setInterval(() => setIdx((i) => (i + 1) % n), FRAME_MS);
    onCleanup(() => clearInterval(timer));
  });

  const progress = () => {
    const n = urls().length;
    return n === 0 ? 0 : ((idx() + 1) / n) * 100;
  };
  // 用重复线性渐变在轨道上画出 n 段刻度，隐含「总数量」；不出现任何文字。
  const ticks = () => {
    const n = urls().length;
    if (n <= 1) return undefined;
    const seg = 100 / n;
    return `repeating-linear-gradient(90deg, transparent 0, transparent calc(${seg}% - 1px), var(--border) calc(${seg}% - 1px), var(--border) ${seg}%)`;
  };

  // 导出：把这组二维码编码为动图，可选 GIF / WebP / AVIF（编码器按需动态导入，不进首屏包）。
  // 三者都是多帧动画，导入端用 WebCodecs 逐帧解码即可完整还原长谱；每帧时延沿用 FRAME_MS。
  // GIF 通用；WebP/AVIF 视浏览器编码能力开放，不支持的格式在 UI 上禁用，绝不产出坏文件。
  const [exporting, setExporting] = createSignal(false);
  const [format, setFormat] = createSignal<AnimFormat>('gif');
  const [support, setSupport] = createSignal<Record<AnimFormat, boolean>>({ gif: true, webp: false });

  // 打开对话框时探测可用导出格式（结果模块内缓存）；当前所选若不可用则回落 GIF。
  createEffect(() => {
    if (!props.open) return;
    void supportedFormats().then((s) => {
      setSupport(s);
      if (!s[format()]) setFormat('gif');
    });
  });

  // 把当前这组二维码逐帧画到「信息卡」（标题 + 二维码 + 音符数/时长/更新时间/导出时间）并取出
  // ImageData，供各编码器使用。文字每帧相同、仅二维码不同，复用同一 layout/text 逐帧重绘。
  async function renderFrames(): Promise<ImageData[]> {
    const st = stats();
    const text = buildShareCardText({
      title: props.title,
      notes: st.notes,
      durationMs: st.durationMs,
      updatedAt: props.updatedAt,
      exportedAt: Date.now(),
      locale: locale(),
      labels: {
        notes: t('manager.notes'),
        updated: t('manager.updated'),
        exported: t('manager.exported'),
      },
    });
    const layout = computeShareCardLayout(text.metaRows.length);
    const cv = document.createElement('canvas');
    cv.width = layout.width;
    cv.height = layout.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return [];
    const out: ImageData[] = [];
    for (const url of urls()) {
      const img = await loadImage(url);
      drawShareCard(ctx, img, layout, text);
      out.push(ctx.getImageData(0, 0, layout.width, layout.height));
    }
    return out;
  }

  async function exportAnim() {
    const fmt = format();
    if (!urls().length || exporting() || !support()[fmt]) return;
    setExporting(true);
    try {
      const frames = await renderFrames();
      if (!frames.length) return;
      const bytes = await encodeAnim(fmt, frames, FRAME_MS);
      const meta = ANIM_FORMATS.find((f) => f.id === fmt)!;
      downloadBytes(bytes, `${safeName(props.title)}.${meta.ext}`, meta.mime);
    } catch {
      /* 忽略导出失败 */
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogTitle class="mb-1">{t('manager.shareTitle')}</DialogTitle>
        <p class="mb-4 text-sm text-muted-foreground">{t('manager.shareDesc')}</p>
        <div class="flex justify-center">
          <Show
            when={ready() && urls().length > 0}
            fallback={
              <div class="flex size-[280px] items-center justify-center text-muted-foreground">
                <Icon icon="lucide:loader-circle" class="animate-spin text-2xl" />
              </div>
            }
          >
            <img
              src={urls()[idx()]}
              alt="QR"
              width={280}
              height={280}
              class="size-[280px] rounded-md border bg-white p-2"
            />
          </Show>
        </div>
        {/* 进度条：随帧推进的动画填充叠在 n 段刻度上，隐含总数与当前位置；无文字。 */}
        <Show when={ready() && urls().length > 1}>
          <div
            class="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            style={{ 'background-image': ticks() }}
          >
            <div
              class="h-full rounded-full bg-primary transition-[width] duration-300 ease-linear"
              style={{ width: `${progress()}%` }}
            />
          </div>
        </Show>
        {/* 导出：先选格式（不支持的禁用并提示），再导出当前所选格式的动图。 */}
        <div class="mt-4 flex items-center gap-2">
          <div class="flex flex-1 gap-1 rounded-md border p-1">
            <For each={ANIM_FORMATS}>
              {(f) => (
                <button
                  type="button"
                  disabled={!support()[f.id] || exporting()}
                  onClick={() => setFormat(f.id)}
                  title={support()[f.id] ? undefined : t('manager.exportUnsupported')}
                  class="flex-1 rounded px-2 py-1 text-xs font-medium uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  classList={{
                    'bg-primary text-primary-foreground': format() === f.id,
                    'text-muted-foreground hover:bg-accent': format() !== f.id,
                  }}
                >
                  {f.id}
                </button>
              )}
            </For>
          </div>
          <button
            type="button"
            onClick={() => void exportAnim()}
            disabled={!ready() || urls().length === 0 || exporting() || !support()[format()]}
            class="flex shrink-0 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
          >
            <Icon
              icon={exporting() ? 'lucide:loader-circle' : 'lucide:download'}
              class={exporting() ? 'animate-spin' : undefined}
            />
            {exporting() ? t('manager.exporting') : t('manager.exportAnim')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 导入对话框：摄像头扫描 + 上传图片/动图解码，按 checksum 归集多帧。 */
export function ImportDialog(props: {
  open: boolean;
  onClose: () => void;
  onImported: (title: string, content: string) => void;
}) {
  let video: HTMLVideoElement | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let stream: MediaStream | null = null;
  let raf = 0;
  const [error, setError] = createSignal('');
  const [scanning, setScanning] = createSignal(false);
  // 归集状态：会话标识（含模式前缀，用于「扫到新会话即清零」）、总帧数、已收分片序号（分段展示）。
  // 分片值按会话模式区分：v3 为压缩字节分片（Uint8Array），v1/v2 为文本分片（string）。
  const [sessionKey, setSessionKey] = createSignal('');
  const [total, setTotal] = createSignal(0);
  const [collected, setCollected] = createSignal<Set<number>>(new Set());
  let slices = new Map<number, string | Uint8Array>();
  let mode: 'v2' | 'v3' = 'v3';
  let binKey = 0; // v3 会话 key
  let textKey = ''; // v1/v2 会话 checksum
  let title = '';
  let finishing = false; // 防止集齐后（v3 异步解压期间）重复触发归集

  function resetSession() {
    setSessionKey('');
    setTotal(0);
    setCollected(new Set<number>());
    slices = new Map();
    title = '';
    finishing = false;
    binKey = 0;
    textKey = '';
  }

  function stopCamera() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((tk) => tk.stop());
    stream = null;
    setScanning(false);
  }

  function newSession(sid: string, totalFrames: number, m: 'v2' | 'v3') {
    slices = new Map();
    finishing = false;
    mode = m;
    setSessionKey(sid);
    setTotal(totalFrames);
    setCollected(new Set<number>());
  }

  function addSlice(index: number, data: string | Uint8Array) {
    if (!slices.has(index)) {
      slices.set(index, data);
      setCollected(new Set(slices.keys()));
    }
  }

  /** 集齐则按会话模式归集还原；v3 解压为异步，用 finishing 防重入。 */
  function finishIfComplete() {
    if (finishing || slices.size !== total()) return;
    finishing = true;
    if (mode === 'v3') {
      void assembleBin(binKey, total(), slices as Map<number, Uint8Array>).then((asm) => {
        if (asm) {
          stopCamera();
          props.onImported(asm.title, asm.content);
        } else finishing = false; // 校验/解压失败，继续扫
      });
    } else {
      const asm = assemble(textKey, total(), slices as Map<number, string>);
      if (asm) {
        stopCamera();
        props.onImported(title, asm.content);
      } else finishing = false;
    }
  }

  /** 归集一帧：先试二进制 v3（看魔数），否则回退文本 v1/v2。扫到新会话即清零重来。 */
  function ingest(d: { text: string; bytes: Uint8Array }): 'progress' | 'invalid' {
    const bin = parseBinFrame(d.bytes);
    if (bin) {
      const sid = 'b' + bin.key.toString(16);
      if (sid !== sessionKey()) {
        binKey = bin.key;
        title = '';
        newSession(sid, bin.total, 'v3');
      }
      addSlice(bin.index, bin.payload);
      finishIfComplete();
      return 'progress';
    }
    const f = parseFrame(d.text);
    if (!f) return 'invalid';
    const sid = 'v' + f.key;
    if (sid !== sessionKey()) {
      textKey = f.key;
      title = f.title;
      newSession(sid, f.total, 'v2');
    }
    if (f.title) title = f.title;
    addSlice(f.index, f.data);
    finishIfComplete();
    return 'progress';
  }

  async function loop() {
    if (!stream || !video || !canvas) return;
    if (video.readyState >= 2 && video.videoWidth > 0) {
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, w, h);
        const decoded = await decodeImageData(ctx.getImageData(0, 0, w, h));
        // 集齐后由 finishIfComplete 调 stopCamera 结束扫描（v3 解压为异步），此处不需提前 return。
        if (decoded && ingest(decoded) === 'progress') setError('');
      }
    }
    raf = requestAnimationFrame(() => void loop());
  }

  async function startCamera() {
    setError('');
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setScanning(true);
      void loop();
    } catch {
      setError(t('manager.importCameraError'));
    }
  }

  /** 静态图片解一帧（ImageDecoder 不可用时的回退）。 */
  function decodeStatic(file: File): Promise<void> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          void decodeImageData(ctx.getImageData(0, 0, c.width, c.height)).then((decoded) => {
            setError(!decoded || ingest(decoded) === 'invalid' ? t('manager.importDecodeError') : '');
            URL.revokeObjectURL(img.src);
            resolve();
          });
        } else {
          URL.revokeObjectURL(img.src);
          resolve();
        }
      };
      img.onerror = () => {
        setError(t('manager.importDecodeError'));
        resolve();
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /** 用 WebCodecs ImageDecoder 逐帧解码（支持 gif/webp/avif 动图，也兼容静态图）；不可用时回退单帧。 */
  async function decodeFrames(file: File): Promise<void> {
    const Ctor = (globalThis as { ImageDecoder?: new (init: { data: ArrayBuffer; type: string }) => any })
      .ImageDecoder;
    if (!Ctor) {
      await decodeStatic(file);
      return;
    }
    try {
      const dec = new Ctor({ data: await file.arrayBuffer(), type: file.type || 'image/png' });
      await dec.tracks.ready;
      const count: number = dec.tracks?.selectedTrack?.frameCount ?? 1;
      const c = document.createElement('canvas');
      const ctx = c.getContext('2d', { willReadFrequently: true });
      let any = false;
      for (let i = 0; i < count; i++) {
        const { image } = await dec.decode({ frameIndex: i });
        c.width = image.displayWidth || image.codedWidth || 1;
        c.height = image.displayHeight || image.codedHeight || 1;
        ctx?.drawImage(image, 0, 0);
        image.close?.();
        if (!ctx) continue;
        const decoded = await decodeImageData(ctx.getImageData(0, 0, c.width, c.height));
        // 集齐由 finishIfComplete（异步）处理；这里把每帧都喂进去即可。
        if (decoded && ingest(decoded) !== 'invalid') any = true;
      }
      dec.close?.();
      setError(any ? '' : t('manager.importDecodeError'));
    } catch {
      await decodeStatic(file);
    }
  }

  function onFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setError('');
    void decodeFrames(file);
  }

  // 打开时清零并启动摄像头、关闭/卸载时停止
  createEffect(() => {
    if (props.open) {
      resetSession();
      void startCamera();
    } else stopCamera();
  });
  onCleanup(stopCamera);

  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogTitle class="mb-1">{t('manager.importTitle')}</DialogTitle>
        <p class="mb-3 text-sm text-muted-foreground">{t('manager.importScan')}</p>
        <div class="relative aspect-video overflow-hidden rounded-md border bg-black">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video ref={video} class="h-full w-full object-cover" playsinline muted />
          <Show when={!scanning()}>
            <div class="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <Icon icon="lucide:scan-line" class="text-2xl" />
            </div>
          </Show>
        </div>
        <canvas ref={canvas} class="hidden" />
        {/* 分段线段：每段对应一帧，已收集的点亮，扫到新 checksum 会清零重排。 */}
        <Show when={total() > 0}>
          <div class="mt-3 flex gap-0.5" aria-hidden="true">
            <For each={Array.from({ length: total() })}>
              {(_, i) => (
                <div
                  class="h-1.5 flex-1 rounded-full transition-colors duration-200"
                  classList={{
                    'bg-primary': collected().has(i()),
                    'bg-muted': !collected().has(i()),
                  }}
                />
              )}
            </For>
          </div>
        </Show>
        <Show when={error()}>
          <p class="mt-2 text-sm text-destructive">{error()}</p>
        </Show>
        <label class="mt-3 flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-accent">
          <Icon icon="lucide:image" />
          {t('manager.importUpload')}
          <input type="file" accept="image/*" class="hidden" onChange={onFile} />
        </label>
      </DialogContent>
    </Dialog>
  );
}
