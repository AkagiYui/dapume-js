/**
 * 规则与语法页（指南）内容。所有文本中英双语，示例可点击播放。
 */
import type { Locale } from '~/stores/settings';

/** 本地化字符串。 */
export type L10n = Record<Locale, string>;

/** 构造本地化字符串；省略 en 时中英相同（用于语言无关的记号）。 */
export function L(zh: string, en?: string): L10n {
  return { zh, en: en ?? zh };
}

export interface GuideExample {
  code: string;
  caption: L10n;
}

export interface RefTable {
  headers: Record<Locale, string[]>;
  /** rows[r][c] 为一个本地化单元格。 */
  rows: L10n[][];
}

export interface GuideSection {
  id: string;
  title: L10n;
  paragraphs: Record<Locale, string[]>;
  table?: RefTable;
  examples: GuideExample[];
}

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'intro',
    title: L('什么是线性乐谱', 'What is a linear score'),
    paragraphs: {
      zh: [
        '线性乐谱（dapume）是一种用 ASCII 字符书写简单乐谱的方式，再由程序渲染为 MIDI。',
        '它的每一行要么是「参数行」（修改调号、速度等演奏参数），要么是「音符行」（描述音符）。',
      ],
      en: [
        'A linear score (dapume) is a way to write simple music with ASCII characters, then render it to MIDI.',
        'Each line is either a "parameter line" (key, tempo, …) or a "note line" (the actual notes).',
      ],
    },
    examples: [
      {
        code: '1=C 120bpm\n1234567',
        caption: L('C 大调、120bpm 的一段上行音阶', 'An ascending scale in C major at 120bpm'),
      },
    ],
  },
  {
    id: 'param',
    title: L('参数行', 'Parameter lines'),
    paragraphs: {
      zh: [
        '参数行修改演奏参数，自下一行起生效。不同参数用空格连接、无顺序、大小写敏感。',
        '调号以 1= 开头，后接 CDEFGAB 之一，可再接 #b., 表示半音与八度；BPM 以数字开头、bpm 结尾。',
        '若未指定某项参数，则继承之前的值；首行未指定时默认 1=C 120bpm。',
      ],
      en: [
        'Parameter lines change playback settings, effective from the next line. Parameters are space-separated, order-free and case-sensitive.',
        'A key starts with 1= followed by one of CDEFGAB, optionally #b., for semitone/octave; BPM is digits ending in bpm.',
        'Unspecified parameters are inherited; the default for the first line is 1=C 120bpm.',
      ],
    },
    table: {
      headers: { zh: ['参数', '格式', '示例'], en: ['Parameter', 'Format', 'Example'] },
      rows: [
        [L('调号', 'Key'), L('1=CDEFGAB[#b.,]*'), L('1=C / 1=Bb.')],
        [L('速度', 'Tempo'), L('<number>bpm'), L('120bpm')],
      ],
    },
    examples: [
      { code: '1=G 90bpm\n12345', caption: L('G 大调，90bpm', 'G major, 90bpm') },
      {
        code: '1=C\n123\n1=A 80bpm\n123',
        caption: L('中途切换调号与速度', 'Switching key and tempo midway'),
      },
    ],
  },
  {
    id: 'note',
    title: L('音符行', 'Note lines'),
    paragraphs: {
      zh: [
        '与简谱相同，用 1~7 表示七个音符，0 表示休止符。音符后可叠加后缀表示音高与时值，后缀可叠加、无顺序。',
        '无时值后缀时默认 0.5 拍；时值后缀可组合，例如 3 拍可写作 ~~ 或 =-。',
      ],
      en: [
        'Like numbered notation, 1–7 are the seven notes and 0 is a rest. Suffixes (stackable, order-free) set pitch and duration.',
        'Without a duration suffix a note is 0.5 beat; durations combine, e.g. 3 beats is ~~ or =-.',
      ],
    },
    table: {
      headers: {
        zh: ['音高', '含义', '时值', '含义'],
        en: ['Pitch', 'Meaning', 'Duration', 'Meaning'],
      },
      rows: [
        [L('#'), L('升半音', '+semitone'), L('-'), L('1 拍', '1 beat')],
        [L('b'), L('降半音', '-semitone'), L('~'), L('1.5 拍', '1.5 beats')],
        [L('.'), L('升八度', '+octave'), L('='), L('2 拍', '2 beats')],
        [L(','), L('降八度', '-octave'), L('+'), L('4 拍', '4 beats')],
        [L(''), L(''), L('*'), L('0.5 拍', '0.5 beat')],
        [L(''), L(''), L('^'), L('0.25 拍', '0.25 beat')],
        [L(''), L(''), L("'"), L('0.125 拍', '0.125 beat')],
      ],
    },
    examples: [
      {
        code: '1=C\n5-1.-1=*',
        caption: L('1 拍 sol、1 拍高八度 do、2.5 拍 do', '1-beat sol, 1-beat high do, 2.5-beat do'),
      },
      {
        code: '1=C 100bpm\n1#1b1.1,',
        caption: L('升半音、降半音、升八度、降八度', 'sharp, flat, octave up, octave down'),
      },
    ],
  },
  {
    id: 'comment',
    title: L('注释', 'Comments'),
    paragraphs: {
      zh: [
        '双斜杠 // 后直到当前行末尾的内容都是注释，解析和播放时会被完全忽略。',
        '注释既可以单独占一行，也可以写在参数行或音符行后，用来记录乐句、指法或排练提示。',
      ],
      en: [
        'Everything after // through the end of the current line is a comment and is ignored during parsing and playback.',
        'Comments may occupy their own line or follow a parameter/note line for phrases, fingering, or rehearsal notes.',
      ],
    },
    examples: [
      {
        code: '1=C 100bpm  // C 大调\n1234  // 第一乐句\n// 换气\n5432',
        caption: L('注释不会改变演奏结果', 'Comments do not change playback'),
      },
    ],
  },
  {
    id: 'simul',
    title: L('同时音', 'Simultaneous notes'),
    paragraphs: {
      zh: [
        '在同一行里，用圆括号 () 把若干音符括起来，表示它们与括号前的旋律「同时」发声，叠加在同一条音轨上。',
        '括号内的总时值会右对齐到前面那段旋律的末尾，因此很适合写「柱式和声」「双音」等同时落下的音。括号可嵌套。',
      ],
      en: [
        'Within one line, wrap notes in parentheses () so they sound together with the melody before them, stacked on the same track.',
        'Their total duration right-aligns to the end of the preceding melody — handy for block chords or double stops. Parentheses can nest.',
      ],
    },
    examples: [
      { code: '1=C 100bpm\n1(3)(5)', caption: L('do、mi、sol 三音同时（一个柱式和声）', 'do, mi, sol together (a block chord)') },
      { code: '1=C 100bpm\n13(5)', caption: L('do re 之后，sol 与旋律同时落下', 'after do-re, sol lands together with the melody') },
    ],
  },
  {
    id: 'multitrack',
    title: L('多轨谱（双手谱）', 'Multi-track (two-hand)'),
    paragraphs: {
      zh: [
        '当「一整行」被一对圆括号完整包围时，这一行会成为一条新的音轨，与它上面那条普通行同时开始——就像钢琴的左右手分谱。',
        '普通行依次构成主旋律（右手），其下方的整行括号行作为伴奏（左手）与之并行。注意区分：行内的 (...) 是同时音，整行的 (...) 才是新音轨。',
      ],
      en: [
        'When an entire line is wrapped in a pair of parentheses, it becomes a new track that starts together with the normal line above it — like a piano’s left and right hands.',
        'Normal lines form the melody (right hand); a fully-bracketed line below plays as accompaniment (left hand) in parallel. Note: inline (...) is simultaneous notes, a whole-line (...) is a new track.',
      ],
    },
    examples: [
      {
        code: '1=C 120bpm\n1111111\n(2222222)\n3333333\n(4444444)',
        caption: L('两条音轨：1/3 行为主旋律，2/4 行与之并行', 'Two tracks: lines 1/3 melody, lines 2/4 in parallel'),
      },
      {
        code: '1=C 90bpm\n13531353\n(1,5,1,5,1,5,1,5,)',
        caption: L('右手旋律 + 左手低音伴奏', 'Right-hand melody + left-hand bass'),
      },
    ],
  },
  {
    id: 'chord',
    title: L('和弦演奏', 'Chords'),
    paragraphs: {
      zh: [
        '在方括号 [] 内写入和弦记号，将自动演奏和弦并持续到下一个和弦。',
        '和弦记号由「级数 + 类型 + 后缀 + 转位 + 八度」组成：级数为 1~7（可带 #b）；类型如 m、dim、aug、M7、m7、7、9 等；',
        '后缀如 add9、omit3、sus；转位与斜杠根音用 /；末尾的 ,/. 调整八度（和弦默认低八度）。',
      ],
      en: [
        'Write a chord symbol inside square brackets []; it plays and sustains until the next chord.',
        'A symbol is degree + type + suffix + inversion + octave: degree 1–7 (optionally #b); types like m, dim, aug, M7, m7, 7, 9…;',
        'suffixes like add9, omit3, sus; inversion/slash-bass via /; trailing ,/. shift octave (chords default an octave lower).',
      ],
    },
    examples: [
      {
        code: '1=C 90bpm\n[1]1234[5]567',
        caption: L('和弦伴奏的旋律', 'Melody with chordal accompaniment'),
      },
      {
        code: '1=C 80bpm\n[1add9]1+[4M7]1+[5sus]1+[1]1+',
        caption: L('加九、大七、挂四和弦进行', 'add9 / maj7 / sus4 progression'),
      },
    ],
  },
];
