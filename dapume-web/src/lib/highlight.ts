/**
 * 通用代码高亮（highlight.js），仅注册用到的语言以控制体积。
 * 用于开发者文档页的 JS/TS、Shell 代码块。
 */
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';
import bash from 'highlight.js/lib/languages/bash';

hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('bash', bash);

/** 返回高亮后的 HTML 字符串（已对代码内容转义，可安全用于 innerHTML）。 */
export function highlightCode(code: string, lang: string): string {
  if (hljs.getLanguage(lang)) {
    return hljs.highlight(code, { language: lang }).value;
  }
  return hljs.highlightAuto(code).value;
}
