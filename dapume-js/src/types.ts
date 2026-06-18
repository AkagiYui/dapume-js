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
  /** 是否为休止符。休止符参与时间轴与源码高亮，但不会进入 MIDI 音轨。 */
  isRest?: boolean;
}

/**
 * 乐谱时间轴事件。与可发声的 {@link DapumeNote} 不同，事件也包含休止符，
 * 因而适合驱动播放定位、编辑器高亮和逐事件导航。
 */
export interface DapumeEvent {
  /** 音轨编号。 */
  trackNo: number;
  /** MIDI 音高；休止符为 null。 */
  pitch: number | null;
  /** 起始时刻（毫秒）。 */
  startTime: number;
  /** 持续时长（毫秒）。 */
  duration: number;
  /** 从乐谱开头累计的精确起始拍；不受 BPM 与毫秒取整影响。 */
  startBeat: number;
  /** 精确持续拍数；不受 BPM 与毫秒取整影响。 */
  durationBeats: number;
  /** 源字符起始下标（含）。 */
  srcStart: number;
  /** 源字符结束下标（不含）。 */
  srcEnd: number;
  /** 是否来自和弦记号 `[...]`。 */
  isChord: boolean;
  /** 是否为休止符。 */
  isRest: boolean;
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
  /** 从乐谱开头累计的精确起始拍；不受 BPM 与毫秒取整影响。 */
  startBeat: number;
  /** 精确持续拍数；不受 BPM 与毫秒取整影响。 */
  durationBeats: number;
  /** 在源文本中触发该音符的起始字符下标（含）。 */
  srcStart: number;
  /** 在源文本中触发该音符的结束字符下标（不含）。 */
  srcEnd: number;
  /** 是否来自和弦记号 `[...]`。 */
  isChord: boolean;
}

/**
 * 乐谱中的一个「参数段」：自某时刻起生效的调号与速度。
 */
export interface DapumeSection {
  /** 该段起始时刻（毫秒）。 */
  startTime: number;
  /** 该段从乐谱开头累计的精确起始拍。 */
  startBeat: number;
  /** 主音音高（MIDI，中央 C = 60）。 */
  tonic: number;
  /** 速度（每分钟拍数）。 */
  bpm: number;
  /** 调号标签，如 "C"、"Bb."（不含前缀 "1="）。 */
  key: string;
}

/**
 * 解析后的 dapume 乐谱对象（函数 {@link parse} 的输出）。
 */
export interface DapumeScore {
  /** 按音轨分组的音符。其内部顺序用于渲染 MIDI，与 dapume-py 完全一致。 */
  tracks: DapumeNote[][];
  /** 所有音符的扁平列表，已按开始时刻升序排序，便于播放与高亮。 */
  notes: DapumeNote[];
  /** 所有时间轴事件（含休止符），已按开始时刻升序排序。 */
  events: DapumeEvent[];
  /** 音轨数量。 */
  trackCount: number;
  /** 乐谱总时长（毫秒），即最后一个音符的结束时刻。 */
  durationMs: number;
  /** 乐谱总拍数（精确拍位，不受 BPM 与毫秒取整影响）。 */
  durationBeats: number;
  /** 各参数段（调号/速度随时间的变化），按开始时刻升序。 */
  sections: DapumeSection[];
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
  | 'chord'
  /** `//` 起至当前行末尾的注释。 */
  | 'comment';

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
