import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { DapumeScore } from 'dapume-js';

import { atomIsActive, buildJianpuDocument } from '../lib/jianpu';
import type { JianpuAtom, JianpuMeasure, JianpuPitch } from '../lib/jianpu';
import { cn } from '../lib/utils';
import { t } from '../i18n';

export interface JianpuScoreProps {
  score: DapumeScore;
  source: string;
  activeRanges?: readonly { from: number; to: number }[];
  activeBeat?: number | null;
  activeMeasure?: number | null;
  selectedMeasure?: number | null;
  followPlayback?: boolean;
  onSeekBeat?: (beat: number) => void;
}

// 简谱排版按可用宽度自适应：只保留纵向滚动、去掉横向滚动，降低读谱心智负担。
const MIN_MEASURE_REM = 8; // 单个小节的最小可读宽度
const ATOM_REM = 1; // 每个音符（含间隙）的近似最小宽度，用于按密度撑宽小节、避免数字重叠
const DEFAULT_AVAILABLE_REM = 30; // 首帧测量前的可用宽度兜底
// 跟随播放时把当前小节定位在视口偏上处（约 40%），下方留出更多即将演奏的小节，便于「向下看」。
const FOLLOW_SCROLL_ANCHOR = 0.4;

function rootFontPx(): number {
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

// 小节内「横向最密的一条 lane」的音符数：决定该小节需要多宽才不挤压重叠。
function measureDensity(measure: JianpuMeasure): number {
  let max = 1;
  for (const voice of measure.voices) {
    const perLane = new Map<number, number>();
    for (const atom of voice.atoms) perLane.set(atom.lane, (perLane.get(atom.lane) ?? 0) + 1);
    for (const count of perLane.values()) if (count > max) max = count;
  }
  return max;
}

function accidentalText(value: number): string {
  if (value > 0) return '♯'.repeat(value);
  if (value < 0) return '♭'.repeat(-value);
  return '';
}

function OctaveDots(props: { count: number; side: 'above' | 'below' }) {
  return (
    <span class={`jianpu-octave-dots jianpu-octave-${props.side}`} aria-hidden="true">
      <For each={Array.from({ length: Math.abs(props.count) })}>{() => <span>•</span>}</For>
    </span>
  );
}

function PitchGlyph(props: { pitch: JianpuPitch; atom: JianpuAtom }) {
  return (
    <span class="jianpu-pitch-glyph">
      <Show when={props.pitch.octave > 0}>
        <OctaveDots count={props.pitch.octave} side="above" />
      </Show>
      <span class="jianpu-pitch-main">
        <Show when={props.pitch.accidental !== 0}>
          <span class="jianpu-accidental">{accidentalText(props.pitch.accidental)}</span>
        </Show>
        <span class="jianpu-degree">{props.pitch.degree}</span>
        <Show when={props.atom.dotted}>
          <span class="jianpu-dot">·</span>
        </Show>
      </span>
      <Show when={props.atom.underlineCount > 0 || props.pitch.octave < 0}>
        <span class="jianpu-below-group" aria-hidden="true">
          <For each={Array.from({ length: props.atom.underlineCount })}>
            {() => <span class="jianpu-duration-line" />}
          </For>
          <Show when={props.pitch.octave < 0}>
            <OctaveDots count={props.pitch.octave} side="below" />
          </Show>
        </span>
      </Show>
    </span>
  );
}

function RestGlyph(props: { atom: JianpuAtom }) {
  return (
    <span class="jianpu-pitch-glyph jianpu-rest-glyph">
      <span class="jianpu-pitch-main">
        <span class="jianpu-degree">0</span>
        <Show when={props.atom.dotted}>
          <span class="jianpu-dot">·</span>
        </Show>
      </span>
      <Show when={props.atom.underlineCount > 0}>
        <span class="jianpu-below-group" aria-hidden="true">
          <For each={Array.from({ length: props.atom.underlineCount })}>
            {() => <span class="jianpu-duration-line" />}
          </For>
        </span>
      </Show>
    </span>
  );
}

function Atom(props: { atom: JianpuAtom; active: boolean; onSeek?: (beat: number) => void }) {
  const label = () => {
    if (props.atom.isRest) return t('workbench.jianpuRestLabel');
    return props.atom.pitches.map((pitch) => `${accidentalText(pitch.accidental)}${pitch.degree}`).join('+');
  };
  return (
    <button
      type="button"
      class={cn('jianpu-atom', props.active && 'is-active')}
      style={{
        left: `${(props.atom.offsetBeat / 4) * 100}%`,
        width: `${(props.atom.durationBeats / 4) * 100}%`,
        top: `${props.atom.lane * 2.55 + (props.atom.pitches.length > 1 ? 0.05 : 0.58)}rem`,
      }}
      classList={{
        'has-tie-in': props.atom.tieFromPrevious,
        'has-tie-out': props.atom.tieToNext,
        'has-underline': props.atom.underlineCount > 0,
        'is-polyphonic': props.atom.pitches.length > 1,
      }}
      aria-label={label()}
      title={label()}
      onClick={() => props.onSeek?.(props.atom.absoluteBeat)}
    >
      <span class="jianpu-note-cluster">
        <Show when={!props.atom.isRest} fallback={<RestGlyph atom={props.atom} />}>
          <span class="jianpu-pitches">
            <For each={props.atom.pitches}>{(pitch) => <PitchGlyph pitch={pitch} atom={props.atom} />}</For>
          </span>
        </Show>
        <For each={Array.from({ length: props.atom.extensionCount })}>
          {() => <span class="jianpu-extension-line" aria-hidden="true" />}
        </For>
      </span>
      <Show when={props.atom.tieFromPrevious}>
        <span class="jianpu-tie jianpu-tie-in" aria-hidden="true" />
      </Show>
      <Show when={props.atom.tieToNext}>
        <span class="jianpu-tie jianpu-tie-out" aria-hidden="true" />
      </Show>
    </button>
  );
}

function voiceHeight(system: JianpuMeasure[], trackNo: number): number {
  const lanes = Math.max(
    1,
    ...system.map((measure) => measure.voices.find((voice) => voice.trackNo === trackNo)?.laneCount ?? 1),
  );
  return 3.85 + (lanes - 1) * 2.55;
}

export function JianpuScore(props: JianpuScoreProps) {
  const document = createMemo(() => buildJianpuDocument(props.score, props.source));
  let rulerElement: HTMLDivElement | undefined;
  // 折行用的可用宽度「现读」隐藏标尺的真实像素宽（不缓存、不估算），由 layoutTick 触发重算。
  const [layoutTick, setLayoutTick] = createSignal(0);
  const availableRem = () => {
    layoutTick();
    const px = rulerElement?.clientWidth ?? 0;
    return px > 0 ? px / rootFontPx() : DEFAULT_AVAILABLE_REM;
  };
  // 每个小节所需宽度（rem）：按密度撑宽，但不超过整行可用宽度（极端密集时退化为占满整行）。
  const measureWidthRem = (measure: JianpuMeasure) =>
    Math.min(availableRem(), Math.max(MIN_MEASURE_REM, measureDensity(measure) * ATOM_REM));
  // 贪心装箱：按累计宽度把小节折到多行（仅纵向滚动）；每行至少 1 个小节，密集小节自动更宽。
  const rows = createMemo<JianpuMeasure[][]>(() => {
    const usable = availableRem();
    const out: JianpuMeasure[][] = [];
    let row: JianpuMeasure[] = [];
    let width = 0;
    for (const measure of document().measures) {
      const w = measureWidthRem(measure);
      if (row.length > 0 && width + w > usable + 0.01) {
        out.push(row);
        row = [];
        width = 0;
      }
      row.push(measure);
      width += w;
    }
    if (row.length > 0) out.push(row);
    return out;
  });
  // 和弦解析仍保留在模型中，按当前产品要求暂不进入出版式简谱。
  const visibleTracks = createMemo(() => document().tracks.filter((track) => !track.isChord));
  const activeRanges = () => props.activeRanges ?? [];
  const measureElements = new Map<number, HTMLElement>();
  let scrollElement: HTMLDivElement | undefined;

  // 用一条隐藏「标尺」测量小节区的真实宽度来折行（不估算开销，杜绝因估算偏大而横向溢出）。
  onMount(() => {
    const ruler = rulerElement;
    if (!ruler) return;
    const bump = () => setLayoutTick((tick) => tick + 1);
    bump();
    // 分栏 / 滚动条槽位等布局稳定的时机因环境而异；多次延迟重算，确保最终按真实宽度折行（现读标尺宽）。
    requestAnimationFrame(() => requestAnimationFrame(bump));
    const timers = [60, 200, 400].map((delay) => setTimeout(bump, delay));
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(bump);
      observer.observe(ruler);
    }
    onCleanup(() => {
      for (const timer of timers) clearTimeout(timer);
      observer?.disconnect();
    });
  });

  createEffect(() => {
    const measure = props.activeMeasure;
    if (!props.followPlayback || measure == null || !scrollElement) return;
    const element = measureElements.get(measure);
    if (!element) return;
    const scrollRect = scrollElement.getBoundingClientRect();
    const measureRect = element.getBoundingClientRect();
    const top =
      scrollElement.scrollTop +
      measureRect.top -
      scrollRect.top -
      (scrollRect.height - measureRect.height) * FOLLOW_SCROLL_ANCHOR;
    scrollElement.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  });

  return (
    <div ref={scrollElement} class="jianpu-scroll" data-testid="jianpu-score">
      <div class="jianpu-paper">
        <div class="jianpu-score-heading">
          <strong class="jianpu-score-key">1={props.score.sections[0]?.key ?? 'C'}</strong>
          <span class="jianpu-time-signature" aria-label="4/4">
            <span>4</span><span>4</span>
          </span>
          <span class="jianpu-tempo"><span aria-hidden="true">♩</span>={props.score.sections[0]?.bpm ?? 120}</span>
        </div>
        {/* 隐藏标尺：与真实小节行同宽（同样的行号槽 + 1fr），用于测量小节区真实宽度。 */}
        <div class="jianpu-system jianpu-ruler" aria-hidden="true">
          <div class="jianpu-measure-grid" ref={rulerElement} />
        </div>
        <For each={rows()}>
          {(row, rowIndex) => {
            // 末行用各小节自然宽度（左对齐、右侧留白）；其余行用 minmax(..,1fr) 撑满整行。
            const template = () =>
              row
                .map((measure) =>
                  rowIndex() === rows().length - 1
                    ? `${measureWidthRem(measure)}rem`
                    : `minmax(${measureWidthRem(measure)}rem, 1fr)`,
                )
                .join(' ');
            return (
            <section class="jianpu-system" data-system-start={row[0]?.number}>
              <span class="jianpu-system-number">({row[0]?.number})</span>
              <Show when={visibleTracks().length > 1}>
                <span class="jianpu-system-brace" aria-hidden="true">{'{'}</span>
              </Show>
              <div class="jianpu-measure-grid" style={{ 'grid-template-columns': template() }}>
                <For each={row}>
                  {(measure, measureIndex) => (
                    <div
                      ref={(element) => measureElements.set(measure.number, element)}
                      class={cn(
                        'jianpu-measure-stack',
                        props.activeMeasure === measure.number && 'is-active',
                        props.selectedMeasure === measure.number && 'is-selected',
                        measure.number === document().measures.length && 'is-final',
                      )}
                      data-measure={measure.number}
                    >
                      <For each={measure.sections.filter((section) => section.startBeat > 0)}>
                        {(section) => (
                          <span class="jianpu-parameter" style={{ left: `${(section.offsetBeat / 4) * 100}%` }}>
                            1={section.key} · ♩={section.bpm}
                          </span>
                        )}
                      </For>
                      <For each={visibleTracks()}>
                        {(track) => {
                          const voice = () => measure.voices.find((item) => item.trackNo === track.trackNo);
                          return (
                            <div
                              class={cn('jianpu-measure-cell', measureIndex() === 0 && 'is-system-start')}
                              style={{ height: `${voiceHeight(row, track.trackNo)}rem` }}
                            >
                              <For each={voice()?.atoms ?? []}>
                                {(atom) => (
                                  <Atom
                                    atom={atom}
                                    active={atomIsActive(atom, activeRanges(), props.activeBeat)}
                                    onSeek={props.onSeekBeat}
                                  />
                                )}
                              </For>
                            </div>
                          );
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </section>
            );
          }}
        </For>
      </div>
    </div>
  );
}
