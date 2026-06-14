/**
 * 静态 dapume 代码块，带语法高亮（复用 dapume-js 的 tokenize）。
 */
import { For, Show } from 'solid-js';
import { tokenize } from 'dapume-js';
import { TOKEN_CLASS } from '~/lib/tokenClass';
import { cn } from '~/lib/utils';

interface Segment {
  text: string;
  cls?: string;
}

function segment(code: string): Segment[] {
  const tokens = tokenize(code);
  const out: Segment[] = [];
  let pos = 0;
  for (const tk of tokens) {
    if (tk.start > pos) out.push({ text: code.slice(pos, tk.start) });
    out.push({ text: code.slice(tk.start, tk.end), cls: TOKEN_CLASS[tk.type] });
    pos = tk.end;
  }
  if (pos < code.length) out.push({ text: code.slice(pos) });
  return out;
}

export function HighlightedCode(props: { code: string; class?: string }) {
  return (
    <pre
      class={cn(
        'overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-sm leading-relaxed',
        props.class,
      )}
    >
      <code>
        <For each={segment(props.code)}>
          {(s) => (
            <Show when={s.cls} fallback={<>{s.text}</>}>
              <span class={s.cls}>{s.text}</span>
            </Show>
          )}
        </For>
      </code>
    </pre>
  );
}
