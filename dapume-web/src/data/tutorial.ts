/**
 * 教程页内容：循序渐进地从「一个音符」搭到「双手多轨谱」，每步一个可播放示例。
 * 复用 guide.ts 的 GuideSection 结构与本地化工具 L。
 */
import { L, type GuideSection } from './guide';

export const TUTORIAL_SECTIONS: GuideSection[] = [
  {
    id: 't-pitch',
    title: L('音高：1~7 与休止', 'Pitch: 1–7 and rests'),
    paragraphs: {
      zh: [
        '音符行用数字 1~7 表示 do re mi fa sol la si 七个音，数字 0 表示休止（不发声）。',
        '把它们顺着写下来就是一段旋律。播放下面这段上行音阶听听看：',
      ],
      en: [
        'A note line uses the digits 1–7 for do re mi fa sol la ti; the digit 0 is a rest (silent).',
        'Write them in a row to make a melody. Play this ascending scale:',
      ],
    },
    examples: [
      { code: '1=C 100bpm\n1234567', caption: L('do re mi fa sol la si', 'do re mi fa sol la ti') },
      { code: '1=C 100bpm\n1234 0 4321', caption: L('上行 → 休止 → 下行', 'up → rest → down') },
    ],
  },
  {
    id: 't-octave',
    title: L('升降与八度', 'Accidentals & octaves'),
    paragraphs: {
      zh: [
        '在音符后加后缀改变音高：. 升一个八度，, 降一个八度；# 升半音，b 降半音。后缀可叠加。',
        '例如 1. 是高八度的 do，1, 是低八度的 do，1# 是升 do。',
      ],
      en: [
        'Suffixes after a note change its pitch: . raises an octave, , lowers one; # is a semitone up, b a semitone down. They stack.',
        'For example 1. is do an octave up, 1, is do an octave down, 1# is do-sharp.',
      ],
    },
    examples: [
      { code: '1=C 100bpm\n1 1. 1,', caption: L('中音 / 高八度 / 低八度的 do', 'mid / +octave / −octave do') },
      { code: '1=C 100bpm\n1 1# 2 3 3b', caption: L('夹带升降半音的旋律', 'a melody with sharps and flats') },
    ],
  },
  {
    id: 't-duration',
    title: L('时值（音符长短）', 'Duration (note length)'),
    paragraphs: {
      zh: [
        '不写后缀时每个音默认 0.5 拍。时值后缀可以拉长或缩短：- 是 1 拍、~ 是 1.5 拍、= 是 2 拍；* 是 0.5 拍、^ 是 0.25 拍。',
        '后缀也能叠加，例如 =- 就是 2+1=3 拍。下面对比同一个 do 的不同长短：',
      ],
      en: [
        'With no suffix each note is 0.5 beat. Duration suffixes lengthen or shorten it: - is 1 beat, ~ is 1.5, = is 2; * is 0.5, ^ is 0.25.',
        'They stack too, e.g. =- is 2+1 = 3 beats. Compare the same do at different lengths:',
      ],
    },
    examples: [
      { code: '1=C 100bpm\n1 1- 1~ 1=', caption: L('0.5 / 1 / 1.5 / 2 拍的 do', 'do at 0.5 / 1 / 1.5 / 2 beats') },
      { code: '1=C 100bpm\n1-2-3-4-5=', caption: L('四个一拍音 + 一个两拍音', 'four 1-beat notes + one 2-beat note') },
    ],
  },
  {
    id: 't-param',
    title: L('配置行（调式与速度）', 'Config line (key & tempo)'),
    paragraphs: {
      zh: [
        '单独一行「参数行」用来设定调式和速度，从下一行起生效。调式以 1= 开头（如 1=G），速度以数字加 bpm 结尾（如 90bpm）。',
        '同一段乐谱可以多次换调或变速。下面同样的 12345，先 C 大调、后切到 G 大调并放慢：',
      ],
      en: [
        'A standalone "parameter line" sets key and tempo, effective from the next line. A key starts with 1= (e.g. 1=G); a tempo is digits + bpm (e.g. 90bpm).',
        'You can change key or tempo several times. Below, the same 12345 in C major, then switched to G major and slower:',
      ],
    },
    examples: [
      { code: '1=C 120bpm\n12345\n1=G 80bpm\n12345', caption: L('同样的 12345，换调又变速', 'same 12345, new key and tempo') },
    ],
  },
  {
    id: 't-simul',
    title: L('同时音（括号）', 'Simultaneous notes (parentheses)'),
    paragraphs: {
      zh: [
        '想让几个音「同时」响，就在同一行里用圆括号 () 把它们括在主音符后面。括号里的音会与前面的旋律一起落下，叠在同一条音轨上。',
        '例如 1(3)(5) 让 do、mi、sol 同时发声，组成一个柱式和声。',
      ],
      en: [
        'To sound notes together, wrap them in parentheses () on the same line after the main note. They land together with the melody, stacked on the same track.',
        'For instance 1(3)(5) sounds do, mi, sol at once — a block chord.',
      ],
    },
    examples: [
      { code: '1=C 100bpm\n1(3)(5)', caption: L('do + mi + sol 同时（柱式和声）', 'do + mi + sol together (block chord)') },
      { code: '1=C 100bpm\n1(3)2(4)3(5)', caption: L('旋律每个音都叠一个三度音', 'each melody note paired with a third') },
    ],
  },
  {
    id: 't-chord',
    title: L('和弦', 'Chords'),
    paragraphs: {
      zh: [
        '方括号 [] 里写一个和弦记号，程序会自动补全整组和弦音，并持续到下一个和弦。记号是「级数 + 类型」，如 [1] 一级大三和弦、[5] 五级、[6m] 六级小三和弦、[4M7] 四级大七和弦。',
        '和弦最常用来给旋律配伴奏：',
      ],
      en: [
        'Inside square brackets [] write a chord symbol; the app fills in the whole chord and sustains it until the next one. A symbol is degree + type, e.g. [1] the I major triad, [5] the V, [6m] the vi minor, [4M7] the IV major-7th.',
        'Chords are most often used to accompany a melody:',
      ],
    },
    examples: [
      { code: '1=C 90bpm\n[1]1234[5]567', caption: L('和弦伴奏的旋律', 'a melody with chordal accompaniment') },
      { code: '1=C 80bpm\n[1]1+[6m]1+[4]1+[5]1+', caption: L('I–vi–IV–V 和弦进行', 'I–vi–IV–V progression') },
    ],
  },
  {
    id: 't-multitrack',
    title: L('多轨谱（双手谱）', 'Multi-track (two-hand)'),
    paragraphs: {
      zh: [
        '前面的括号都在「一行之内」，是同时音。如果把「一整行」用括号完整包起来，这一行就变成一条新音轨，与它上面那行同时开始——正好对应钢琴的左右手。',
        '于是搭一段双手谱很简单：先写右手旋律行，再在它下面加一条整行括号的左手伴奏行，两行便会并行演奏。',
      ],
      en: [
        'The parentheses so far were inside one line (simultaneous notes). Wrap a whole line in parentheses and it becomes a new track that starts together with the line above — exactly like a piano’s two hands.',
        'So a two-hand passage is easy: write the right-hand melody line, then add a fully-bracketed left-hand line below it; the two play in parallel.',
      ],
    },
    examples: [
      {
        code: '1=C 120bpm\n1111111\n(2222222)\n3333333\n(4444444)',
        caption: L('入门示例：两条音轨并行', 'starter: two parallel tracks'),
      },
      {
        code: '1=C 90bpm\n1-1-5-5-6-6-5=\n(1,-5,-1,-5,-1,-5,-1,-5,-)',
        caption: L('右手「小星星」+ 左手低音伴奏', 'right-hand “Twinkle” + left-hand bass'),
      },
    ],
  },
];
