/**
 * 第二页：工作台。
 *
 * 布局（无 header）：上下两区，上区再分左右；区块之间可拖动改变大小。
 * - 左上：dapume 编辑器（CodeMirror）。
 * - 右上：语法提示 + 操作按钮（播放控制、下载、设置等）。
 * - 下方：钢琴卷帘。
 *
 * 播放时锁定编辑并高亮当前发声的音符字符；谱面与开关状态持久化到 localStorage。
 */
import { For, Show, createEffect, createMemo, createSignal, on } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { activeNotesAt, parse, toMidi } from 'dapume-js';
import type { DapumeScore } from 'dapume-js';

import { CodeEditor } from '~/components/CodeEditor';
import { PianoRoll } from '~/components/PianoRoll';
import { Icon } from '~/components/Icon';
import { SettingsPanel } from '~/components/SettingsPanel';
import { Button } from '~/components/ui/button';
import { Separator } from '~/components/ui/separator';
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from '~/components/ui/switch';
import { Slider, SliderFill, SliderThumb, SliderTrack } from '~/components/ui/slider';
import { Resizable, ResizableHandle, ResizablePanel } from '~/components/ui/resizable';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip';

import { DEFAULT_SCORE, EXAMPLES } from '~/data/examples';
import { downloadBytes, downloadText } from '~/lib/download';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import {
  currentTimeMs,
  ensurePiano,
  getPausedAt,
  isPlaying,
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

  // 持久化：谱面文本
  const [scoreText, setScoreText] = createSignal(lsGet('dapume.score', DEFAULT_SCORE));
  createEffect(() => lsSet('dapume.score', scoreText()));

  // 持久化：跟随播放进度开关
  const [follow, setFollow] = createSignal(lsGet('dapume.follow', 'true') === 'true');
  createEffect(() => lsSet('dapume.follow', String(follow())));

  // 解析谱面
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
    downloadText(scoreText(), 'score.dpm', 'text/plain');
  }

  const stat = (label: string, value: string | number) => (
    <div class="flex flex-col">
      <span class="text-xs text-muted-foreground">{label}</span>
      <span class="text-sm font-semibold tabular-nums">{value}</span>
    </div>
  );

  return (
    <div class="h-screen w-screen overflow-hidden bg-background">
      <Resizable orientation="vertical">
        {/* 上区 */}
        <ResizablePanel initialSize={0.6} minSize={0.25} class="overflow-hidden">
          <Resizable orientation="horizontal">
            {/* 左上：编辑器 */}
            <ResizablePanel initialSize={0.58} minSize={0.3} class="overflow-hidden">
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
                    placeholder={'1=C 120bpm\n1234567'}
                  />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* 右上：提示与操作 */}
            <ResizablePanel initialSize={0.42} minSize={0.25} class="overflow-hidden">
              <div class="flex h-full flex-col">
                {/* 顶部工具条 */}
                <div class="flex items-center justify-between border-b px-3 py-1.5">
                  <Button variant="ghost" size="sm" class="gap-1.5" onClick={() => navigate('/')}>
                    <Icon icon="lucide:arrow-left" />
                    {t('nav.guide')}
                  </Button>
                  <span class="text-sm font-medium">{t('workbench.controlsTitle')}</span>
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

                    <Switch
                      checked={follow()}
                      onChange={setFollow}
                      class="flex items-center justify-between"
                    >
                      <SwitchLabel class="flex items-center gap-1.5 text-sm">
                        <Icon icon="lucide:crosshair" />
                        {t('workbench.followPlayback')}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPlaying()}
                        onClick={() => setScoreText('')}
                      >
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

                  <Separator />

                  {/* 设置 */}
                  <div class="space-y-2">
                    <div class="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Icon icon="lucide:settings" />
                      {t('settings.title')}
                    </div>
                    <SettingsPanel />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </Resizable>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* 下区：钢琴卷帘 */}
        <ResizablePanel initialSize={0.4} minSize={0.18} class="overflow-hidden">
          <div class="flex h-full flex-col">
            <div class="flex items-center justify-between border-b px-3 py-1.5">
              <span class="text-sm font-medium">{t('workbench.pianoRollTitle')}</span>
              <div class="flex items-center gap-2">
                <Show when={pianoState() === 'loading'}>
                  <span class="flex items-center gap-1 text-xs text-muted-foreground">
                    <Icon icon="lucide:loader-circle" class="animate-spin" />
                    {t('workbench.loadingPiano')}
                  </span>
                </Show>
                <Tooltip>
                  <TooltipTrigger as="span" class="text-xs text-muted-foreground">
                    <Icon icon="lucide:info" />
                  </TooltipTrigger>
                  <TooltipContent>
                    {locale() === 'zh' ? '滚轮平移，Ctrl+滚轮缩放' : 'Wheel to pan, Ctrl+wheel to zoom'}
                  </TooltipContent>
                </Tooltip>
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
        </ResizablePanel>
      </Resizable>
    </div>
  );
}
