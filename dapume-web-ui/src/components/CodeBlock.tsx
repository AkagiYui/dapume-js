/**
 * 通用代码块（用于开发者文档展示安装命令与示例代码），带语法高亮与复制按钮。
 */
import { createSignal } from 'solid-js';
import { Icon } from './Icon';
import { cn } from '../lib/utils';
import { highlightCode } from '../lib/highlight';

export function CodeBlock(props: { code: string; lang?: string; class?: string }) {
  const [copied, setCopied] = createSignal(false);
  const html = () => highlightCode(props.code, props.lang ?? 'typescript');

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
        {/* highlightCode 已转义代码内容，innerHTML 安全 */}
        <code class="hljs bg-transparent p-0" innerHTML={html()} />
      </pre>
      <button
        type="button"
        onClick={copy}
        class="absolute right-2 top-2 inline-flex size-7 items-center justify-center rounded-md border bg-background/80 text-muted-foreground opacity-0 transition hover:text-foreground group-hover:opacity-100"
        aria-label="copy"
      >
        <Icon icon={copied() ? 'lucide:check' : 'lucide:copy'} />
      </button>
    </div>
  );
}
