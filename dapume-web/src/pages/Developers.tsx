/**
 * 开发者页：介绍如何在自己的项目中使用 dapume-js 包，含安装命令与示例代码。
 */
import { onMount } from 'solid-js';
import { useNavigate } from '@tanstack/solid-router';
import { SiteHeader } from '~/components/SiteHeader';
import { CodeBlock } from '~/components/CodeBlock';
import { Button } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { t } from '~/i18n';
import { ensurePiano } from '~/stores/player';

const INSTALL = `pnpm add dapume-js
# 或：npm install dapume-js / yarn add dapume-js`;

const API = `import { parse, toMidi } from 'dapume-js';

const score = parse(\`1=C 120bpm
1234567\`);

console.log(score.notes.length); // 7
const midi: Uint8Array = toMidi(score);`;

const NODE = `import { writeFileSync } from 'node:fs';
import { render } from 'dapume-js';

// render(text) 等价于 toMidi(parse(text))
writeFileSync('output.mid', render('1=C 120bpm\\n1234567'));`;

const BROWSER = `import { render } from 'dapume-js';

const bytes = render(scoreText);
const blob = new Blob([bytes], { type: 'audio/midi' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'score.mid';
a.click();
URL.revokeObjectURL(url);`;

const MORE = `import { parse, render, tokenize, activeNotesAt } from 'dapume-js';

const mid = render('1=C\\n1234567');          // 解析 + 渲染
const tokens = tokenize('1=C\\n[4M7]2');        // 语法高亮词法单元
const score = parse('1=C 120bpm\\n1234567');
const sounding = activeNotesAt(score, 300);     // 第 300ms 正在发声的音符`;

const TYPES = `interface DapumeScore {
  tracks: DapumeNote[][]; // 按音轨分组（渲染 MIDI 用）
  notes: DapumeNote[];    // 扁平列表，按开始时刻升序
  trackCount: number;
  durationMs: number;
}

interface DapumeNote {
  trackNo: number;
  pitch: number;     // MIDI 音高，中央 C = 60
  startTime: number; // 毫秒
  duration: number;  // 毫秒
  srcStart: number;  // 源字符起始下标（用于高亮）
  srcEnd: number;
  isChord: boolean;
}`;

function Section(props: { title: string; desc?: string; children: import('solid-js').JSX.Element }) {
  return (
    <section class="border-b py-7 last:border-0">
      <h2 class="mb-2 text-xl font-bold">{props.title}</h2>
      {props.desc && <p class="mb-3 leading-relaxed text-foreground/90">{props.desc}</p>}
      {props.children}
    </section>
  );
}

export default function Developers() {
  const navigate = useNavigate();

  // 进入页面即预热音源（与指南页一致）
  onMount(() => {
    ensurePiano().catch(() => {});
  });

  return (
    <div class="min-h-full">
      <SiteHeader />

      <main class="mx-auto max-w-4xl px-4 py-8">
        <h1 class="text-3xl font-extrabold tracking-tight">{t('dev.title')}</h1>
        <p class="mt-3 max-w-2xl text-muted-foreground">{t('dev.subtitle')}</p>

        <div class="mt-6">
          <Section title={t('dev.installTitle')} desc={t('dev.installDesc')}>
            <CodeBlock code={INSTALL} />
          </Section>

          <Section title={t('dev.apiTitle')} desc={t('dev.apiDesc')}>
            <CodeBlock code={API} />
          </Section>

          <Section title={t('dev.nodeTitle')} desc={t('dev.nodeDesc')}>
            <CodeBlock code={NODE} />
          </Section>

          <Section title={t('dev.browserTitle')} desc={t('dev.browserDesc')}>
            <CodeBlock code={BROWSER} />
          </Section>

          <Section title={t('dev.moreTitle')} desc={t('dev.moreDesc')}>
            <CodeBlock code={MORE} />
          </Section>

          <Section title={t('dev.typesTitle')}>
            <CodeBlock code={TYPES} />
          </Section>
        </div>

        <div class="py-8 text-center">
          <Button size="lg" class="gap-2" onClick={() => navigate({ to: '/workbench' })}>
            {t('dev.cta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
      </main>
    </div>
  );
}
