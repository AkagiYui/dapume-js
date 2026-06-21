import { describe, expect, it } from 'vitest';
import { activeEventsAt, parse } from 'dapume-js';

import { atomIsActive, buildJianpuDocument, chordDisplayName, durationAppearance } from './jianpu';
import { beatAtTime } from './measures';

describe('简谱渲染模型', () => {
  it('按 4/4 拍拆分小节，并把跨小节音符连接起来', () => {
    const source = '1=C 120bpm\n1+2-';
    const doc = buildJianpuDocument(parse(source), source);
    expect(doc.measures).toHaveLength(2);
    const first = doc.measures[0]!.voices[0]!.atoms[0]!;
    const second = doc.measures[1]!.voices[0]!.atoms[0]!;
    expect(first.durationBeats).toBe(4);
    expect(first.tieToNext).toBe(false);
    expect(second.offsetBeat).toBe(0);
  });

  it('一个 6 拍音符跨小节时生成延音记号', () => {
    const source = '1=C\n1+=';
    const doc = buildJianpuDocument(parse(source), source);
    const first = doc.measures[0]!.voices[0]!.atoms[0]!;
    const second = doc.measures[1]!.voices[0]!.atoms[0]!;
    expect(first.durationBeats).toBe(4);
    expect(first.tieToNext).toBe(true);
    expect(second.durationBeats).toBe(2);
    expect(second.tieFromPrevious).toBe(true);
    const ranges = first.sourceRanges;
    expect(atomIsActive(first, ranges, 1)).toBe(true);
    expect(atomIsActive(second, ranges, 1)).toBe(false);
    expect(atomIsActive(first, ranges, 4.5)).toBe(false);
    expect(atomIsActive(second, ranges, 4.5)).toBe(true);
  });

  it('保留休止符、和弦名与多声部', () => {
    const source = '1=C\n[4M7]10\n(3.5.)';
    const doc = buildJianpuDocument(parse(source), source);
    expect(doc.tracks).toHaveLength(3);
    const atoms = doc.measures.flatMap((measure) => measure.voices.flatMap((voice) => voice.atoms));
    expect(atoms.some((atom) => atom.isRest)).toBe(true);
    const chord = atoms.find((atom) => atom.isChord)!;
    expect(chord.chordName).toBe('Fmaj7');
    expect(chord.chordSource).toBe('4M7');
    expect(new Set(chord.pitches.map((pitch) => `${pitch.accidental}:${pitch.degree}`)).size).toBe(4);
  });

  it('同一音轨的同时音使用独立纵向层，保持相同拍位', () => {
    const source = '1=C\n12(34)';
    const voice = buildJianpuDocument(parse(source), source).measures[0]!.voices[0]!;
    expect(voice.laneCount).toBe(2);
    expect(voice.atoms.filter((atom) => atom.offsetBeat === 0)).toHaveLength(2);
    expect(voice.atoms.filter((atom) => atom.offsetBeat === 0.5)).toHaveLength(2);
  });

  it('把八分、附点八分与长音转换为常用时值外观', () => {
    expect(durationAppearance(0.5)).toEqual({ underlineCount: 1, dotted: false, extensionCount: 0 });
    expect(durationAppearance(0.75)).toEqual({ underlineCount: 1, dotted: true, extensionCount: 0 });
    expect(durationAppearance(3)).toEqual({ underlineCount: 0, dotted: true, extensionCount: 1 });
  });

  it('和弦级数随调号转换为字母和弦', () => {
    expect(chordDisplayName('5m7/7b', { startTime: 0, startBeat: 0, tonic: 60, bpm: 120, key: 'C' })).toBe('Gm7/B♭');
  });

  it('播放中的源事件能映射到同一拍位的简谱原子', () => {
    const source = [
      '1=D 90bpm',
      '5,6,1',
      '[4M7]2~1[37]21[3/5#]3-',
      '[6m]21~[6m7/5]0123',
      '[2m7]5~3[57sus]216,5,',
      '[1M7/3]3=*356',
      '[5m/7b]3~2[4/6]21[6/1#]3-',
    ].join('\n');
    const score = parse(source);
    const atoms = buildJianpuDocument(score, source).measures.flatMap((measure) =>
      measure.voices.flatMap((voice) => voice.atoms),
    );
    const event = score.events.find((item) => source.slice(item.srcStart, item.srcEnd).includes('[5m/7b]'))!;
    const time = event.startTime;
    const beat = beatAtTime(time, score.sections);
    const ranges = activeEventsAt(score, time).map((item) => ({ from: item.srcStart, to: item.srcEnd }));
    expect(atoms.some((atom) => atomIsActive(atom, ranges, beat))).toBe(true);
  });
});
