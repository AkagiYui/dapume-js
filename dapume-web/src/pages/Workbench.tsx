/**
 * 第二页：工作台。
 *
 * 宽屏布局（无 header）：上下两区，上区再分左右；区块之间可拖动改变大小，且大小持久化。
 * - 左上：dapume 编辑器（CodeMirror）。
 * - 右上：语法提示 + 操作按钮（播放控制、下载、设置等）。
 * - 下方：钢琴卷帘。
 * 窄屏布局：纵向堆叠（操作区 / 编辑器 / 钢琴卷帘），可滚动。
 *
 * 播放时锁定编辑并高亮当前发声的音符字符与所在行；谱面与各类开关、各区域尺寸均持久化到 localStorage。
 */
import { For, Show, createEffect, createMemo, createSignal, on, onCleanup, type JSX } from 'solid-js';
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
  // 仅持久化「有效」尺寸：长度 ≥ 2、均为有限正数、总和 ≈ 1。
  // corvu 在组件卸载/初始化阶段可能回调空数组或非法值，必须忽略，
  // 否则会把已保存的尺寸清空（刷新后即回到默认）。
  if (!Array.isArray(sizes) || sizes.length < 2) return;
  // 允许某一区域为 0（完全收起），但拒绝空数组 / NaN / 总和不为 1 的非法回调。
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

  const stat = (label: string, value: string | number) => (
    <div class="flex flex-col">
      <span class="text-xs text-muted-foreground">{label}</span>
      <span class="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );

  // ===== 各区域（宽窄屏共用）=====
  const EditorPane = () => (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b px-3 py-1.5">
        <span class="text-sm font-medium">{t('workbench.editorTitle')}</span>
        <Show when={isPlaying()}>
          <span class="flex items-center gap-1 text-xs text-muted-foreground">
            <Icon icon="lucide:lock" />
            {t('workbench.playingLocked')}
          </span>
        </Show>
      </div>
      <div class="min-h-0 flex-1">
        <CodeEditor
          value={scoreText()}
          onChange={setScoreText}
          readOnly={isPlaying()}
          highlights={highlights()}
          keepVisible={keepLine() && isPlaying()}
          placeholder={'1=C 120bpm\n1234567'}
        />
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

      <div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {/* 播放控制 */}
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

          {/* 进度条（停止/暂停时可拖动） */}
          <Slider
            minValue={0}
            maxValue={Math.max(1, score().durationMs)}
            value={[Math.min(currentTimeMs(), score().durationMs)]}
            onChange={(v) => !isPlaying() && seek(v[0]!)}
            disabled={isPlaying() || score().durationMs === 0}
            class="py-1"
          >
            <SliderTrack>
              <SliderFill />
              <SliderThumb />
            </SliderTrack>
          </Slider>

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

        <Separator />

        {/* 导出 */}
        <div class="grid grid-cols-2 gap-2">
          <Button variant="outline" class="gap-1.5" onClick={onDownloadMidi} disabled={score().notes.length === 0}>
            <Icon icon="lucide:file-music" />
            {t('workbench.downloadMidi')}
          </Button>
          <Button variant="outline" class="gap-1.5" onClick={onDownloadDpm}>
            <Icon icon="lucide:file-down" />
            {t('workbench.downloadDpm')}
          </Button>
        </div>

        {/* 统计 */}
        <div class="flex gap-6 rounded-md border bg-muted/30 px-3 py-2">
          {stat(t('workbench.notes'), score().notes.length)}
          {stat(t('workbench.tracks'), score().trackCount)}
          {stat(t('workbench.duration'), fmt(score().durationMs))}
        </div>

        <Separator />

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
    </div>
  );

  const PianoRollPane = () => (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b px-3 py-1.5">
        <span class="text-sm font-medium">{t('workbench.pianoRollTitle')}</span>
        <div class="flex items-center gap-3">
          <Show when={pianoState() === 'loading'}>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <Icon icon="lucide:loader-circle" class="animate-spin" />
              {t('workbench.loadingPiano')} {Math.round(loadProgress() * 100)}%
            </span>
          </Show>
          {/* 常驻提示，替代原 info 图标的悬浮提示 */}
          <span class="text-xs text-muted-foreground">
            {locale() === 'zh' ? '滚轮平移 · Ctrl+滚轮缩放' : 'Wheel: pan · Ctrl+Wheel: zoom'}
          </span>
        </div>
      </div>
      <div class="min-h-0 flex-1">
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
      </div>
    </div>
  );

  // 用一个简单的卡片包裹分区（窄屏用）
  const Card = (props: { children: JSX.Element; class?: string }) => (
    <div class={`overflow-hidden rounded-lg border bg-background ${props.class ?? ''}`}>
      {props.children}
    </div>
  );

  return (
    <Show
      when={!isNarrow()}
      fallback={
        /* ===== 窄屏：纵向堆叠，可滚动 ===== */
        <div class="flex min-h-[100dvh] flex-col gap-3 bg-background p-3">
          <Card class="h-[46vh]">
            <EditorPane />
          </Card>
          <Card class="h-[34vh]">
            <PianoRollPane />
          </Card>
          <Card>
            <ControlsPane />
          </Card>
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
