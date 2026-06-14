/**
 * 国际化（i18n）。基于 @solid-primitives/i18n，支持中英文，跟随 settings 中的 locale 信号。
 */
import { createMemo, createRoot } from 'solid-js';
import * as i18n from '@solid-primitives/i18n';
import { locale } from '~/stores/settings';
import { zh } from './zh';
import { en } from './en';

const dictionaries = { zh, en };

// 在长期存活的 root 中创建翻译字典 memo（全局存在，无需销毁）
const flatDict = createRoot(() => createMemo(() => i18n.flatten(dictionaries[locale()])));

/** 翻译函数：`t('nav.guide')`，支持 `{{ name }}` 模板插值。 */
export const t = i18n.translator(flatDict, i18n.resolveTemplate);
