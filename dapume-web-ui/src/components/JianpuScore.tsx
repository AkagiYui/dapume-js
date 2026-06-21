import { For, Show, createEffect, createMemo } from 'solid-js';
import type { DapumeScore } from 'dapume-js';

import { Icon } from './Icon';
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
  isPlaying?: boolean;
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

function Atom(props: {
  atom: JianpuAtom;
  active: boolean;
  onSeek?: (beat: number) => void;
}) {
  const label = () => {
    if (props.atom.isRest) return t('workbench.jianpuRestLabel');
    const notes = props.atom.pitches
      .map((pitch) => `${accidentalText(pitch.accidental)}${pitch.degree}`)
      .join('+');
    return props.atom.chordName ? `${props.atom.chordName} · ${notes}` : notes;
  };
  return (
    <button
      type="button"
      class={cn('jianpu-atom', props.active && 'is-active')}
      style={{
        left: `${(props.atom.offsetBeat / 4) * 100}%`,
        width: `${(props.atom.durationBeats / 4) * 100}%`,
        top: `${props.atom.lane * (props.atom.isChord ? 7 : 4.75) + 0.25}rem`,
      }}
      classList={{
        'has-tie-in': props.atom.tieFromPrevious,
        'has-tie-out': props.atom.tieToNext,
        'is-polyphonic': props.atom.pitches.length > 1,
        'is-chord': props.atom.isChord,
      }}
      aria-label={label()}
      title={props.atom.chordSource ? `${props.atom.chordName} [${props.atom.chordSource}]` : label()}
      onClick={() => props.onSeek?.(props.atom.absoluteBeat)}
    >
      <Show when={props.atom.chordName}>
        <span class="jianpu-chord-name">
          {props.atom.chordName}
          <span class="jianpu-chord-source">{props.atom.chordSource}</span>
        </span>
      </Show>
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

function MeasureHeader(props: {
  measure: JianpuMeasure;
  active: boolean;
  selected: boolean;
  setRef: (element: HTMLElement) => void;
}) {
  return (
    <div
      ref={props.setRef}
      class={cn('jianpu-measure-header', props.active && 'is-active', props.selected && 'is-selected')}
      data-measure={props.measure.number}
    >
      <Show when={(props.measure.number - 1) % MEASURES_PER_SYSTEM === 0}>
        <span class="jianpu-measure-number">{props.measure.number}</span>
      </Show>
      <For each={props.measure.sections}>
        {(section) => (
          <span class="jianpu-parameter" style={{ left: `${(section.offsetBeat / 4) * 100}%` }}>
            1={section.key} · {section.bpm} BPM
          </span>
        )}
      </For>
    </div>
  );
}

export function JianpuScore(props: JianpuScoreProps) {
  const document = createMemo(() => buildJianpuDocument(props.score, props.source));
  const systems = createMemo(() => chunks(document().measures, MEASURES_PER_SYSTEM));
  const activeRanges = () => props.activeRanges ?? [];
  const measureElements = new Map<number, HTMLElement>();

  createEffect(() => {
    const measure = props.activeMeasure;
    if (!props.followPlayback || !props.isPlaying || measure == null) return;
    const element = measureElements.get(measure);
    element?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });

  return (
    <div class="jianpu-scroll" data-testid="jianpu-score">
      <div class="jianpu-paper">
        <div class="jianpu-score-heading">
          <span class="jianpu-score-key">1={props.score.sections[0]?.key ?? 'C'}</span>
          <span>4/4</span>
          <span>{props.score.sections[0]?.bpm ?? 120} BPM</span>
        </div>
        <For each={systems()}>
          {(system) => (
            <div
              class="jianpu-system"
              style={{ '--jianpu-measures': String(system.length) }}
            >
              <div class="jianpu-system-row jianpu-header-row">
                <span class="jianpu-track-spacer" />
                <For each={system}>
                  {(measure) => (
                    <MeasureHeader
                      measure={measure}
                      active={props.activeMeasure === measure.number}
                      selected={props.selectedMeasure === measure.number}
                      setRef={(element) => measureElements.set(measure.number, element)}
                    />
                  )}
                </For>
              </div>
              <For each={document().tracks}>
                {(track, trackIndex) => (
                  <div class="jianpu-system-row jianpu-voice-row">
                    <span class="jianpu-track-label" title={track.isChord ? t('workbench.jianpuChordTrack') : t('workbench.jianpuVoice', { number: track.trackNo + 1 })}>
                      <Icon icon={track.isChord ? 'lucide:guitar' : 'lucide:music-2'} />
                      <span>{track.isChord ? t('workbench.jianpuChordShort') : trackIndex() + 1}</span>
                    </span>
                    <For each={system}>
                      {(measure) => {
                        const voice = () => measure.voices.find((item) => item.trackNo === track.trackNo)!;
                        return (
                          <div
                            class={cn(
                              'jianpu-measure-cell',
                              props.activeMeasure === measure.number && 'is-active',
                              props.selectedMeasure === measure.number && 'is-selected',
                            )}
                            style={{
                              height: `${Math.max(1, voice().laneCount) * (track.isChord ? 7 : 4.75) + 0.75}rem`,
                            }}
                          >
                            <For each={[1, 2, 3]}>
                              {(beat) => <span class="jianpu-beat-guide" style={{ left: `${beat * 25}%` }} />}
                            </For>
                            <For each={voice().atoms}>
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
          )}
        </For>
        <Show when={document().measures.length > 0}>
          <div class="jianpu-end-mark" aria-label={t('workbench.jianpuEndMark')} />
        </Show>
      </div>
    </div>
  );
}
