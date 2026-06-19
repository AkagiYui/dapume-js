/**
 * 通过动态二维码分享 / 导入乐谱（乐谱管理页用）。
 *
 * 分享：把乐谱切分成多帧（见 ~/lib/qrShare），循环播放一组二维码以支持长谱；
 *   进度条以动画填充表示循环位置（不含文字）。
 * 导入：摄像头实时扫描（jsQR）或上传二维码图片，按 checksum 归集分片；
 *   分段线段展示已收集数量，扫到新 checksum 则清零重来，集齐校验通过后导入。
 * qrcode / jsQR 均按需动态导入，不进首屏包。摄像头需安全上下文（https / localhost）。
 */
import { For, Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import { Icon } from './Icon';
import { t } from '../i18n';
import { assemble, buildShareFrames, parseFrame } from '../lib/qrShare';

/** 循环播放的帧间隔（毫秒）：留足摄像头锁定每帧的时间。 */
const FRAME_MS = 500;

async function decodeImageData(data: ImageData): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  return jsQR(data.data, data.width, data.height)?.data ?? null;
}

/** 分享对话框：把乐谱编码为一组动态二维码循环播放。 */
export function ShareDialog(props: {
  open: boolean;
  title: string;
  content: string;
  onClose: () => void;
}) {
  const [urls, setUrls] = createSignal<string[]>([]);
  const [idx, setIdx] = createSignal(0);
  const [ready, setReady] = createSignal(false);

  // 生成二维码：谱面变化时重建（按需动态导入 qrcode）。高纠错（H）+ 偏小分片，便于扫描。
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
    const { frames } = buildShareFrames(title, content);
    void import('qrcode')
      .then(async ({ default: QRCode }) => {
        const out: string[] = [];
        for (const frame of frames) {
          const url = await QRCode.toDataURL(frame, {
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
      })
      .catch(() => {
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
      </DialogContent>
    </Dialog>
  );
}

/** 导入对话框：摄像头扫描 + 上传图片解码，按 checksum 归集多帧。 */
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
  // 归集状态：当前会话 checksum、总帧数、已收分片序号（用于分段展示）。
  const [sessionKey, setSessionKey] = createSignal('');
  const [total, setTotal] = createSignal(0);
  const [collected, setCollected] = createSignal<Set<number>>(new Set());
  let slices = new Map<number, string>();
  let title = '';

  function resetSession() {
    setSessionKey('');
    setTotal(0);
    setCollected(new Set<number>());
    slices = new Map();
    title = '';
  }

  function stopCamera() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((tk) => tk.stop());
    stream = null;
    setScanning(false);
  }

  /** 归集一帧；扫到新 checksum 清零重来，集齐并校验通过则导入。 */
  function ingest(text: string): 'done' | 'progress' | 'invalid' {
    const f = parseFrame(text);
    if (!f) return 'invalid';
    if (f.key !== sessionKey()) {
      slices = new Map();
      setSessionKey(f.key);
      setTotal(f.total);
      title = f.title;
    }
    if (f.title) title = f.title;
    if (!slices.has(f.index)) {
      slices.set(f.index, f.data);
      setCollected(new Set(slices.keys()));
    }
    if (slices.size === f.total) {
      const asm = assemble(f.key, f.total, slices);
      if (asm) {
        stopCamera();
        props.onImported(title, asm.content);
        return 'done';
      }
    }
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
        const text = await decodeImageData(ctx.getImageData(0, 0, w, h));
        if (text) {
          const r = ingest(text);
          if (r === 'progress') setError('');
          if (r === 'done') return; // 完成则停止扫描
        }
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

  function onFile(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    setError('');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        void decodeImageData(ctx.getImageData(0, 0, c.width, c.height)).then((text) => {
          if (!text || ingest(text) === 'invalid') setError(t('manager.importDecodeError'));
          else setError('');
        });
      }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setError(t('manager.importDecodeError'));
    img.src = URL.createObjectURL(file);
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
