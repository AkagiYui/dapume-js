/** dapume 记号类型 → CSS 类名（编辑器与静态代码展示共用）。 */
import type { TokenType } from 'dapume-js';

export const TOKEN_CLASS: Record<TokenType, string> = {
  key: 'tok-key',
  bpm: 'tok-bpm',
  note: 'tok-note',
  rest: 'tok-rest',
  'pitch-mod': 'tok-pitch',
  'duration-mod': 'tok-duration',
  bracket: 'tok-bracket',
  chord: 'tok-chord',
};
