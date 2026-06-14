/**
 * 语法高亮分词器
 *
 * 将 dapume 文本切分为带类型与源位置的词法单元，供编辑器做语法高亮。
 * 行的「参数行 / 音符行」分类与 {@link parse} 保持一致，确保高亮与解析行为统一。
 */

import { RE_PATTERN_BPM, RE_PATTERN_KEY_SIGNATURE } from './constants';
import type { Token } from './types';

/** 音高修饰符字符集合。 */
const PITCH_MODS = new Set(['.', ',', '#', 'b']);
/** 时值修饰符字符集合。 */
const DURATION_MODS = new Set(['-', '~', '=', '+', '*', '^', "'"]);

/**
 * 对 dapume 文本分词，返回用于语法高亮的词法单元数组（按源位置升序，互不重叠）。
 * 仅产出「有意义」的单元；空白、小节线 `/` 等被忽略的字符不会生成单元。
 *
 * @param text dapume 语法文本。
 */
export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const lines = text.split('\n');
  let lineStart = 0;

  for (const line of lines) {
    const km = line.match(RE_PATTERN_KEY_SIGNATURE);
    const bm = line.match(RE_PATTERN_BPM);
    const isParamLine = km !== null || bm !== null;

    if (isParamLine) {
      const parts: Token[] = [];
      if (km && km.index !== undefined) {
        parts.push({
          type: 'key',
          start: lineStart + km.index,
          end: lineStart + km.index + km[0].length,
          value: km[0],
        });
      }
      if (bm && bm.index !== undefined) {
        parts.push({
          type: 'bpm',
          start: lineStart + bm.index,
          end: lineStart + bm.index + bm[0].length,
          value: bm[0],
        });
      }
      parts.sort((a, b) => a.start - b.start);
      tokens.push(...parts);
    } else {
      // 音符行：逐字符扫描
      let j = 0;
      while (j < line.length) {
        const c = line[j]!;
        const abs = lineStart + j;
        if (c === '[') {
          // 和弦记号：整体作为一个单元，直到 ']'（含）或行尾
          let k = j + 1;
          while (k < line.length && line[k] !== ']') k++;
          const end = k < line.length ? k + 1 : line.length;
          tokens.push({
            type: 'chord',
            start: abs,
            end: lineStart + end,
            value: line.slice(j, end),
          });
          j = end;
          continue;
        }
        if (c >= '1' && c <= '7') {
          tokens.push({ type: 'note', start: abs, end: abs + 1, value: c });
        } else if (c === '0') {
          tokens.push({ type: 'rest', start: abs, end: abs + 1, value: c });
        } else if (PITCH_MODS.has(c)) {
          tokens.push({ type: 'pitch-mod', start: abs, end: abs + 1, value: c });
        } else if (DURATION_MODS.has(c)) {
          tokens.push({ type: 'duration-mod', start: abs, end: abs + 1, value: c });
        } else if (c === '(' || c === ')') {
          tokens.push({ type: 'bracket', start: abs, end: abs + 1, value: c });
        }
        // 其它字符（空白、'/'、未知字符）不产出单元
        j++;
      }
    }

    lineStart += line.length + 1; // +1 为换行符
  }

  return tokens;
}
