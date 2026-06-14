/**
 * 分词器与便捷 API 测试。
 */
import { describe, expect, it } from 'vitest';
import { activeNotesAt, parse, tokenize } from '../src/index';

describe('tokenize 语法分词', () => {
  it('识别参数行的调号与速度', () => {
    const tokens = tokenize('1=C 120bpm\n1234567');
    const key = tokens.find((t) => t.type === 'key');
    const bpm = tokens.find((t) => t.type === 'bpm');
    expect(key).toEqual({ type: 'key', start: 0, end: 3, value: '1=C' });
    expect(bpm).toEqual({ type: 'bpm', start: 4, end: 10, value: '120bpm' });
  });

  it('音符与休止符分别标注', () => {
    const tokens = tokenize('1234567');
    expect(tokens.map((t) => t.type)).toEqual(Array(7).fill('note'));
    expect(tokens.map((t) => t.value)).toEqual(['1', '2', '3', '4', '5', '6', '7']);

    const rest = tokenize('0').find((t) => t.type === 'rest');
    expect(rest).toEqual({ type: 'rest', start: 0, end: 1, value: '0' });
  });

  it('音高/时值修饰符与括号', () => {
    const types = tokenize('5#-(3)').map((t) => t.type);
    expect(types).toEqual(['note', 'pitch-mod', 'duration-mod', 'bracket', 'note', 'bracket']);
  });

  it('和弦记号作为整体单元', () => {
    const tokens = tokenize('1=C\n[4M7]2');
    const chord = tokens.find((t) => t.type === 'chord');
    expect(chord).toEqual({ type: 'chord', start: 4, end: 9, value: '[4M7]' });
  });
});

describe('activeNotesAt', () => {
  it('返回某时刻正在发声的音符', () => {
    const score = parse('1=C 120bpm\n1234567');
    // t=300ms 时，第二个音符（62，250~500ms）正在发声
    const active = activeNotesAt(score, 300);
    expect(active.map((n) => n.pitch)).toEqual([62]);
  });

  it('和弦与旋律同时发声', () => {
    const score = parse('1=C 120bpm\n[1]1234[5]567');
    // t=100ms：旋律第一个音(60) + [1] 和弦三音(48,52,55)
    const active = activeNotesAt(score, 100).map((n) => n.pitch).sort((a, b) => a - b);
    expect(active).toEqual([48, 52, 55, 60]);
  });
});
