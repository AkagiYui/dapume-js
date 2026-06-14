/**
 * 静态 dapume 代码块，带语法高亮（复用 dapume-js 的 tokenize）。
 * 可选 highlights：在指定源字符范围上叠加「当前发声」高亮（用于指南页示例播放）。
 *
 * 高亮采用「整段一个框」的方式：一个连续的高亮范围（音符 + 其音高/时值修饰符）
 * 被包裹在同一个 .cm-playing-highlight 中，内部再按词法着色——与工作台编辑器一致。
 */
import { For, Show } from 'solid-js';
import { tokenize } from 'dapume-js';
import { TOKEN_CLASS } from '~/lib/tokenClass';
import { cn } from '~/lib/utils';

interface Part {
  text: string;
  cls?: string;
}
interface Group {
  hl: boolean;
  parts: Part[];
}

/** 按「词法单元边界 + 高亮边界」切分文本，再把连续的高亮片段合并为一组。 */
function buildGroups(code: string, highlights: { from: number; to: number }[]): Group[] {
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
  const groups: Group[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a >= b) continue;
    const tk = tokens.find((t) => t.start <= a && t.end >= b);
    const hl = highlights.some((h) => h.from <= a && h.to >= b);
    const part: Part = { text: code.slice(a, b), cls: tk ? TOKEN_CLASS[tk.type] : undefined };
    const last = groups[groups.length - 1];
    if (last && last.hl === hl) last.parts.push(part);
    else groups.push({ hl, parts: [part] });
  }
  return groups;
}

/** 渲染一组词法片段（带配色）。 */
function Parts(props: { parts: Part[] }) {
  return (
    <For each={props.parts}>
      {(p) => (
        <Show when={p.cls} fallback={<>{p.text}</>}>
          <span class={p.cls}>{p.text}</span>
        </Show>
      )}
    </For>
  );
}

export function HighlightedCode(props: {
  code: string;
  highlights?: { from: number; to: number }[];
  class?: string;
}) {
  const groups = () => buildGroups(props.code, props.highlights ?? []);
  return (
    <pre
      class={cn(
        'overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm leading-relaxed',
        props.class,
      )}
    >
      <code>
        <For each={groups()}>
          {(g) => (
            <Show when={g.hl} fallback={<Parts parts={g.parts} />}>
              <span class="cm-playing-highlight">
                <Parts parts={g.parts} />
              </span>
            </Show>
          )}
        </For>
      </code>
    </pre>
  );
}
