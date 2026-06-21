import type { DapumeEvent, DapumeScore, DapumeSection } from 'dapume-js';

import { BEATS_PER_MEASURE, measureCount } from './measures';

const EPSILON = 1e-7;
// 事件时间以整数毫秒保存，而拍位保留小数；在较快速度下换算误差可接近数千分之一拍。
const PLAYBACK_EPSILON_BEATS = 0.005;
const SCALE_SEMITONES = [0, 0, 2, 4, 5, 7, 9, 11] as const;
const DURATION_VALUES = [4, 3, 2, 1.5, 1, 0.75, 0.5, 0.375, 0.25, 0.125] as const;
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'] as const;

export interface JianpuPitch {
  degree: number;
  accidental: number;
  octave: number;
}

export interface JianpuAtom {
  id: string;
  trackNo: number;
  measure: number;
  absoluteBeat: number;
  offsetBeat: number;
  durationBeats: number;
  pitches: JianpuPitch[];
  isRest: boolean;
  isChord: boolean;
  chordName?: string;
  chordSource?: string;
  sourceRanges: Array<{ from: number; to: number }>;
  tieFromPrevious: boolean;
  tieToNext: boolean;
  underlineCount: number;
  dotted: boolean;
  extensionCount: number;
  lane: number;
}

export interface JianpuVoice {
  trackNo: number;
  isChord: boolean;
  atoms: JianpuAtom[];
  laneCount: number;
}

export interface JianpuMeasure {
  number: number;
  voices: JianpuVoice[];
  sections: Array<DapumeSection & { offsetBeat: number }>;
}

export interface JianpuDocument {
  measures: JianpuMeasure[];
  tracks: Array<{ trackNo: number; isChord: boolean }>;
}

interface EventGroup {
  trackNo: number;
  startBeat: number;
  durationBeats: number;
  pitches: number[];
  isRest: boolean;
  isChord: boolean;
  srcStart: number;
  srcEnd: number;
}

function positiveMod(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

function sectionAtBeat(sections: DapumeSection[], beat: number): DapumeSection {
  let current = sections[0] ?? { startTime: 0, startBeat: 0, tonic: 60, bpm: 120, key: 'C' };
  for (const section of sections) {
    if (section.startBeat <= beat + EPSILON) current = section;
    else break;
  }
  return current;
}

function pitchFromSource(event: EventGroup, pitch: number, source: string, section: DapumeSection): JianpuPitch | null {
  if (event.srcStart < 0 || event.srcEnd <= event.srcStart) return null;
  const token = source.slice(event.srcStart, event.srcEnd);
  const degreeMatch = token.match(/[1-7]/);
  if (!degreeMatch) return null;
  const degree = Number(degreeMatch[0]);
  let accidental = 0;
  for (const char of token) {
    if (char === '#') accidental += 1;
    if (char === 'b') accidental -= 1;
  }
  const basePitch = section.tonic + SCALE_SEMITONES[degree] + accidental;
  const octave = Math.round((pitch - basePitch) / 12);
  return { degree, accidental, octave };
}

function pitchFromMidi(pitch: number, section: DapumeSection): JianpuPitch {
  const relative = pitch - section.tonic;
  const preferredFlat = section.key.includes('b');
  let best: JianpuPitch | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let degree = 1; degree <= 7; degree++) {
    const natural = SCALE_SEMITONES[degree]!;
    const octave = Math.floor((relative - natural + 6) / 12);
    const accidental = relative - natural - octave * 12;
    const score = Math.abs(accidental) * 10 + (preferredFlat ? (accidental > 0 ? 1 : 0) : accidental < 0 ? 1 : 0);
    if (Math.abs(accidental) <= 2 && score < bestScore) {
      best = { degree, accidental, octave };
      bestScore = score;
    }
  }
  return best ?? { degree: 1, accidental: 0, octave: Math.round(relative / 12) };
}

function durationParts(beats: number): number[] {
  const parts: number[] = [];
  let remaining = Math.max(0.125, Math.round(beats * 8) / 8);
  while (remaining > EPSILON) {
    const value = DURATION_VALUES.find((candidate) => candidate <= remaining + EPSILON) ?? 0.125;
    parts.push(value);
    remaining = Math.max(0, remaining - value);
  }
  return parts;
}

