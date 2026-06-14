/**
 * 静态 dapume 代码块，带语法高亮（复用 dapume-js 的 tokenize）。
 * 可选 highlights：在指定源字符范围上叠加「当前发声」高亮（用于指南页示例播放）。
 */
import { For, Show } from 'solid-js';
import { tokenize } from 'dapume-js';
import { TOKEN_CLASS } from '~/lib/tokenClass';
import { cn } from '~/lib/utils';

interface Segment {
  text: string;
  cls?: string;
  hl: boolean;
}

/** 按「词法单元边界 + 高亮边界」切分文本，每段携带配色类与是否高亮。 */
function buildSegments(code: string, highlights: { from: number; to: number }[]): Segment[] {
  const tokens = tokenize(code);
  const points = new Set<number>([0, code.length]);
  for (const tk of tokens) {
    points.add(tk.start);
    points.add(tk.end);
  }
  for (const h of highlights) {
    points.add(Math.max(0, Math.min(h.from, code.length)));
    points.add(Math.max(0, Math.min(h.to, code.length)));
  }
  const sorted = [...points].sort((a, b) => a - b);
  const segs: Segment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a >= b) continue;
    const tk = tokens.find((t) => t.start <= a && t.end >= b);
    const hl = highlights.some((h) => h.from <= a && h.to >= b);
    segs.push({ text: code.slice(a, b), cls: tk ? TOKEN_CLASS[tk.type] : undefined, hl });
  }
  return segs;
}

export function HighlightedCode(props: {
  code: string;
  highlights?: { from: number; to: number }[];
  class?: string;
}) {
  const segs = () => buildSegments(props.code, props.highlights ?? []);
  return (
    <pre
      class={cn(
        'overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm leading-relaxed',
        props.class,
      )}
    >
      <code>
        <For each={segs()}>
          {(s) => (
            <Show when={s.cls || s.hl} fallback={<>{s.text}</>}>
              <span class={cn(s.cls, s.hl && 'cm-playing-highlight')}>{s.text}</span>
            </Show>
          )}
        </For>
      </code>
    </pre>
  );
}
