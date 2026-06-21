import { For, Show, createEffect, createMemo } from 'solid-js';
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

const MEASURES_PER_SYSTEM = 4;

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
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
      <For each={Array.from({ length: props.atom.underlineCount })}>
        {() => <span class="jianpu-duration-line" aria-hidden="true" />}
      </For>
      <Show when={props.pitch.octave < 0}>
        <OctaveDots count={props.pitch.octave} side="below" />
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
      <For each={Array.from({ length: props.atom.underlineCount })}>
        {() => <span class="jianpu-duration-line" aria-hidden="true" />}
      </For>
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
  const systems = createMemo(() => chunks(document().measures, MEASURES_PER_SYSTEM));
  // 和弦解析仍保留在模型中，按当前产品要求暂不进入出版式简谱。
  const visibleTracks = createMemo(() => document().tracks.filter((track) => !track.isChord));
  const activeRanges = () => props.activeRanges ?? [];
  const measureElements = new Map<number, HTMLElement>();
  let scrollElement: HTMLDivElement | undefined;

  createEffect(() => {
    const measure = props.activeMeasure;
    if (!props.followPlayback || measure == null || !scrollElement) return;
    const element = measureElements.get(measure);
    if (!element) return;
    const scrollRect = scrollElement.getBoundingClientRect();
    const measureRect = element.getBoundingClientRect();
    const top = scrollElement.scrollTop + measureRect.top - scrollRect.top - (scrollRect.height - measureRect.height) / 2;
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
        <For each={systems()}>
          {(system) => (
            <section class="jianpu-system" data-system-start={system[0]?.number}>
              <span class="jianpu-system-number">({system[0]?.number})</span>
              <Show when={visibleTracks().length > 1}>
                <span class="jianpu-system-brace" aria-hidden="true">{'{'}</span>
              </Show>
              <div
                class="jianpu-measure-grid"
                style={{ '--jianpu-measures': String(system.length) }}
              >
                <For each={system}>
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
                              style={{ height: `${voiceHeight(system, track.trackNo)}rem` }}
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
          )}
        </For>
      </div>
    </div>
  );
}
