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
import { activeNotesAt, parse, paramsAt, toMidi } from 'dapume-js';
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
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '~/components/ui/dialog';
import { InfoTip } from '~/components/ui/tooltip';

import { EXAMPLES } from '~/data/examples';
import { renameScore, saveScoreContent, setLastScoreId } from '~/stores/scores';
import type { ScoreDoc } from '~/stores/scores';
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

const EMPTY_SCORE: DapumeScore = { tracks: [], notes: [], trackCount: 0, durationMs: 0, sections: [] };

export default function Workbench(props: { doc: ScoreDoc }) {
  const navigate = useNavigate();

  // ===== 乐谱正文：来自 IndexedDB 的乐谱文档，编辑后防抖写回 =====
  const [scoreText, setScoreText] = createSignal(props.doc.content);
  setLastScoreId(props.doc.id);
  let saveTimer = 0;
  createEffect(
    on(
      scoreText,
      (content) => {
        clearTimeout(saveTimer);
        saveTimer = window.setTimeout(() => void saveScoreContent(props.doc.id, content), 400);
      },
      { defer: true },
    ),
  );
  onCleanup(() => {
    clearTimeout(saveTimer);
    void saveScoreContent(props.doc.id, scoreText()); // 卸载时立即保存
  });

  // ===== 其它持久化开关（全局偏好）=====
  const [follow, setFollow] = createSignal(lsGet('dapume.follow', 'true') === 'true');
  createEffect(() => lsSet('dapume.follow', String(follow())));

  // 是否在播放时保持当前演奏行可视
  const [keepLine, setKeepLine] = createSignal(lsGet('dapume.keepLine', 'true') === 'true');
  createEffect(() => lsSet('dapume.keepLine', String(keepLine())));

  // keepLine 滚动是否平滑
  const [smooth, setSmooth] = createSignal(lsGet('dapume.smooth', 'true') === 'true');
  createEffect(() => lsSet('dapume.smooth', String(smooth())));

  // 参数行粘性置顶
  const [sticky, setSticky] = createSignal(lsGet('dapume.sticky', 'true') === 'true');
  createEffect(() => lsSet('dapume.sticky', String(sticky())));

  // 钢琴卷帘：音高方向（默认从高到低）与朝向（默认横向）
  const [pianoAsc, setPianoAsc] = createSignal(lsGet('dapume.pianoAsc', 'false') === 'true');
  createEffect(() => lsSet('dapume.pianoAsc', String(pianoAsc())));
  // 默认纵向（Synthesia 风格、键盘在底）
  const [pianoVertical, setPianoVertical] = createSignal(lsGet('dapume.pianoVertical', 'true') === 'true');
  createEffect(() => lsSet('dapume.pianoVertical', String(pianoVertical())));
  // 键盘位置：OFF=横向在左/纵向在底；ON=横向在右/纵向在顶
  const [pianoKbFlip, setPianoKbFlip] = createSignal(lsGet('dapume.pianoKbFlip', 'false') === 'true');
  createEffect(() => lsSet('dapume.pianoKbFlip', String(pianoKbFlip())));
  // 判定线位置：OFF=悬在音符区 40% 处；ON=固定在琴键与音符区交接处（默认贴键盘）
  const [pianoJudgeKb, setPianoJudgeKb] = createSignal(lsGet('dapume.pianoJudgeKb', 'true') === 'true');
  createEffect(() => lsSet('dapume.pianoJudgeKb', String(pianoJudgeKb())));
  // 编辑器与卷帘并排（宽屏左右布局）：OFF=卷帘在底部；ON=编辑器 | 卷帘（默认并排）
  const [pianoCenter, setPianoCenter] = createSignal(lsGet('dapume.pianoCenter', 'true') === 'true');
  createEffect(() => lsSet('dapume.pianoCenter', String(pianoCenter())));

  // 视觉延迟（毫秒）：把卷帘与高亮整体延后，以适配无线耳机的音频延迟
  const [delayMs, setDelayMs] = createSignal(
    Math.max(0, Math.min(500, parseInt(lsGet('dapume.visualDelay', '0'), 10) || 0)),
  );
  createEffect(() => lsSet('dapume.visualDelay', String(delayMs())));

  // ===== 窄屏适配 =====
  const narrowMedia = window.matchMedia('(max-width: 768px)');
  const [isNarrow, setIsNarrow] = createSignal(narrowMedia.matches);
  const onNarrow = () => setIsNarrow(narrowMedia.matches);
  narrowMedia.addEventListener('change', onNarrow);
  onCleanup(() => narrowMedia.removeEventListener('change', onNarrow));

  // 窄屏钢琴卷帘抽屉开关
  const [pianoOpen, setPianoOpen] = createSignal(false);
  // 速查与示例模态框（受控，便于载入示例后关闭）
  const [helpOpen, setHelpOpen] = createSignal(false);
  // 待确认载入的乐谱内容（示例/清空会覆盖当前内容，先二次确认）
  const [pendingLoad, setPendingLoad] = createSignal<string | null>(null);

  // 乐谱标题（可在本页重命名，用本地信号即时反映改名）
  const [docTitle, setDocTitle] = createSignal(props.doc.title);
  const [renaming, setRenaming] = createSignal(false);
  const [renameValue, setRenameValue] = createSignal('');
  function openRename() {
    setRenameValue(docTitle());
    setRenaming(true);
  }
  async function confirmRename() {
    const name = renameValue().trim();
    if (name) {
      await renameScore(props.doc.id, name);
      setDocTitle(name);
    }
    setRenaming(false);
  }

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

  // 编辑/演奏页占满视口、自行管理内部滚动：临时取消 html 的滚动条槽位与视口滚动，
  // 避免 scrollbar-gutter（防 layout shift 用）在本页造成右侧留白与横向滚动
  document.documentElement.classList.add('editor-page');
  onCleanup(() => document.documentElement.classList.remove('editor-page'));

  // 「播放态」：正在播放，或已暂停（currentTimeMs > 0）。暂停时仍保留高亮与实时调号/速度。
  const playActive = createMemo(() => isPlaying() || currentTimeMs() > 0);

  // 视觉时间 = 播放时间 - 延迟：卷帘与高亮整体延后，与无线耳机听到的声音对齐
  const visualTimeMs = createMemo(() => Math.max(0, currentTimeMs() - delayMs()));

  // 播放/暂停时高亮当前发声音符对应的源字符（用视觉时间）
  const highlights = createMemo(() => {
    if (!playActive()) return [];
    return activeNotesAt(score(), visualTimeMs()).map((n) => ({ from: n.srcStart, to: n.srcEnd }));
  });

  // 当前时刻生效的调号与速度（用于编辑器标题栏实时显示，用视觉时间）
  const liveParams = createMemo(() => paramsAt(score(), visualTimeMs()));

  function onPlayPause() {
    if (isPlaying()) {
      pause();
    } else {
      const s = score();
      if (s.notes.length > 0) void play(s.notes, s.durationMs, getPausedAt());
    }
  }

  // 空格键播放/暂停：在编辑器、输入框、按钮、开关、滑块等可聚焦控件上不拦截（让其原生行为生效）
  const onSpace = (e: KeyboardEvent) => {
    if (e.code !== 'Space') return;
    const el = document.activeElement as HTMLElement | null;
    const tag = el?.tagName;
    if (
      el &&
      (el.isContentEditable ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'BUTTON' ||
        el.getAttribute('role') === 'switch' ||
        el.getAttribute('role') === 'slider')
    )
      return;
    if (score().notes.length === 0) return;
    e.preventDefault();
    onPlayPause();
  };
  window.addEventListener('keydown', onSpace);
  onCleanup(() => window.removeEventListener('keydown', onSpace));

  // 去重并排序的音符起始时刻，用于「上一个 / 下一个音符」按帧步进（仅停止 / 暂停态可用）
  const onsetTimes = createMemo(() => {
    const set = new Set<number>();
    for (const n of score().notes) set.add(n.startTime);
    return [...set].sort((a, b) => a - b);
  });
  function seekToNextNote() {
    const t = onsetTimes().find((x) => x > currentTimeMs() + 1);
    if (t !== undefined) seek(t);
  }
  function seekToPrevNote() {
    const arr = onsetTimes();
    let prev = 0;
    for (const x of arr) {
      if (x < currentTimeMs() - 1) prev = x;
      else break;
    }
    seek(prev);
  }

  // 以乐谱标题作为下载文件名（过滤掉文件名非法字符）
  const fileName = (ext: string) =>
    `${(docTitle() || 'score').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'score'}.${ext}`;
  function onDownloadMidi() {
    downloadBytes(toMidi(score()), fileName('mid'), 'audio/midi');
  }
  function onDownloadDpm() {
    downloadText(scoreText(), fileName('dapume'), 'text/plain');
  }

  // 载入示例 / 清空：若当前已有内容且与目标不同，先二次确认（会覆盖当前内容）
  function requestLoad(content: string) {
    if (scoreText().trim() && scoreText() !== content) {
      setPendingLoad(content);
    } else {
      setScoreText(content);
      setHelpOpen(false);
    }
  }
  function confirmLoad() {
    const c = pendingLoad();
    if (c !== null) setScoreText(c);
    setPendingLoad(null);
    setHelpOpen(false);
  }

  // ===== 可复用片段 =====

  /** 乐谱信息：实时调号/速度（播放/暂停时）+ 音符数 / 音轨数。时长不在此显示（播放控制里已有）。
   * 窄屏空间紧张时，实时调号/速度可被截断，音符/音轨数始终可见（靠右、不撑破顶栏）。 */
  const ScoreStats = (p: { class?: string }) => (
    <div class={`flex items-center gap-2 text-xs text-muted-foreground ${p.class ?? ''}`}>
      {/* 播放或暂停（playActive）时编辑都已锁定，故都显示小锁 */}
      <Show when={playActive()}>
        <InfoTip label={t('workbench.playingLocked')} class="shrink-0 text-amber-500">
          <Icon icon="lucide:lock" />
        </InfoTip>
      </Show>
      {/* 播放/暂停时，在音符数左侧实时显示当前 1=调号 与 bpm（自解释，无需提示） */}
      <Show when={playActive()}>
        <span class="flex min-w-0 shrink items-center gap-1.5 truncate font-medium text-foreground tabular-nums">
          <span>1={liveParams().key}</span>
          <span class="opacity-60">·</span>
          <span>{liveParams().bpm}bpm</span>
        </span>
      </Show>
      {/* 用组件库 tooltip 取代原生 title：桌面 hover、移动端点击均可弹出说明。仅显示音符数（音轨数已去掉）。 */}
      <InfoTip label={t('workbench.notes')} class="shrink-0 gap-1 tabular-nums">
        <Icon icon="lucide:music" />
        {score().notes.length}
      </InfoTip>
    </div>
  );

  /** 编辑器本体（不含标题栏）。播放与暂停时均锁定编辑并保留高亮。 */
  const EditorBody = () => (
    <CodeEditor
      value={scoreText()}
      onChange={setScoreText}
      readOnly={playActive()}
      highlights={highlights()}
      keepVisible={keepLine() && playActive()}
      smoothScroll={smooth()}
      sticky={sticky()}
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

  /** 紧凑播放控制（放在乐谱编辑器顶栏中间，单行、不撑高顶栏）：
   * 上一个音符 / 播放暂停 / 停止 / 下一个音符 + 进度条（大屏附时间）。 */
  const CompactPlayback = () => {
    const noNotes = () => score().notes.length === 0;
    const stepDisabled = () => isPlaying() || noNotes();
    return (
      <div class="flex shrink-0 items-center gap-0.5">
        <Button
          size="icon"
          variant="ghost"
          class="size-7"
          onClick={seekToPrevNote}
          disabled={stepDisabled()}
          aria-label={t('workbench.prevNote')}
        >
          <Icon icon="lucide:step-back" />
        </Button>
        <Button
          size="icon"
          class="size-8"
          onClick={onPlayPause}
          disabled={noNotes()}
          aria-label={isPlaying() ? t('workbench.pause') : t('workbench.play')}
        >
          <Icon icon={isPlaying() ? 'lucide:pause' : 'lucide:play'} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          class="size-7"
          onClick={() => stop()}
          aria-label={t('workbench.stop')}
        >
          <Icon icon="lucide:square" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          class="size-7"
          onClick={seekToNextNote}
          disabled={stepDisabled()}
          aria-label={t('workbench.nextNote')}
        >
          <Icon icon="lucide:step-forward" />
        </Button>
        <span class="mx-1 hidden whitespace-nowrap text-xs tabular-nums text-muted-foreground lg:inline">
          {fmt(currentTimeMs())} / {fmt(score().durationMs)}
        </span>
        <ProgressSlider class="w-28 lg:w-44" />
      </div>
    );
  };

  /** 开关：保持当前演奏行可视 / 平滑滚动 / 参数行粘性置顶（「跟随播放」已移至钢琴卷帘标题栏）。 */
  const ToggleSwitches = () => (
    <div class="space-y-3">
      <Switch checked={keepLine()} onChange={setKeepLine} class="flex items-center justify-between">
        <SwitchLabel class="flex items-center gap-1.5 text-sm">
          <Icon icon="lucide:scroll-text" />
          {t('workbench.keepLine')}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <Switch checked={smooth()} onChange={setSmooth} class="flex items-center justify-between">
        <SwitchLabel class="flex items-center gap-1.5 text-sm">
          <Icon icon="lucide:move-vertical" />
          {t('workbench.smoothScroll')}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      <Switch checked={sticky()} onChange={setSticky} class="flex items-center justify-between">
        <SwitchLabel class="flex items-center gap-1.5 text-sm">
          <Icon icon="lucide:panel-top" />
          {t('workbench.stickyParam')}
        </SwitchLabel>
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
      {/* 钢琴卷帘居中三栏：仅宽屏布局有效 */}
      <Show when={!isNarrow()}>
        <Switch
          checked={pianoCenter()}
          onChange={setPianoCenter}
          class="flex items-center justify-between"
        >
          <SwitchLabel class="flex items-center gap-1.5 text-sm">
            <Icon icon="lucide:columns-2" />
            {t('workbench.pianoCenter')}
          </SwitchLabel>
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
        </Switch>
      </Show>
    </div>
  );

  /** 视觉延迟滑块：把卷帘/高亮整体延后，以适配无线耳机的音频延迟。
   * 两侧加减按钮便于触屏精调、避免边缘触发系统手势；也让把手不贴模态框边缘被遮挡。 */
  const DelaySlider = () => (
    <div class="space-y-2">
      <div class="flex items-center justify-between text-sm">
        <span class="flex items-center gap-1.5">
          <Icon icon="lucide:headphones" />
          {t('workbench.visualDelay')}
        </span>
        <span class="tabular-nums text-muted-foreground">{delayMs()}ms</span>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          class="size-7 shrink-0"
          onClick={() => setDelayMs(Math.max(0, delayMs() - 5))}
          disabled={delayMs() <= 0}
          aria-label={t('workbench.delayDown')}
        >
          <Icon icon="lucide:minus" />
        </Button>
        <Slider
          class="min-w-0 flex-1"
          minValue={0}
          maxValue={500}
          step={5}
          value={[delayMs()]}
          onChange={(v) => setDelayMs(v[0]!)}
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb />
          </SliderTrack>
        </Slider>
        <Button
          variant="outline"
          size="icon"
          class="size-7 shrink-0"
          onClick={() => setDelayMs(Math.min(500, delayMs() + 5))}
          disabled={delayMs() >= 500}
          aria-label={t('workbench.delayUp')}
        >
          <Icon icon="lucide:plus" />
        </Button>
      </div>
    </div>
  );

  /** 工作台开关与延迟（移入设置模态框，作为外观设置之后的附加内容）。 */
  const WorkbenchSettings = () => (
    <div class="space-y-4">
      <ToggleSwitches />
      <DelaySlider />
    </div>
  );

  /** 导出按钮（下载 MIDI / dapume）。 */
  const DownloadButtons = () => (
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
  );

  /** 速查 + 示例（移入「速查与示例」模态框）。 */
  const HelpContent = () => (
    <div class="space-y-5">
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
      {/* 示例（点击会覆盖当前内容，先二次确认） */}
      <div class="space-y-2">
        <div class="text-xs font-medium text-muted-foreground">{t('workbench.examples')}</div>
        <div class="flex flex-wrap gap-1.5">
          <For each={EXAMPLES}>
            {(ex) => (
              <Button
                variant="secondary"
                size="sm"
                disabled={isPlaying()}
                onClick={() => requestLoad(ex.code)}
              >
                {ex.title[locale()]}
              </Button>
            )}
          </For>
          <Button variant="ghost" size="sm" disabled={isPlaying()} onClick={() => requestLoad('')}>
            {t('workbench.clear')}
          </Button>
        </div>
      </div>
    </div>
  );

  /** 速查与示例模态框按钮（问号图标，受控以便载入示例后关闭）。 */
  const HelpModalButton = () => (
    <Dialog open={helpOpen()} onOpenChange={setHelpOpen}>
      <DialogTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label={t('workbench.help')}
      >
        <Icon icon="lucide:circle-help" />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle class="mb-4">{t('workbench.help')}</DialogTitle>
        <div class="max-h-[70dvh] overflow-y-auto">
          <HelpContent />
        </div>
      </DialogContent>
    </Dialog>
  );

  /** 下载模态框按钮（窄屏：选择下载 MIDI 或 dapume）。 */
  const DownloadModalButton = () => (
    <Dialog>
      <DialogTrigger
        as={Button}
        variant="ghost"
        size="icon"
        class="size-8"
        aria-label={t('workbench.download')}
      >
        <Icon icon="lucide:file-output" />
      </DialogTrigger>
      <DialogContent>
        <DialogTitle class="mb-4">{t('workbench.download')}</DialogTitle>
        <DownloadButtons />
      </DialogContent>
    </Dialog>
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
        currentTimeMs={visualTimeMs()}
        isPlaying={isPlaying()}
        follow={follow()}
        pitchAscending={pianoAsc()}
        orientation={pianoVertical() ? 'vertical' : 'horizontal'}
        keyboardFlip={pianoKbFlip()}
        judgeAtKeyboard={pianoJudgeKb()}
      />
    </Show>
  );

  /** 标题栏用的紧凑开关（图标 + 小开关），高度不超过标题文字，不撑高标题栏。 */
  const MiniSwitch = (p: {
    checked: boolean;
    onChange: (v: boolean) => void;
    icon: string;
    label: string;
    /** 为 true 时把图标顺时针旋转 90°（带过渡动画）。 */
    rotate?: boolean;
    /** 为 true 时把图标逆时针旋转 90°（带过渡动画）。 */
    rotateCcw?: boolean;
  }) => (
    <InfoTip label={p.label} placement="bottom">
      <Switch checked={p.checked} onChange={p.onChange} class="flex items-center gap-1" aria-label={p.label}>
        <SwitchLabel class="flex text-muted-foreground">
          <Icon
            icon={p.icon}
            class={`inline-block transition-transform duration-300 ${p.rotate ? 'rotate-90' : ''} ${p.rotateCcw ? '-rotate-90' : ''}`}
          />
        </SwitchLabel>
        <SwitchControl class="h-4 w-7">
          <SwitchThumb class="size-3 data-[checked]:translate-x-3" />
        </SwitchControl>
      </Switch>
    </InfoTip>
  );

  /** 钢琴卷帘标题栏右侧信息（跟随/朝向/琴键方向/琴键位置开关 + 加载进度 + 操作提示）。 */
  const PianoRollInfo = () => (
    <div class="flex min-w-0 items-center gap-3">
      {/* 切换：跟随播放、卷帘朝向、琴键方向、琴键位置；纵向时把后两个图标旋转 90° */}
      <div class="flex shrink-0 items-center gap-2">
        <MiniSwitch
          checked={follow()}
          onChange={setFollow}
          icon="lucide:crosshair"
          label={t('workbench.followPlayback')}
        />
        <MiniSwitch
          checked={pianoVertical()}
          onChange={setPianoVertical}
          icon="lucide:rotate-3d"
          rotateCcw={!pianoVertical()}
          label={t('workbench.pianoOrientation')}
        />
        <MiniSwitch
          checked={pianoAsc()}
          onChange={setPianoAsc}
          icon="lucide:flip-vertical-2"
          rotate={pianoVertical()}
          label={t('workbench.pianoKeyDir')}
        />
        <MiniSwitch
          checked={pianoKbFlip()}
          onChange={setPianoKbFlip}
          icon="lucide:flip-horizontal-2"
          rotate={pianoVertical()}
          label={t('workbench.pianoKeyboardPos')}
        />
        <MiniSwitch
          checked={pianoJudgeKb()}
          onChange={setPianoJudgeKb}
          icon="lucide:scan-line"
          rotate={!pianoVertical()}
          label={t('workbench.pianoJudgeLine')}
        />
      </div>
      <Show when={pianoState() === 'loading'}>
        <span class="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <Icon icon="lucide:loader-circle" class="animate-spin" />
          {t('workbench.loadingPiano')} {Math.round(loadProgress() * 100)}%
        </span>
      </Show>
      {/* 操作提示：溢出省略、不换行 */}
      <span class="hidden min-w-0 shrink truncate text-xs text-muted-foreground sm:block">
        {locale() === 'zh' ? '滚轮平移 · Ctrl+滚轮缩放' : 'Wheel: pan · Ctrl+Wheel: zoom'}
      </span>
    </div>
  );

  // ===== 宽屏分区 =====
  // 乐谱标题 + 重命名按钮：宽屏平时隐藏、hover 标题时显示；窄屏（无 hover）常显。标题溢出省略。
  const TitleWithRename = (p: { class?: string }) => (
    <div class={`group/title flex min-w-0 items-center gap-0.5 ${p.class ?? ''}`}>
      <span class="min-w-0 truncate text-sm font-medium" title={docTitle()}>
        {docTitle()}
      </span>
      <Button
        variant="ghost"
        size="icon"
        class="size-6 shrink-0 text-muted-foreground opacity-100 transition-opacity hover:text-foreground md:opacity-0 md:group-hover/title:opacity-100"
        aria-label={t('manager.rename')}
        onClick={openRename}
      >
        <Icon icon="lucide:pencil" class="size-3.5" />
      </Button>
    </div>
  );

  // 操作区已整体移除。顶栏抽到「整页级」（占满页面宽度、在分栏之上）：
  // 左=返回(图标)+标题(可重命名)，中=播放控制，右=乐谱信息+模态框按钮。
  const WorkbenchTopBar = () => (
    <div class="flex items-center gap-2 border-b px-2 py-1.5">
      <div class="flex min-w-0 flex-1 items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          class="size-8 shrink-0"
          onClick={() => navigate({ to: '/workbench' })}
          aria-label={t('manager.title')}
        >
          <Icon icon="lucide:arrow-left" />
        </Button>
        <TitleWithRename class="min-w-0" />
      </div>
      <CompactPlayback />
      <div class="flex min-w-0 flex-1 items-center justify-end gap-2">
        <ScoreStats />
        <div class="flex shrink-0 items-center gap-0.5">
          <HelpModalButton />
          <SettingsModalButton extra={<WorkbenchSettings />} />
          <DownloadModalButton />
        </div>
      </div>
    </div>
  );

  // 编辑器面板：顶栏已抽到整页级，此处只剩编辑器本体。
  const EditorPane = () => (
    <div class="h-full min-h-0">
      <EditorBody />
    </div>
  );

  // 钢琴卷帘面板：卷帘在上、标题与开关栏在下（顶栏改底栏）。标题/提示溢出省略、不换行。
  const PianoRollPane = () => (
    <div class="flex h-full flex-col">
      <div class="min-h-0 flex-1">
        <PianoRollBody />
      </div>
      <div class="flex items-center justify-between gap-2 border-t px-3 py-1.5">
        <span class="min-w-0 shrink truncate text-sm font-medium">
          {t('workbench.pianoRollTitle')}
        </span>
        <PianoRollInfo />
      </div>
    </div>
  );

  // ===== 窄屏底部播放条 =====
  const NarrowPlayerBar = () => {
    const noNotes = () => score().notes.length === 0;
    const stepDisabled = () => isPlaying() || noNotes();
    return (
      <div class="flex items-center gap-1 border-t bg-background px-2 py-2">
        <Button
          size="icon"
          variant="ghost"
          class="size-8 shrink-0"
          onClick={seekToPrevNote}
          disabled={stepDisabled()}
          aria-label={t('workbench.prevNote')}
        >
          <Icon icon="lucide:step-back" />
        </Button>
        <Button
          size="icon"
          class="size-9 shrink-0"
          onClick={onPlayPause}
          disabled={noNotes()}
          aria-label={isPlaying() ? t('workbench.pause') : t('workbench.play')}
        >
          <Icon icon={isPlaying() ? 'lucide:pause' : 'lucide:play'} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          class="size-8 shrink-0"
          onClick={seekToNextNote}
          disabled={stepDisabled()}
          aria-label={t('workbench.nextNote')}
        >
          <Icon icon="lucide:step-forward" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="size-8 shrink-0"
          onClick={() => stop()}
          aria-label={t('workbench.stop')}
        >
          <Icon icon="lucide:square" />
        </Button>
        <span class="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(currentTimeMs())}</span>
        <ProgressSlider class="mx-1 min-w-0 flex-1" />
        <Button
          variant={pianoOpen() ? 'default' : 'outline'}
          size="icon"
          class="size-8 shrink-0"
          onClick={() => setPianoOpen(true)}
          aria-label={t('workbench.pianoRollTitle')}
        >
          <Icon icon="lucide:audio-waveform" />
        </Button>
      </div>
    );
  };

  return (
    <>
    <Show
      when={!isNarrow()}
      fallback={
        /* ===== 窄屏：编辑器为主 + 底部播放条 + 钢琴卷帘抽屉 ===== */
        <div class="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
          {/* 顶栏：返回(图标) + 乐谱标题(可重命名、溢出省略) + 乐谱信息 + 速查/设置/下载。
              所有可变内容 min-w-0/可截断，确保播放时也不撑破顶栏。 */}
          <div class="flex items-center gap-1 border-b px-2 py-1.5">
            <Button
              variant="ghost"
              size="icon"
              class="size-8 shrink-0"
              onClick={() => navigate({ to: '/workbench' })}
              aria-label={t('manager.title')}
            >
              <Icon icon="lucide:arrow-left" />
            </Button>
            <TitleWithRename class="min-w-0 flex-1" />
            <ScoreStats class="shrink-0" />
            <div class="flex shrink-0 items-center gap-0.5">
              <HelpModalButton />
              <SettingsModalButton extra={<WorkbenchSettings />} />
              <DownloadModalButton />
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
            headerRight={<PianoRollInfo />}
            hideClose
            class="h-[70dvh]"
          >
            <PianoRollBody />
          </BottomDrawer>
        </div>
      }
    >
      {/* ===== 宽屏：整页级顶栏（占满页面宽度）+ 下方「编辑器 + 钢琴卷帘」可拖动分栏。
          pianoCenter 关：上下堆叠（编辑器在上、卷帘在下，可完全收起）；
          pianoCenter 开：左右并排（编辑器 | 卷帘）。===== */}
      <div class="flex h-[100dvh] w-full flex-col overflow-hidden bg-background">
        <WorkbenchTopBar />
        <div class="min-h-0 flex-1">
          <Show
            when={pianoCenter()}
            fallback={
              <Resizable
                orientation="vertical"
                initialSizes={readSizes('dapume.layout.v', [0.6, 0.4])}
                onSizesChange={(s) => writeSizes('dapume.layout.v', s)}
              >
                <ResizablePanel minSize={0.25} class="overflow-hidden">
                  <EditorPane />
                </ResizablePanel>
                <ResizableHandle withHandle />
                {/* 允许钢琴卷帘完全收起（minSize 0）；上方面板保留最小高度，握把始终可操作 */}
                <ResizablePanel minSize={0} collapsible class="overflow-hidden">
                  <PianoRollPane />
                </ResizablePanel>
              </Resizable>
            }
          >
            <Resizable
              orientation="horizontal"
              initialSizes={readSizes('dapume.layout.side', [0.55, 0.45])}
              onSizesChange={(s) => writeSizes('dapume.layout.side', s)}
            >
              <ResizablePanel minSize={0.25} class="overflow-hidden">
                <EditorPane />
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel minSize={0.2} collapsible class="overflow-hidden">
                <PianoRollPane />
              </ResizablePanel>
            </Resizable>
          </Show>
        </div>
      </div>
    </Show>
    {/* 载入示例 / 清空的覆盖确认（受 pendingLoad 控制，Portal 渲染于两种布局之外） */}
    <Dialog open={pendingLoad() !== null} onOpenChange={(o) => !o && setPendingLoad(null)}>
      <DialogContent>
        <DialogTitle class="mb-3">{t('workbench.loadExample')}</DialogTitle>
        <DialogDescription class="mb-4">{t('workbench.confirmOverwrite')}</DialogDescription>
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setPendingLoad(null)}>
            {t('manager.cancel')}
          </Button>
          <Button onClick={confirmLoad}>{t('common.confirm')}</Button>
        </div>
      </DialogContent>
    </Dialog>
    {/* 重命名乐谱 */}
    <Dialog open={renaming()} onOpenChange={(o) => !o && setRenaming(false)}>
      <DialogContent>
        <DialogTitle class="mb-3">{t('manager.renameTitle')}</DialogTitle>
        <label class="mb-1.5 block text-sm text-muted-foreground">{t('manager.renamePrompt')}</label>
        <input
          class="w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={renameValue()}
          onInput={(e) => setRenameValue(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void confirmRename();
            }
          }}
          autofocus
        />
        <div class="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRenaming(false)}>
            {t('manager.cancel')}
          </Button>
          <Button onClick={() => void confirmRename()} disabled={!renameValue().trim()}>
            {t('manager.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
