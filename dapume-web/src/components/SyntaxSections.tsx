/**
 * 语法章节渲染：段落 + 参考表 + 可播放示例（播放时高亮当前发声的源字符）。
 * 由「规则与语法」(Guide) 与「教程」(Tutorial) 两页共用。
 */
import { For, Show, createMemo, createSignal } from 'solid-js';
import { activeNotesAt, parse } from 'dapume-js';
import type { GuideSection } from '~/data/guide';
import { locale } from '~/stores/settings';
import { currentTimeMs, isPlaying, play, stop } from '~/stores/player';
import { HighlightedCode } from '~/components/HighlightedCode';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { t } from '~/i18n';

// 当前正在播放的示例代码——在所有示例间共享，保证同一时刻只有一个处于播放/高亮态。
const [playingSnippet, setPlayingSnippet] = createSignal<string | null>(null);

/** 单个可播放示例卡片：点击播放本段、播放时高亮当前发声字符。 */
function PlayableExample(props: { code: string; caption: string }) {
  const score = createMemo(() => parse(props.code));
  const isThis = () => playingSnippet() === props.code && isPlaying();
  const ranges = createMemo(() =>
    isThis()
      ? activeNotesAt(score(), currentTimeMs()).map((n) => ({ from: n.srcStart, to: n.srcEnd }))
      : [],
  );
  function toggle() {
    if (isThis()) {
      stop();
      setPlayingSnippet(null);
      return;
    }
    const s = score();
    if (s.notes.length === 0) return;
    setPlayingSnippet(props.code);
    void play(s.notes, s.durationMs, 0);
  }
  return (
    <div class="rounded-lg border bg-card p-3">
      <div class="mb-2 flex items-center justify-between gap-3">
        <span class="text-sm text-muted-foreground">{props.caption}</span>
        <Button
          variant={isThis() ? 'secondary' : 'default'}
          size="icon"
          class="size-8 shrink-0"
          title={isThis() ? t('common.stop') : t('guide.playExample')}
          aria-label={isThis() ? t('common.stop') : t('guide.playExample')}
          onClick={toggle}
        >
          <Icon icon={isThis() ? 'lucide:square' : 'lucide:play'} />
        </Button>
      </div>
      <HighlightedCode code={props.code} highlights={ranges()} />
    </div>
  );
}

/** 渲染一组语法章节。numbered=true 时在标题前加序号（教程的「循序渐进」步骤）。 */
export function SyntaxSections(props: { sections: GuideSection[]; numbered?: boolean }) {
  return (
    <For each={props.sections}>
      {(section, i) => (
        <section id={section.id} class="scroll-mt-20 border-b py-8 last:border-0">
          <h2 class="mb-4 text-2xl font-bold">
            <Show when={props.numbered}>
              <span class="mr-2 text-primary">{i() + 1}.</span>
            </Show>
            {section.title[locale()]}
          </h2>
          <div class="space-y-3 leading-relaxed text-foreground/90">
            <For each={section.paragraphs[locale()]}>{(p) => <p>{p}</p>}</For>
          </div>

          {/* 参考表格 */}
          <Show when={section.table}>
            {(table) => (
              <div class="mt-4 overflow-x-auto">
                <table class="w-full border-collapse text-sm">
                  <thead>
                    <tr class="border-b text-left">
                      <For each={table().headers[locale()]}>
                        {(h) => <th class="px-3 py-2 font-medium text-muted-foreground">{h}</th>}
                      </For>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={table().rows}>
                      {(row) => (
                        <tr class="border-b last:border-0">
                          <For each={row}>
                            {(cell) => <td class="px-3 py-1.5 font-mono">{cell[locale()]}</td>}
                          </For>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            )}
          </Show>

          {/* 示例（可播放，播放时高亮当前音符） */}
          <div class="mt-5 space-y-3">
            <For each={section.examples}>
              {(ex) => <PlayableExample code={ex.code} caption={ex.caption[locale()]} />}
            </For>
          </div>
        </section>
      )}
    </For>
  );
}