export function durationAppearance(beats: number): Pick<JianpuAtom, 'underlineCount' | 'dotted' | 'extensionCount'> {
  const rounded = Math.round(beats * 8) / 8;
  if (rounded >= 1) {
    if (Math.abs(rounded - 1.5) < EPSILON) return { underlineCount: 0, dotted: true, extensionCount: 0 };
    if (Math.abs(rounded - 3) < EPSILON) return { underlineCount: 0, dotted: true, extensionCount: 1 };
    return { underlineCount: 0, dotted: false, extensionCount: Math.max(0, Math.round(rounded) - 1) };
  }
  const dotted = [0.75, 0.375, 0.1875].some((value) => Math.abs(rounded - value) < EPSILON);
  const base = dotted ? rounded / 1.5 : rounded;
  const underlineCount = Math.max(1, Math.round(Math.log2(1 / base)));
  return { underlineCount, dotted, extensionCount: 0 };
}

function chordDegreeToSemitone(token: string): number {
  const match = token.match(/^([1-7])([#b]?)/);
  if (!match) return 0;
  const degree = Number(match[1]);
  return SCALE_SEMITONES[degree]! + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
}

/** 把 dapume 的级数和弦名同时转换为读谱者熟悉的字母和弦名。 */
export function chordDisplayName(sourceName: string, section: DapumeSection): string {
  const slash = sourceName.indexOf('/');
  const main = slash >= 0 ? sourceName.slice(0, slash) : sourceName;
  const bass = slash >= 0 ? sourceName.slice(slash + 1) : '';
  const root = main.match(/^([1-7][#b]?)/)?.[0] ?? '1';
  let suffix = main.slice(root.length);
  suffix = suffix
    .replace(/^mM(?=7|9|11|13)/, 'm(maj)')
    .replace(/^M(?=7|9|11|13)/, 'maj')
    .replace(/^dim/, 'dim')
    .replace(/^aug/, 'aug')
    .replace(/b(?=\d)/g, '♭')
    .replace(/#(?=\d)/g, '♯');
  const rootNames = root.includes('b') || (section.key.includes('b') && !root.includes('#')) ? FLAT_NAMES : SHARP_NAMES;
  const bassNames = bass.includes('b') || (section.key.includes('b') && !bass.includes('#')) ? FLAT_NAMES : SHARP_NAMES;
  const rootName = rootNames[positiveMod(section.tonic + chordDegreeToSemitone(root), 12)]!;
  const bassName = bass ? bassNames[positiveMod(section.tonic + chordDegreeToSemitone(bass), 12)]! : '';
  return `${rootName}${suffix}${bassName ? `/${bassName}` : ''}`;
}

function groupEvents(events: DapumeEvent[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const event of events) {
    const key = [
      event.trackNo,
      event.startBeat.toFixed(6),
      event.durationBeats.toFixed(6),
      event.isChord ? 1 : 0,
      event.isRest ? 1 : 0,
      event.srcStart,
      event.srcEnd,
    ].join(':');
    const existing = groups.get(key);
    if (existing) {
      if (event.pitch !== null && !existing.pitches.includes(event.pitch)) existing.pitches.push(event.pitch);
      continue;
    }
    groups.set(key, {
      trackNo: event.trackNo,
      startBeat: event.startBeat,
      durationBeats: event.durationBeats,
      pitches: event.pitch === null ? [] : [event.pitch],
      isRest: event.isRest,
      isChord: event.isChord,
      srcStart: event.srcStart,
      srcEnd: event.srcEnd,
    });
  }
  return [...groups.values()].sort((a, b) => a.startBeat - b.startBeat || a.trackNo - b.trackNo);
}

function assignLanes(atoms: JianpuAtom[]): number {
  const laneEnds: number[] = [];
  for (const atom of atoms.sort((a, b) => a.offsetBeat - b.offsetBeat || b.durationBeats - a.durationBeats)) {
    let lane = laneEnds.findIndex((end) => end <= atom.offsetBeat + EPSILON);
    if (lane < 0) lane = laneEnds.length;
    atom.lane = lane;
    laneEnds[lane] = atom.offsetBeat + atom.durationBeats;
  }
  return Math.max(1, laneEnds.length);
}

export function buildJianpuDocument(score: DapumeScore, source: string): JianpuDocument {
  const count = measureCount(score.durationBeats);
  if (count === 0) return { measures: [], tracks: [] };

  const atomsByMeasureTrack = new Map<string, JianpuAtom[]>();
  const trackKinds = new Map<number, boolean>();
  for (const group of groupEvents(score.events)) {
    trackKinds.set(group.trackNo, (trackKinds.get(group.trackNo) ?? false) || group.isChord);
    const endBeat = group.startBeat + group.durationBeats;
    let cursor = group.startBeat;
    let partIndex = 0;
    const chordSource = group.isChord ? source.slice(group.srcStart + 1, Math.max(group.srcStart + 1, group.srcEnd - 1)) : undefined;
    while (cursor < endBeat - EPSILON) {
      const measure = Math.floor((cursor + EPSILON) / BEATS_PER_MEASURE) + 1;
      const measureEnd = measure * BEATS_PER_MEASURE;
      const segmentDuration = Math.min(endBeat, measureEnd) - cursor;
      const parts = durationParts(segmentDuration);
      for (const part of parts) {
        const section = sectionAtBeat(score.sections, cursor);
        const pitches = group.isRest
          ? []
          : group.pitches
              .map((pitch) =>
                group.isChord
                  ? pitchFromMidi(pitch, section)
                  : pitchFromSource(group, pitch, source, section) ?? pitchFromMidi(pitch, section),
              )
              .sort((a, b) => b.octave - a.octave || b.degree - a.degree || b.accidental - a.accidental);
        const hasPrevious = cursor > group.startBeat + EPSILON;
        const hasNext = cursor + part < endBeat - EPSILON;
        const atom: JianpuAtom = {
          id: `${group.trackNo}-${group.srcStart}-${group.startBeat}-${partIndex}`,
          trackNo: group.trackNo,
          measure,
          absoluteBeat: cursor,
          offsetBeat: cursor - (measure - 1) * BEATS_PER_MEASURE,
          durationBeats: part,
          pitches,
          isRest: group.isRest,
          isChord: group.isChord,
          chordName: chordSource && !hasPrevious ? chordDisplayName(chordSource, section) : undefined,
          chordSource: !hasPrevious ? chordSource : undefined,
          sourceRanges: [{ from: group.srcStart, to: group.srcEnd }],
          tieFromPrevious: !group.isRest && hasPrevious,
          tieToNext: !group.isRest && hasNext,
          ...durationAppearance(part),
          lane: 0,
        };
        const key = `${measure}:${group.trackNo}`;
        const bucket = atomsByMeasureTrack.get(key) ?? [];
        bucket.push(atom);
        atomsByMeasureTrack.set(key, bucket);
        cursor += part;
        partIndex += 1;
      }
    }
  }

  const tracks = [...trackKinds]
    .map(([trackNo, isChord]) => ({ trackNo, isChord }))
    .sort((a, b) => a.trackNo - b.trackNo);
  const measures: JianpuMeasure[] = [];
  for (let number = 1; number <= count; number++) {
    const voices = tracks.map((track) => {
      const atoms = atomsByMeasureTrack.get(`${number}:${track.trackNo}`) ?? [];
      return { ...track, atoms, laneCount: assignLanes(atoms) };
    });
    const startBeat = (number - 1) * BEATS_PER_MEASURE;
    const endBeat = number * BEATS_PER_MEASURE;
    const sections = score.sections
      .filter((section) => section.startBeat >= startBeat - EPSILON && section.startBeat < endBeat - EPSILON)
      .map((section) => ({ ...section, offsetBeat: section.startBeat - startBeat }));
    measures.push({ number, voices, sections });
  }
  return { measures, tracks };
}

export function atomIsActive(
  atom: JianpuAtom,
  activeRanges: readonly { from: number; to: number }[],
  activeBeat?: number | null,
): boolean {
  if (
    activeBeat != null &&
    (activeBeat < atom.absoluteBeat - PLAYBACK_EPSILON_BEATS ||
      activeBeat >= atom.absoluteBeat + atom.durationBeats - PLAYBACK_EPSILON_BEATS)
  ) {
    return false;
  }
  return atom.sourceRanges.some((sourceRange) =>
    activeRanges.some((active) => active.from === sourceRange.from && active.to === sourceRange.to),
  );
}
