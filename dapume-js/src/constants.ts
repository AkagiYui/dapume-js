/**
 * dapume 常量定义
 *
 * 本文件中的所有常量均与 Python 版（dapume-py）保持一一对应，
 * 是“完美复刻”原项目音乐行为的基础。请勿随意改动数值。
 */

/**
 * 简谱唱名（1~7）到「相对主音的半音数」的映射。
 *
 * 下标 0 是占位符（`0` 在线性乐谱中表示休止符）。原项目用一个极小的负数
 * 作为休止符的音高，最终会因「音高超出 0~127」而被过滤掉，从而实现“占位但不发声”。
 */
export const SOLFEGE_PITCH: readonly number[] = [-1000, 0, 2, 4, 5, 7, 9, 11];

/** 音高修饰符 → 半音偏移。`.` 升八度、`,` 降八度、`#` 升半音、`b` 降半音。 */
export const NOTATION_PITCH: Readonly<Record<string, number>> = {
  '.': 12,
  ',': -12,
  '#': 1,
  b: -1,
};

/** 时值修饰符 → 拍数增量。可叠加，例如 `=-` 表示 2+1=3 拍。 */
export const NOTATION_BEATS: Readonly<Record<string, number>> = {
  '-': 1,
  '~': 1.5,
  '=': 2,
  '+': 4,
  '*': 0.5,
  '^': 0.25,
  "'": 0.125,
};

/** 和弦音程（1/3/5/7/9/11/13）→ 和弦内部数组下标。 */
export const CHORD_INTERVAL_TO_INDEX: Readonly<Record<number, number>> = {
  1: 0,
  3: 1,
  5: 2,
  7: 3,
  9: 4,
  11: 5,
  13: 6,
};

/** 和弦内部数组下标 → 在大调音阶中对应的「纯/大音程」半音数（根音、三音、五音、七音、九音、十一音、十三音）。 */
export const CHORD_INDEX_TO_PITCH: readonly number[] = [0, 4, 7, 11, 14, 17, 21];

/**
 * 和弦家族识别顺序。注意顺序敏感：
 * `mM` 必须排在 `m` 前、`augM` 必须排在 `aug` 前，
 * 空串 `''`（属和弦家族）作为兜底放最后（`startsWith('')` 恒为真）。
 */
export const CHORD_FAMILIES: readonly string[] = ['M', 'mM', 'm', 'dim', 'augM', 'aug', ''];

/** 和弦类型记号 → 最高叠置的音程数（3 表示三和弦，即只到五音）。空串兜底为三和弦。 */
export const CHORD_TYPES: ReadonlyArray<readonly [string, number]> = [
  ['7', 7],
  ['9', 9],
  ['11', 11],
  ['13', 13],
  ['', 3],
];

/**
 * 各和弦家族「根音、三音、五音、七音、九音、十一音、十三音」的半音升降情况。
 * 值为相对「纯/大音程」（见 {@link CHORD_INDEX_TO_PITCH}）的偏移，`null` 表示该音不存在。
 */
export const CHORD_FAMILY_NOTES: Readonly<Record<string, ReadonlyArray<number | null>>> = {
  M: [0, 0, 0, 0, null, null, null],
  m: [0, -1, 0, -1, null, null, null],
  dim: [0, -1, -1, -2, null, null, null],
  aug: [0, 0, 1, -1, null, null, null],
  '': [0, 0, 0, -1, null, null, null],
  mM: [0, -1, 0, 0, null, null, null],
  augM: [0, 0, 1, 0, null, null, null],
};

/** 和弦后缀匹配（add/omit/sus/升降）。与 Python 的正则一致。 */
export const RE_PATTERN_CHORD_SUFFIX = /add\d+|omit\d+|sus2?|#\d+|b\d+/g;

/** 调号参数正则：形如 `1=C`、`1=Bb.`。 */
export const RE_PATTERN_KEY_SIGNATURE = /1=[CDEFGAB][#b.,]*/;

/** BPM 参数正则：形如 `120bpm`。 */
export const RE_PATTERN_BPM = /(\d*)bpm/;

/** 默认主音音高（MIDI，中央 C = 60）。 */
export const DEFAULT_TONIC = 60;

/** 默认速度（每分钟拍数）。 */
export const DEFAULT_BPM = 120;
