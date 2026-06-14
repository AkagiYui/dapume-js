/**
 * 通用代码块（用于开发者文档展示安装命令与示例代码），带复制按钮。
 */
import { createSignal } from 'solid-js';
import { Icon } from '~/components/Icon';
import { cn } from '~/lib/utils';

export function CodeBlock(props: { code: string; class?: string }) {
  const [copied, setCopied] = createSignal(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 忽略 */
    }
  };

  return (
    <div class={cn('group relative', props.class)}>
      <pre class="overflow-x-auto rounded-md border bg-muted/50 p-3 pr-12 font-mono text-sm leading-relaxed">
        <code>{props.code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        class="absolute right-2 top-2 rounded-md border bg-background/80 p-1.5 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
        aria-label="copy"
      >
        <Icon icon={copied() ? 'lucide:check' : 'lucide:copy'} />
      </button>
    </div>
  );
}
