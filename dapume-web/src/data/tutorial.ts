/**
 * 教程页内容：每讲一个概念，立即跟一个可播放例子，避免讲解与示例分成两大坨。
 * 示例音符连续书写；需要说明时，行尾注释与正文之间固定留两个空格。
 */
import orchid from './templates/orchid_pavilion.txt?raw';
import { L, type GuideSection } from './guide';

export const TUTORIAL_SECTIONS: GuideSection[] = [
  {
    id: 't-pitch-duration',
    title: L('音高与时值', 'Pitch and duration'),
    paragraphs: { zh: [], en: [] },
    examples: [],
    flow: [
      {
        type: 'text',
        text: L(
          '先认识音符：数字 1~7 表示 do 到 si，0 表示休止。音符之间不用空格，连续写下去就是旋律。先听《欢乐颂》，观察数字如何逐个高亮。',
          'Start with notes: digits 1–7 represent do through ti, and 0 is a rest. Notes need no spaces. Play “Ode to Joy” and watch each digit highlight.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=C 120bpm\n3345543211233220\n3345543211232110',
          caption: L('《欢乐颂》：音符与休止', '“Ode to Joy”: notes and rests'),
        },
      },
      {
        type: 'text',
        text: L(
          '接着认识时值。音符默认半拍，-、~、= 等后缀可以把它延长。《小星星》先展示最常用的句尾延长。',
          'Next comes duration. Notes default to half a beat; suffixes such as -, ~, and = make them longer. “Twinkle, Twinkle” starts with simple phrase endings.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=C 120bpm\n1155665-\n4433221-',
          caption: L('《小星星》：用 - 延长句尾', '“Twinkle, Twinkle”: lengthen phrase endings with -'),
        },
      },
      {
        type: 'text',
        text: L(
          '时值后缀可以组合。《小步舞曲》把短音、长音和休止放在同一段里，听起来会更有句法。',
          'Duration suffixes can be combined. “Minuet” mixes short notes, long notes, and rests into more articulated phrases.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=C 120bpm\n5-12345-10106-45671.-1010\n4-54323-43217,-12312~~',
          caption: L('《小步舞曲》：组合不同的时值', '“Minuet”: combine different note lengths'),
        },
      },
      {
        type: 'text',
        text: L(
          '然后改变音高：. 与 , 升降八度，# 与 b 升降半音。《卡农》会把这些记号自然地放进完整旋律。',
          'Now change pitch: . and , move by octaves, while # and b move by semitones. “Canon” uses them naturally in a full melody.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=C 120bpm\n5.-3.4.5.-3.4.5.5671.2.3.4.\n3.-1.2.3.-3456545345\n4-654-3232123456\n4-656-71.5671.2.3.4.5.',
          caption: L('《卡农》：改变八度与升降', '“Canon”: change octaves and accidentals'),
        },
      },
      {
        type: 'text',
        text: L(
          '最后是参数行：1=D 设置调性，122bpm 设置速度。到这里，你已经可以演奏大约 70% 的旋律曲目了，试试《鸟之诗》。',
          'Finally, a parameter line sets the key with 1=D and tempo with 122bpm. You can now play roughly 70% of melody-only songs—try “Tori no Uta”.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=D 122bpm\n6,-7,153-32^3^=-\n23527,17,-7,6,^3,^=~\n6,-7,153-32^3^=-\n235351.7*^6*^3^=\n23-5-6-7-',
          caption: L('《鸟之诗》：参数行设定调性与速度', '“Tori no Uta”: set key and tempo'),
        },
      },
    ],
  },
  {
    id: 't-harmony-tracks',
    title: L('同时音、和弦与多轨谱', 'Simultaneous notes, chords, and multiple tracks'),
    paragraphs: { zh: [], en: [] },
    examples: [],
    flow: [
      {
        type: 'text',
        text: L(
          '圆括号 () 可以把其它音叠在旋律上，让多个音同时响起。',
          'Parentheses () layer extra notes over the melody so several notes sound together.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=C 100bpm\n1(3)(5)2(4)(6)3(5)(7)',
          caption: L('圆括号：在旋律上叠加同时音', 'Parentheses: layer simultaneous notes'),
        },
      },
      {
        type: 'text',
        text: L(
          '方括号 [] 写和弦，所有方括号和弦会进入同一条独立的和弦音轨。《兰亭序》展示旋律与和弦的完整配合。',
          'Square brackets [] write chords, all collected into one dedicated chord track. “Orchid Pavilion” demonstrates melody with chord accompaniment.',
        ),
      },
      {
        type: 'example',
        example: {
          code: orchid.trimEnd(),
          caption: L('《兰亭序》：旋律 + 独立和弦音轨', '“Orchid Pavilion”: melody + a chord track'),
        },
      },
      {
        type: 'text',
        text: L(
          '如果需要左右手或多个声部，把整条音符行用圆括号包住，就能建立与上一条旋律并行的音轨。',
          'For two hands or multiple voices, wrap an entire note line in parentheses to create a track parallel to the melody above it.',
        ),
      },
      {
        type: 'example',
        example: {
          code: '1=C 120bpm\n1155665-\n(1,-5,-1,-5,-1,-5,-1,-)\n4433221-\n(4,-3,-2,-1,-7,,-6,,-5,,-1,-)',
          caption: L('整行圆括号：左右手并行的多轨谱', 'Whole-line parentheses: parallel two-hand tracks'),
        },
      },
    ],
  },
  {
    id: 't-coming-soon',
    title: L('更多节奏与演奏法即将上线', 'More rhythms and articulations are coming'),
    paragraphs: { zh: [], en: [] },
    examples: [],
    flow: [
      {
        type: 'text',
        text: L(
          '三连音、琶音等更丰富的节奏与演奏法正在设计中，即将上线。现在可以先用工作台完成旋律、和弦与多轨编排。',
          'Triplets, arpeggios, and richer articulations are in development. For now, the workbench covers melodies, chords, and multi-track arrangements.',
        ),
      },
    ],
  },
];
