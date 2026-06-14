/**
 * dapume 类型定义
 */

/** 乐谱参数（调号与速度）。 */
export interface ScoreParameters {
  /** 主音音高（MIDI，中央 C = 60）。 */
  tonic: number;
  /** 速度（每分钟拍数）。 */
  bpm: number;
}

/**
 * 相对音符（解析中间产物）。
 * 音高以「相对主音的半音数」表示，时间以「拍」表示，与具体调号/速度无关。
 */
export interface RelativeNote {
  /** 音轨编号。 */
  trackNo: number;
  /** 唱名：与主音相差的半音数。 */
  solfa: number;
  /** 起始拍。 */
  startBeat: number;
  /** 持续拍数。 */
  noteValue: number;
  /** 在源文本中触发该音符的起始字符下标（含）。-1 表示未知。 */
  srcStart: number;
  /** 在源文本中触发该音符的结束字符下标（不含）。-1 表示未知。 */
  srcEnd: number;
  /** 是否来自和弦记号 `[...]`。 */
  isChord: boolean;
}

/**
 * 绝对音符（最终结果）。音高为 MIDI 编号，时间以毫秒为单位。
 */
export interface DapumeNote {
  /** 音轨编号。 */
  trackNo: number;
  /** MIDI 音高（中央 C = 60）。 */
  pitch: number;
  /** 起始时刻（毫秒）。 */
  startTime: number;
  /** 持续时长（毫秒）。 */
  duration: number;
  /** 在源文本中触发该音符的起始字符下标（含）。 */
  srcStart: number;
  /** 在源文本中触发该音符的结束字符下标（不含）。 */
  srcEnd: number;
  /** 是否来自和弦记号 `[...]`。 */
  isChord: boolean;
}

/**
 * 解析后的 dapume 乐谱对象（函数 {@link parse} 的输出）。
 */
export interface DapumeScore {
  /** 按音轨分组的音符。其内部顺序用于渲染 MIDI，与 dapume-py 完全一致。 */
  tracks: DapumeNote[][];
  /** 所有音符的扁平列表，已按开始时刻升序排序，便于播放与高亮。 */
  notes: DapumeNote[];
  /** 音轨数量。 */
  trackCount: number;
  /** 乐谱总时长（毫秒），即最后一个音符的结束时刻。 */
  durationMs: number;
}

/** 语法高亮的词法单元类型。 */
export type TokenType =
  /** 调号参数，如 `1=C`。 */
  | 'key'
  /** 速度参数，如 `120bpm`。 */
  | 'bpm'
  /** 音符数字 1~7。 */
  | 'note'
  /** 休止符 0。 */
  | 'rest'
  /** 音高修饰符 `. , # b`。 */
  | 'pitch-mod'
  /** 时值修饰符 `- ~ = + * ^ '`。 */
  | 'duration-mod'
  /** 多轨括号 `( )`。 */
  | 'bracket'
  /** 和弦记号 `[...]`（整体）。 */
  | 'chord';

/** 语法高亮词法单元。 */
export interface Token {
  /** 单元类型。 */
  type: TokenType;
  /** 起始字符下标（含）。 */
  start: number;
  /** 结束字符下标（不含）。 */
  end: number;
  /** 原始文本片段。 */
  value: string;
}
