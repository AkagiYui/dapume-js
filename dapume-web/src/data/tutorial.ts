/**
 * 教程页内容：先用完整旋律建立“写出来就能听”的直觉，再进入和声与多轨。
 * 示例音符连续书写；需要说明时，行尾注释与正文之间固定留两个空格。
 */
import orchid from './templates/orchid_pavilion.txt?raw';
import { L, type GuideSection } from './guide';

export const TUTORIAL_SECTIONS: GuideSection[] = [
  {
    id: 't-pitch-duration',
    title: L('音高与时值', 'Pitch and duration'),
    paragraphs: {
      zh: [
        '先认识音符：数字 1~7 表示 do 到 si，0 表示休止。把音符连续写在一起，就是一段可以直接播放的旋律。',
        '下面是《欢乐颂》。先不必记规则，点播放，观察数字如何随着旋律逐个高亮。',
        '接着认识时值：音符默认半拍，-、~、= 等后缀可以把它延长；《小星星》和《小步舞曲》展示了句尾延长与长短组合。',
        '然后改变音高：. 与 , 升降八度，# 与 b 升降半音。《卡农》会把这些记号放进一段完整旋律。',
        '最后是参数行：1=D 设置调性，122bpm 设置速度。到这里，你已经可以演奏大约 70% 的旋律曲目了，试着播放《鸟之诗》。',
      ],
      en: [
        'Start with notes: digits 1–7 represent do through ti, and 0 is a rest. Write notes continuously to make a playable melody.',
        'Here is “Ode to Joy”. Play it first and watch the digits highlight with the melody.',
        'Next, learn duration: a note is half a beat by default, while suffixes such as -, ~, and = lengthen it. “Twinkle, Twinkle” and “Minuet” demonstrate phrase endings and mixed lengths.',
        'Then change pitch: . and , move by octaves, while # and b move by semitones. “Canon” puts them into a complete melody.',
        'Finally, a parameter line sets the key with 1=D and tempo with 122bpm. You can now play roughly 70% of melody-only songs—try “Tori no Uta”.',
      ],
    },
    examples: [
      {
        code: '1=C 120bpm\n3345543211233220\n3345543211232110',
        caption: L('《欢乐颂》：音符与休止', '“Ode to Joy”: notes and rests'),
      },
      {
        code: '1=C 120bpm\n1155665-\n4433221-',
        caption: L('《小星星》：用 - 延长句尾', '“Twinkle, Twinkle”: lengthen phrase endings with -'),
      },
      {
        code: '1=C 120bpm\n5-12345-10106-45671.-1010\n4-54323-43217,-12312~~',
        caption: L('《小步舞曲》：组合不同的时值', '“Minuet”: combine different note lengths'),
      },
      {
        code: '1=C 120bpm\n5.-3.4.5.-3.4.5.5671.2.3.4.\n3.-1.2.3.-3456545345\n4-654-3232123456\n4-656-71.5671.2.3.4.5.',
        caption: L('《卡农》：用 . , # b 改变八度与升降', '“Canon”: change octaves and accidentals with . , # b'),
      },
      {
        code: '1=D 122bpm\n6,-7,153-32^3^=-\n23527,17,-7,6,^3,^=~\n6,-7,153-32^3^=-\n235351.7*^6*^3^=\n23-5-6-7-',
        caption: L('《鸟之诗》：参数行设定调性与速度', '“Tori no Uta”: set key and tempo on the parameter line'),
      },
    ],
  },
  {
    id: 't-harmony-tracks',
    title: L('同时音、和弦与多轨谱', 'Simultaneous notes, chords, and multiple tracks'),
    paragraphs: {
      zh: [
        '接下来给旋律增加层次：圆括号 () 写同时音，方括号 [] 写和弦。所有方括号和弦会统一进入独立的和弦音轨。',
        '《兰亭序》展示了旋律与和弦的完整配合；如果需要左右手或多个声部，再把整条音符行用圆括号包住，建立并行音轨。',
      ],
      en: [
        'Next, add depth with simultaneous notes in parentheses () and chords in square brackets []. All square-bracket chords share a dedicated chord track.',
        '“Orchid Pavilion” demonstrates melody and chord accompaniment. Wrap a whole note line in parentheses to create a parallel part for two-hand or multi-voice scores.',
      ],
    },
    examples: [
      {
        code: '1=C 100bpm\n1(3)(5)2(4)(6)3(5)(7)',
        caption: L('圆括号：在旋律上叠加同时音', 'Parentheses: layer simultaneous notes over the melody'),
      },
      {
        code: orchid.trimEnd(),
        caption: L('《兰亭序》：旋律 + 独立和弦音轨', '“Orchid Pavilion”: melody + a dedicated chord track'),
      },
      {
        code: '1=C 120bpm\n1155665-\n(1,-5,-1,-5,-1,-5,-1,-)\n4433221-\n(4,-3,-2,-1,-7,,-6,,-5,,-1,-)',
        caption: L('整行圆括号：左右手并行的多轨谱', 'Whole-line parentheses: parallel right- and left-hand tracks'),
      },
    ],
  },
  {
    id: 't-coming-soon',
    title: L('更多节奏与演奏法即将上线', 'More rhythms and articulations are coming'),
    paragraphs: {
      zh: [
        '三连音、琶音等更丰富的节奏与演奏法正在设计中，即将上线。现在可以先用工作台完成旋律、和弦与多轨编排。',
      ],
      en: [
        'Triplets, arpeggios, and more expressive rhythm and articulation tools are in development. For now, the workbench covers melodies, chords, and multi-track arrangements.',
      ],
    },
    examples: [],
  },
];
