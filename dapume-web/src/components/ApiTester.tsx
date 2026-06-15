/**
 * 开发者页的「在线测试」小工具：向同域 HTTP 接口发起请求并展示返回。
 * /api/parse → 展示 JSON；/api/render → 展示统计响应头并可下载 MIDI。
 * 接口仅在已部署站点（Cloudflare Pages Functions）或本地 dev（vite 中间件）可用。
 */
import { Match, Show, Switch, createSignal } from 'solid-js';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { t } from '~/i18n';
import { downloadBytes } from '~/lib/download';
import { highlightCode } from '~/lib/highlight';

const SAMPLE = '1=C 120bpm\n1234567';

type Result =
  | { kind: 'json'; text: string }
  | { kind: 'midi'; bytes: Uint8Array; notes: string; tracks: string; durationMs: string }
  | { kind: 'error'; message: string };

export function ApiTester() {
  const [input, setInput] = createSignal(SAMPLE);
  const [loading, setLoading] = createSignal<'parse' | 'render' | null>(null);
  const [result, setResult] = createSignal<Result | null>(null);

  async function call(endpoint: 'parse' | 'render') {
    setLoading(endpoint);
    setResult(null);
    try {
      const res = await fetch(`/api/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: input(),
      });
      if (!res.ok) {
        setResult({ kind: 'error', message: `${res.status} ${await res.text()}` });
        return;
      }
      if (endpoint === 'parse') {
        setResult({ kind: 'json', text: JSON.stringify(await res.json(), null, 2) });
      } else {
        setResult({
          kind: 'midi',
          bytes: new Uint8Array(await res.arrayBuffer()),
          notes: res.headers.get('X-Note-Count') ?? '—',
          tracks: res.headers.get('X-Track-Count') ?? '—',
          durationMs: res.headers.get('X-Duration-Ms') ?? '—',
        });
      }
    } catch (err) {
      setResult({ kind: 'error', message: `${t('dev.tryError')}: ${String(err)}` });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div class="rounded-lg border bg-card p-4">
      <label class="mb-1.5 block text-sm font-medium" for="api-tester-input">
        {t('dev.tryInput')}
      </label>
      <textarea
        id="api-tester-input"
        class="h-24 w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        value={input()}
        onInput={(e) => setInput(e.currentTarget.value)}
        spellcheck={false}
      />
      <div class="mt-3 flex flex-wrap gap-2">
        <Button size="sm" class="gap-1.5" onClick={() => void call('parse')} disabled={loading() !== null}>
          <Icon
            icon={loading() === 'parse' ? 'lucide:loader-circle' : 'lucide:braces'}
            class={loading() === 'parse' ? 'animate-spin' : ''}
          />
          POST /api/parse
        </Button>
        <Button
          size="sm"
          variant="secondary"
          class="gap-1.5"
          onClick={() => void call('render')}
          disabled={loading() !== null}
        >
          <Icon
            icon={loading() === 'render' ? 'lucide:loader-circle' : 'lucide:file-music'}
            class={loading() === 'render' ? 'animate-spin' : ''}
          />
          POST /api/render
        </Button>
      </div>

      <Show when={result()}>
        {(r) => (
          <div class="mt-4">
            <div class="mb-1.5 text-xs font-medium text-muted-foreground">{t('dev.tryResult')}</div>
            <Switch>
              <Match when={r().kind === 'error'}>
                <pre class="overflow-auto rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                  {(r() as Extract<Result, { kind: 'error' }>).message}
                </pre>
              </Match>
              <Match when={r().kind === 'json'}>
                <pre class="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                  {/* highlightCode 已转义内容，innerHTML 安全 */}
                  <code
                    class="hljs bg-transparent p-0"
                    innerHTML={highlightCode((r() as Extract<Result, { kind: 'json' }>).text, 'json')}
                  />
                </pre>
              </Match>
              <Match when={r().kind === 'midi'}>
                {(() => {
                  const m = r() as Extract<Result, { kind: 'midi' }>;
                  return (
                    <div class="space-y-3">
                      <div class="flex flex-wrap gap-2 text-xs">
                        <span class="rounded border px-2 py-1 tabular-nums">
                          X-Note-Count: <b class="text-foreground">{m.notes}</b>
                        </span>
                        <span class="rounded border px-2 py-1 tabular-nums">
                          X-Track-Count: <b class="text-foreground">{m.tracks}</b>
                        </span>
                        <span class="rounded border px-2 py-1 tabular-nums">
                          X-Duration-Ms: <b class="text-foreground">{m.durationMs}</b>
                        </span>
                        <span class="rounded border px-2 py-1 tabular-nums">{m.bytes.length} bytes</span>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        class="gap-1.5"
                        onClick={() => downloadBytes(m.bytes, 'render.mid', 'audio/midi')}
                      >
                        <Icon icon="lucide:download" />
                        {t('dev.tryDownload')}
                      </Button>
                    </div>
                  );
                })()}
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </div>
  );
}
