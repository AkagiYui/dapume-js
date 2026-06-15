/**
 * 第二页：工作台。
 *
 * 宽屏布局（无 header）：上下两区，上区再分左右；区块之间可拖动改变大小，且大小持久化。
 * - 左上：dapume 编辑器（CodeMirror），标题栏右端显示乐谱信息（音符 / 音轨 / 时长）。
 * - 右上：操作区（播放控制、开关、导出、示例、速查；设置在模态框中）。
 * - 下方：钢琴卷帘（可拖到完全收起）。
 * 窄屏布局：编辑器为主体；播放控制固定在底部（类似音乐播放器）；
 *   钢琴卷帘放在默认关闭的抽屉中，其余操作放在“更多”抽屉中。
 *
 * 播放时锁定编辑并高亮当前发声的音符字符与所在行；谱面、各开关、各区域尺寸均持久化到 localStorage。
 */
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { activeNotesAt, parse, toMidi } from 'dapume-js';
import type { DapumeScore } from 'dapume-js';

import { CodeEditor } from '~/components/CodeEditor';
import { PianoRoll } from '~/components/PianoRoll';
import { Icon } from '~/components/Icon';
import { SettingsModalButton } from '~/components/SettingsPanel';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '~/components/ui/switch';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '~/components/ui/slider';
import { Resizable, ResizableHandle, ResizablePanel } from '~/components/ui/resizable';
import { BottomDrawer } from '~/components/ui/drawer';

import { DEFAULT_SCORE, EXAMPLES } from '~/data/examples';
import { downloadBytes, downloadText } from '~/lib/download';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import {
  currentTimeMs,
  ensurePiano,
  getPausedAt,
  isPlaying,
  loadProgress,
  pause,
  pianoState,
  play,
  seek,
  stop,
} from '~/stores/player';

/** 安全读写 localStorage。 */
function lsGet(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
function lsSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 忽略 */
  }
}

/** 读取持久化的分栏尺寸（比例数组）。 */
function readSizes(key: string, fallback: number[]): number[] {
  try {
    const v = localStorage.getItem(key);
    if (v) {
      const a = JSON.parse(v);
      if (Array.isArray(a) && a.length === fallback.length && a.every((n) => typeof n === 'number')) {
        return a;
      }
    }
  } catch {
    /* 忽略 */
  }
  return fallback;
}
function writeSizes(key: string, sizes: number[]): void {
  // 仅持久化「有效」尺寸：长度 ≥ 2、均为有限非负数、总和 ≈ 1。
  // corvu 在组件卸载/初始化阶段可能回调空数组或非法值，必须忽略，否则会把已保存的尺寸清空。
  if (!Array.isArray(sizes) || sizes.length < 2) return;
  if (!sizes.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return;
  const sum = sizes.reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 0.05) return;
  try {
    localStorage.setItem(key, JSON.stringify(sizes));
  } catch {
    /* 忽略 */
  }
}

/** 毫秒 → m:ss。 */
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 语法速查表。 */
const CHEAT: { s: string; zh: string; en: string }[] = [
  { s: '1 2 … 7', zh: '音符', en: 'notes' },
  { s: '0', zh: '休止符', en: 'rest' },
  { s: '#  b', zh: '升 / 降半音', en: 'sharp / flat' },
  { s: '.  ,', zh: '升 / 降八度', en: 'octave up / down' },
  { s: '-  ~  =  +', zh: '1 / 1.5 / 2 / 4 拍', en: '1 / 1.5 / 2 / 4 beats' },
  { s: "*  ^  '", zh: '0.5 / 0.25 / 0.125 拍', en: '0.5 / 0.25 / 0.125 beat' },
  { s: '( )', zh: '多轨同时', en: 'multi-track' },
  { s: '[ ]', zh: '和弦', en: 'chord' },
  { s: '1=C', zh: '调号', en: 'key' },
  { s: '120bpm', zh: '速度', en: 'tempo' },
];

const EMPTY_SCORE: DapumeScore = { tracks: [], notes: [], trackCount: 0, durationMs: 0 };

