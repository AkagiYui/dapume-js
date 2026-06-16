/**
 * 通过二维码分享 / 导入乐谱（乐谱管理页用）。
 *
 * 分享：把 {title, content} 编码为 JSON，用 qrcode 生成二维码图片。
 * 导入：摄像头实时扫描（jsQR）或上传二维码图片解码，得到乐谱后回调创建。
 * qrcode / jsQR 均按需动态导入，不进首屏包。摄像头需安全上下文（https / localhost）。
 */
import { Show, createEffect, createSignal, onCleanup } from 'solid-js';
import { Dialog, DialogContent, DialogTitle } from '~/components/ui/dialog';
import { Icon } from '~/components/Icon';
import { t } from '~/i18n';

/** 二维码载荷编码：{ v:1, t:title, c:content }。 */
function encodeScore(title: string, content: string): string {
  return JSON.stringify({ v: 1, t: title, c: content });
}
/** 解析扫描到的文本；非本应用格式返回 null。 */
export function decodeScore(text: string): { title: string; content: string } | null {
  try {
    const o = JSON.parse(text) as { t?: unknown; c?: unknown };
    if (o && typeof o.c === 'string') {
      return { title: typeof o.t === 'string' ? o.t : '', content: o.c };
    }
  } catch {
    /* 非本应用的二维码 */
  }
  return null;
}

async function decodeImageData(data: ImageData): Promise<string | null> {
  const { default: jsQR } = await import('jsqr');
  return jsQR(data.data, data.width, data.height)?.data ?? null;
}

/** 分享对话框：展示乐谱二维码。 */
export function ShareDialog(props: {
  open: boolean;
  title: string;
  content: string;
  onClose: () => void;
}) {
  const [dataUrl, setDataUrl] = createSignal('');
  const [tooLarge, setTooLarge] = createSignal(false);
  createEffect(() => {
    if (!props.open) return;
    setDataUrl('');
    setTooLarge(false);
    const payload = encodeScore(props.title, props.content);
    void import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(payload, { errorCorrectionLevel: 'L', margin: 1, width: 280 }),
      )
      .then(setDataUrl)
      .catch(() => setTooLarge(true));
  });
  return (
    <Dialog open={props.open} onOpenChange={(o) => !o && props.onClose()}>
      <DialogContent>
        <DialogTitle class="mb-1">{t('manager.shareTitle')}</DialogTitle>
        <p class="mb-4 text-sm text-muted-foreground">{t('manager.shareDesc')}</p>
        <Show
          when={!tooLarge()}
          fallback={
            <p class="py-10 text-center text-sm text-destructive">{t('manager.qrTooLarge')}</p>
          }
        >
          <div class="flex justify-center">
            <Show
              when={dataUrl()}
              fallback={
                <div class="flex size-[280px] items-center justify-center text-muted-foreground">
                  <Icon icon="lucide:loader-circle" class="animate-spin text-2xl" />
                </div>
              }
            >
              <img
                src={dataUrl()}
                alt="QR"
                width={280}
                height={280}
                class="rounded-md border bg-white p-2"
              />
            </Show>
          </div>
        </Show>
      </DialogContent>
    </Dialog>
  );
}

/** 导入对话框：摄像头扫描 + 上传图片解码。 */
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

  function stopCamera() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    stream?.getTracks().forEach((tk) => tk.stop());
    stream = null;
    setScanning(false);
  }

  function handleDecoded(text: string) {
    const r = decodeScore(text);
    if (r) {
      stopCamera();
      props.onImported(r.title, r.content);
    } else {
      setError(t('manager.importDecodeError'));
    }
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
        if (text && decodeScore(text)) {
          handleDecoded(text);
          return;
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
          if (text) handleDecoded(text);
          else setError(t('manager.importDecodeError'));
        });
      }
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setError(t('manager.importDecodeError'));
    img.src = URL.createObjectURL(file);
  }

  // 打开时启动摄像头、关闭/卸载时停止
  createEffect(() => {
    if (props.open) void startCamera();
    else stopCamera();
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
