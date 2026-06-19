/**
 * 示例曲目数据。模板文本通过 Vite 的 `?raw` 直接以字符串导入，避免手工转写出错。
 */
import canon from './templates/canon.txt?raw';
import orchid from './templates/orchid_pavilion.txt?raw';
import tori from './templates/tori_no_uta.txt?raw';
import flower from './templates/flower_dance.txt?raw';
import type { Locale } from '../stores/settings';

export interface Example {
  id: string;
  title: Record<Locale, string>;
  code: string;
}

/** 工作台「载入示例」可选项。 */
export const EXAMPLES: Example[] = [
  {
    id: 'scale',
    title: { zh: 'C 大调音阶', en: 'C major scale' },
    code: '1=C 120bpm\n1-2-3-4-5-6-7-1.-',
  },
  {
    id: 'tori_no_uta',
    title: { zh: '鸟之诗（单轨旋律）', en: 'Tori no Uta (melody)' },
    code: tori.trimEnd(),
  },
  {
    id: 'flower_dance',
    title: { zh: '花之舞（多轨）', en: 'Flower Dance (multi-track)' },
    code: flower.trimEnd(),
  },
  {
    id: 'orchid_pavilion',
    title: { zh: '兰亭序（和弦）', en: 'Orchid Pavilion (chords)' },
    code: orchid.trimEnd(),
  },
  {
    id: 'canon',
    title: { zh: '卡农（复杂多轨）', en: 'Canon (complex)' },
    code: canon.trimEnd(),
  },
];

/** 工作台默认载入的乐谱。 */
export const DEFAULT_SCORE = EXAMPLES[3]!.code; // 兰亭序，能体现旋律 + 和弦