export default function Workbench() {
  const navigate = useNavigate();

  // ===== 持久化状态 =====
  const [scoreText, setScoreText] = createSignal(lsGet('dapume.score', DEFAULT_SCORE));
  createEffect(() => lsSet('dapume.score', scoreText()));

  const [follow, setFollow] = createSignal(lsGet('dapume.follow', 'true') === 'true');
  createEffect(() => lsSet('dapume.follow', String(follow())));

  // 是否在播放时保持当前演奏行可视
  const [keepLine, setKeepLine] = createSignal(lsGet('dapume.keepLine', 'true') === 'true');
  createEffect(() => lsSet('dapume.keepLine', String(keepLine())));

  // ===== 窄屏适配 =====
  const narrowMedia = window.matchMedia('(max-width: 768px)');
  const [isNarrow, setIsNarrow] = createSignal(narrowMedia.matches);
  const onNarrow = () => setIsNarrow(narrowMedia.matches);
  narrowMedia.addEventListener('change', onNarrow);
  onCleanup(() => narrowMedia.removeEventListener('change', onNarrow));

  // 窄屏抽屉开关（钢琴卷帘 / 更多操作）
  const [pianoOpen, setPianoOpen] = createSignal(false);
  const [moreOpen, setMoreOpen] = createSignal(false);

  // ===== 解析与播放 =====
  const score = createMemo<DapumeScore>(() => {
    try {
      return parse(scoreText());
    } catch {
      return EMPTY_SCORE;
    }
  });

  // 谱面变化时复位播放进度（编辑仅在停止态可进行）
  createEffect(on(scoreText, () => stop(), { defer: true }));

  // 进入工作台即预热钢琴音色
  ensurePiano().catch(() => {});
  onCleanup(() => stop());

  // 播放时高亮当前发声音符对应的源字符
  const highlights = createMemo(() => {
    if (!isPlaying()) return [];
    return activeNotesAt(score(), currentTimeMs()).map((n) => ({ from: n.srcStart, to: n.srcEnd }));
  });

  function onPlayPause() {
    if (isPlaying()) {
      pause();
    } else {
      const s = score();
      if (s.notes.length > 0) void play(s.notes, s.durationMs, getPausedAt());
    }
  }

  function onDownloadMidi() {
    downloadBytes(toMidi(score()), 'score.mid', 'audio/midi');
  }
  function onDownloadDpm() {
    downloadText(scoreText(), 'score.dapume', 'text/plain');
  }

  // ===== 可复用片段 =====

  /** 乐谱信息：音符数 / 音轨数 / 时长（显示在编辑器标题栏右端）。 */
  const ScoreStats = () => (
    <div class="flex items-center gap-3 text-xs text-muted-foreground">
      <Show when={isPlaying()}>
        <Icon icon="lucide:lock" class="text-amber-500" title={t('workbench.playingLocked')} />
      </Show>
      <span class="flex items-center gap-1 tabular-nums" title={t('workbench.notes')}>
        <Icon icon="lucide:music" />
        {score().notes.length}
      </span>
      <span class="flex items-center gap-1 tabular-nums" title={t('workbench.tracks')}>
        <Icon icon="lucide:layers" />
        {score().trackCount}
      </span>
      <span class="flex items-center gap-1 tabular-nums" title={t('workbench.duration')}>
        <Icon icon="lucide:clock" />
        {fmt(score().durationMs)}
      </span>
    </div>
  );

  /** 编辑器本体（不含标题栏）。 */
  const EditorBody = () => (
    <CodeEditor
      value={scoreText()}
      onChange={setScoreText}
      readOnly={isPlaying()}
      highlights={highlights()}
      keepVisible={keepLine() && isPlaying()}
      placeholder={'1=C 120bpm\n1234567'}
    />
  );

  /** 进度条（停止/暂停时可拖动）。 */
  const ProgressSlider = (p: { class?: string }) => (
    <Slider
      minValue={0}
      maxValue={Math.max(1, score().durationMs)}
      value={[Math.min(currentTimeMs(), score().durationMs)]}
      onChange={(v) => !isPlaying() && seek(v[0]!)}
      disabled={isPlaying() || score().durationMs === 0}
      class={p.class}
    >
      <SliderTrack>
        <SliderFill />
        <SliderThumb />
      </SliderTrack>
    </Slider>
  );

  /** 播放控制（用于宽屏操作区顶部）。 */
  const PlaybackControls = () => (
    <div class="space-y-3">
      <div class="flex items-center gap-2">
        <Button class="gap-1.5" onClick={onPlayPause} disabled={score().notes.length === 0}>
          <Icon icon={isPlaying() ? 'lucide:pause' : 'lucide:play'} />
          {isPlaying() ? t('workbench.pause') : t('workbench.play')}
        </Button>
        <Button variant="outline" size="icon" onClick={() => stop()} aria-label={t('workbench.stop')}>
          <Icon icon="lucide:square" />
        </Button>
        <div class="ml-auto text-xs tabular-nums text-muted-foreground">
          {fmt(currentTimeMs())} / {fmt(score().durationMs)}
        </div>
      </div>
      <ProgressSlider class="py-1" />
    </div>
  );

  /** 开关：跟随播放 / 保持当前行可视。 */
  const ToggleSwitches = () => (
    <div class="space-y-3">
      <Switch checked={follow()} onChange={setFollow} class="flex items-center justify-between">
        <SwitchLabel class="flex items-center gap-1.5 text-sm">
          <Icon icon="lucide:crosshair" />
          {t('workbench.followPlayback')}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <Switch checked={keepLine()} onChange={setKeepLine} class="flex items-center justify-between">
        <SwitchLabel class="flex items-center gap-1.5 text-sm">
          <Icon icon="lucide:scroll-text" />
          {t('workbench.keepLine')}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
    </div>
  );

  /** 次要操作：开关 + 导出 + 示例 + 速查（播放控制以外的内容）。 */
  const SecondaryControls = () => (
    <div class="space-y-5 p-4">
      <ToggleSwitches />
      <Separator />
      {/* 导出 */}
      <div class="grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          class="gap-1.5"
          onClick={onDownloadMidi}
          disabled={score().notes.length === 0}
        >
          <Icon icon="lucide:file-music" />
          {t('workbench.downloadMidi')}
        </Button>
        <Button variant="outline" class="gap-1.5" onClick={onDownloadDpm}>
          <Icon icon="lucide:file-down" />
          {t('workbench.downloadDpm')}
        </Button>
      </div>
      {/* 示例 */}
      <div class="space-y-2">
        <div class="text-xs font-medium text-muted-foreground">{t('workbench.examples')}</div>
        <div class="flex flex-wrap gap-1.5">
          <For each={EXAMPLES}>
            {(ex) => (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPlaying()}
                onClick={() => setScoreText(ex.code)}
              >
                {ex.title[locale()]}
              </Button>
            )}
          </For>
          <Button variant="ghost" size="sm" disabled={isPlaying()} onClick={() => setScoreText('')}>
            {t('workbench.clear')}
          </Button>
        </div>
      </div>
      <Separator />
      {/* 语法速查 */}
      <div class="space-y-2">
        <div class="text-xs font-medium text-muted-foreground">{t('workbench.quickRef')}</div>
        <div class="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          <For each={CHEAT}>
            {(c) => (
              <div class="flex items-baseline justify-between gap-2">
                <code class="font-mono text-primary">{c.s}</code>
                <span class="text-muted-foreground">{locale() === 'zh' ? c.zh : c.en}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </div>
  );

  /** 钢琴卷帘本体（不含标题栏）。 */
  const PianoRollBody = () => (
    <Show
      when={score().notes.length > 0}
      fallback={
        <div class="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {t('workbench.emptyScore')}
        </div>
      }
    >
      <PianoRoll
        notes={score().notes}
        durationMs={score().durationMs}
        currentTimeMs={currentTimeMs()}
        isPlaying={isPlaying()}
        follow={follow()}
      />
    </Show>
  );

  /** 钢琴卷帘标题栏右侧信息（加载进度 + 操作提示）。 */
  const PianoRollInfo = () => (
    <div class="flex items-center gap-3">
      <Show when={pianoState() === 'loading'}>
        <span class="flex items-center gap-1 text-xs text-muted-foreground">
          <Icon icon="lucide:loader-circle" class="animate-spin" />
          {t('workbench.loadingPiano')} {Math.round(loadProgress() * 100)}%
        </span>
      </Show>
      <span class="text-xs text-muted-foreground">
        {locale() === 'zh' ? '滚轮平移 · Ctrl+滚轮缩放' : 'Wheel: pan · Ctrl+Wheel: zoom'}
      </span>
    </div>
  );

  // ===== 宽屏分区 =====
  const EditorPane = () => (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span class="shrink-0 text-sm font-medium">{t('workbench.editorTitle')}</span>
        <ScoreStats />
      </div>
      <div class="min-h-0 flex-1">
        <EditorBody />
      </div>
    </div>
  );

  const ControlsPane = () => (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b px-3 py-1.5">
        <Button variant="ghost" size="sm" class="gap-1.5" onClick={() => navigate({ to: '/' })}>
          <Icon icon="lucide:arrow-left" />
          {t('nav.guide')}
        </Button>
        <div class="flex items-center gap-2">
          {/* 设置模态框开关：放在“操作”文字左边，仅图标 */}
          <SettingsModalButton />
          <span class="text-sm font-medium">{t('workbench.controlsTitle')}</span>
        </div>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="space-y-5 p-4 pb-0">
          <PlaybackControls />
          <Separator />
        </div>
        <SecondaryControls />
      </div>
    </div>
  );

  const PianoRollPane = () => (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b px-3 py-1.5">
        <span class="text-sm font-medium">{t('workbench.pianoRollTitle')}</span>
        <PianoRollInfo />
      </div>
      <div class="min-h-0 flex-1">
        <PianoRollBody />
      </div>
    </div>
  );

  // ===== 窄屏底部播放条 =====
  const NarrowPlayerBar = () => (
    <div class="flex items-center gap-2 border-t bg-background px-3 py-2">
      <Button
        size="icon"
        class="size-9 shrink-0"
        onClick={onPlayPause}
        disabled={score().notes.length === 0}
        aria-label={isPlaying() ? t('workbench.pause') : t('workbench.play')}
      >
        <Icon icon={isPlaying() ? 'lucide:pause' : 'lucide:play'} />
      </Button>
      <Button
        variant="outline"
        size="icon"
        class="size-9 shrink-0"
        onClick={() => stop()}
        aria-label={t('workbench.stop')}
      >
        <Icon icon="lucide:square" />
      </Button>
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(currentTimeMs())}</span>
      <ProgressSlider class="flex-1" />
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(score().durationMs)}</span>
      <Button
        variant={pianoOpen() ? 'default' : 'outline'}
        size="icon"
        class="size-9 shrink-0"
        onClick={() => setPianoOpen(true)}
        aria-label={t('workbench.pianoRollTitle')}
      >
        <Icon icon="lucide:audio-waveform" />
      </Button>
    </div>
  );

  return (
    <Show
      when={!isNarrow()}
      fallback={
        /* ===== 窄屏：编辑器为主 + 底部播放条 + 抽屉 ===== */
        <div class="flex h-[100dvh] flex-col bg-background">
          {/* 顶栏 */}
          <div class="flex items-center justify-between gap-2 border-b px-2 py-1.5">
            <Button variant="ghost" size="sm" class="gap-1.5" onClick={() => navigate({ to: '/' })}>
              <Icon icon="lucide:arrow-left" />
              {t('nav.guide')}
            </Button>
            <ScoreStats />
            <div class="flex items-center gap-1">
              <SettingsModalButton />
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                onClick={() => setMoreOpen(true)}
                aria-label={t('workbench.controlsTitle')}
              >
                <Icon icon="lucide:sliders-horizontal" />
              </Button>
            </div>
          </div>
          {/* 编辑器 */}
          <div class="min-h-0 flex-1">
            <EditorBody />
          </div>
          {/* 底部播放条 */}
          <NarrowPlayerBar />
          {/* 钢琴卷帘抽屉（默认关闭，由底部按钮打开） */}
          <BottomDrawer
            open={pianoOpen()}
            onClose={() => setPianoOpen(false)}
            title={t('workbench.pianoRollTitle')}
            class="h-[70dvh]"
          >
            <PianoRollBody />
          </BottomDrawer>
          {/* 更多操作抽屉 */}
          <BottomDrawer
            open={moreOpen()}
            onClose={() => setMoreOpen(false)}
            title={t('workbench.controlsTitle')}
          >
            <SecondaryControls />
          </BottomDrawer>
        </div>
      }
    >
      {/* ===== 宽屏：可拖动分栏（尺寸持久化）===== */}
      <div class="h-screen w-screen overflow-hidden bg-background">
        <Resizable
          orientation="vertical"
          initialSizes={readSizes('dapume.layout.v', [0.6, 0.4])}
          onSizesChange={(s) => writeSizes('dapume.layout.v', s)}
        >
          <ResizablePanel minSize={0.25} class="overflow-hidden">
            <Resizable
              orientation="horizontal"
              initialSizes={readSizes('dapume.layout.h', [0.58, 0.42])}
              onSizesChange={(s) => writeSizes('dapume.layout.h', s)}
            >
              <ResizablePanel minSize={0.3} class="overflow-hidden">
                <EditorPane />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel minSize={0.25} class="overflow-hidden">
                <ControlsPane />
              </ResizablePanel>
            </Resizable>
          </ResizablePanel>
          <ResizableHandle withHandle />
          {/* 允许钢琴卷帘完全收起（minSize 0）；上方面板保留最小高度，握把始终可操作 */}
          <ResizablePanel minSize={0} collapsible class="overflow-hidden">
            <PianoRollPane />
          </ResizablePanel>
        </Resizable>
      </div>
    </Show>
  );
}
