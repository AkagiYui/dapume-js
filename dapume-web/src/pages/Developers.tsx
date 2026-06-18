/**
 * 开发者页：介绍如何在自己的项目中使用 dapume-js 包，含安装命令与示例代码。
 */
import { For, onMount } from 'solid-js';
import { useLocation, useNavigate } from '@tanstack/solid-router';
import { SiteHeader } from '~/components/SiteHeader';
import { CodeBlock } from '~/components/CodeBlock';
import { HighlightedCode } from '~/components/HighlightedCode';
import { ApiTester } from '~/components/ApiTester';
import { Button, buttonVariants } from '~/components/ui/button';
import { Icon } from '~/components/Icon';
import { t } from '~/i18n';
import { locale } from '~/stores/settings';
import type { Locale } from '~/stores/settings';
import { ensurePiano } from '~/stores/player';
import { navigateWithTransition } from '~/lib/viewTransition';

const REPO_URL = 'https://github.com/AkagiYui/dapume-js';
const PY_REPO_URL = 'https://github.com/ScarlettRinko/dapume';
const NPMX_URL = 'https://npmx.dev/package/dapume-js';
const API_REF_URL = 'https://npmx.dev/package-docs/dapume-js';
const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=AkagiYui.dapume-vscode';
/** shields.io 徽章（发布后自动显示实时数据），各自链接到对应页面。 */
const BADGES = [
  { src: 'https://img.shields.io/npm/v/dapume-js?logo=npm&color=%23cb3837', alt: 'npm version', href: NPMX_URL },
  { src: 'https://img.shields.io/npm/dm/dapume-js?color=%2334d399', alt: 'npm downloads', href: NPMX_URL },
  { src: 'https://img.shields.io/npm/l/dapume-js?color=%236366f1', alt: 'license', href: NPMX_URL },
  { src: 'https://img.shields.io/bundlephobia/minzip/dapume-js?label=minzip', alt: 'bundle size', href: NPMX_URL },
  {
    // shields.io 与 vsmarketplacebadges.dev 的「实时版本」徽章因 Marketplace API 停用已失效，
    // 改用始终可用的静态徽章（点击跳转到 Marketplace 列表页）。
    src: 'https://img.shields.io/badge/VS%20Marketplace-dapume--vscode-007ACC?logo=visualstudiocode&logoColor=white',
    alt: 'vscode marketplace',
    href: MARKETPLACE_URL,
  },
];

// 示例代码：注释随语言切换（zh/en）。
const zh = (l: Locale) => l === 'zh';

const INSTALL = (l: Locale) => `pnpm add dapume-js
# ${zh(l) ? '或：npm install dapume-js / yarn add dapume-js' : 'or: npm install dapume-js / yarn add dapume-js'}`;

const API = (l: Locale) => `import { parse, toMidi } from 'dapume-js';

const score = parse(\`1=C 120bpm
1234567\`);

console.log(score.notes.length); // 7
const midi: Uint8Array = toMidi(score);`;

const NODE = (l: Locale) => `import { writeFileSync } from 'node:fs';
import { render } from 'dapume-js';

// ${zh(l) ? 'render(text) 等价于 toMidi(parse(text))' : 'render(text) is equivalent to toMidi(parse(text))'}
writeFileSync('output.mid', render('1=C 120bpm\\n1234567'));`;

const BROWSER = (_l: Locale) => `import { render } from 'dapume-js';

const bytes = render(scoreText);
const blob = new Blob([bytes], { type: 'audio/midi' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'score.mid';
a.click();
URL.revokeObjectURL(url);`;

const MORE = (l: Locale) => {
  const c = zh(l)
    ? {
        render: '解析 + 渲染',
        tok: '语法高亮词法单元',
        active: '第 300ms 正在发声的音符',
        params: '第 300ms 生效的调号/速度 → "D", 90',
      }
    : {
        render: 'parse + render',
        tok: 'tokens for syntax highlighting',
        active: 'notes sounding at 300ms',
        params: 'key/tempo in effect at 300ms → "D", 90',
      };
  return `import { parse, render, tokenize, activeNotesAt, activeEventsAt, paramsAt } from 'dapume-js';

const mid = render('1=C\\n1234567');          // ${c.render}
const tokens = tokenize('1=C\\n[4M7]2');        // ${c.tok}
const score = parse('1=D 90bpm\\n1234567');
const sounding = activeNotesAt(score, 300);     // ${c.active}
const timeline = activeEventsAt(score, 300);    // includes rests
const { key, bpm } = paramsAt(score, 300);      // ${c.params}`;
};

const TYPES = (l: Locale) => {
  const z = zh(l);
  return `interface DapumeScore {
  tracks: DapumeNote[][];     // ${z ? '按音轨分组（渲染 MIDI 用）' : 'grouped by track (for MIDI)'}
  notes: DapumeNote[];        // ${z ? '扁平列表，按开始时刻升序' : 'flat list, sorted by start time'}
  events: DapumeEvent[];      // ${z ? '时间轴事件（含休止符）' : 'timeline events (including rests)'}
  trackCount: number;
  durationMs: number;
  durationBeats: number;      // ${z ? '精确总拍数，不受 BPM 影响' : 'exact total beats, independent of BPM'}
  sections: DapumeSection[];  // ${z ? '各参数段（调号/速度随时间变化）' : 'parameter sections (key/tempo over time)'}
}

interface DapumeNote {
  trackNo: number;
  pitch: number;     // ${z ? 'MIDI 音高，中央 C = 60' : 'MIDI pitch, middle C = 60'}
  startTime: number; // ${z ? '毫秒' : 'milliseconds'}
  duration: number;  // ${z ? '毫秒' : 'milliseconds'}
  startBeat: number; // ${z ? '从乐谱开头累计的精确拍位' : 'exact beat from score start'}
  durationBeats: number;
  srcStart: number;  // ${z ? '源字符起始下标（用于高亮）' : 'source char start index (for highlighting)'}
  srcEnd: number;
  isChord: boolean;
}

interface DapumeSection {
  startTime: number; // ${z ? '该段起始时刻（毫秒）' : 'section start time (ms)'}
  startBeat: number; // ${z ? '该段起始拍位' : 'section start beat'}
  tonic: number;     // ${z ? '主音 MIDI' : 'tonic MIDI pitch'}
  bpm: number;
  key: string;       // ${z ? '调号标签，如 "C"、"Bb."' : 'key label, e.g. "C", "Bb."'}
}`;
};

/** HTTP 接口的一行说明：方法 + 路径 + 请求/响应内容类型。 */
function EndpointRow(props: {
  method: string;
  path: string;
  req: string;
  res: string;
  extra?: string;
}) {
  return (
    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted/30 px-3 py-2 font-mono text-xs">
      <span class="rounded bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">{props.method}</span>
      <span class="font-semibold">{props.path}</span>
      <span class="text-muted-foreground">{props.req}</span>
      <Icon icon="lucide:arrow-right" class="text-muted-foreground" />
      <span class="text-muted-foreground">{props.res}</span>
      {props.extra && <span class="text-muted-foreground">{props.extra}</span>}
    </div>
  );
}

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
  const location = useLocation();

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

        {/* 徽章（链接到 npm 包页面） */}
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <For each={BADGES}>
            {(b) => (
              <a href={b.href} target="_blank" rel="noreferrer" class="inline-flex">
                <img src={b.src} alt={b.alt} class="h-5" loading="lazy" />
              </a>
            )}
          </For>
        </div>

        {/* 仓库链接 */}
        <div class="mt-4 flex flex-wrap gap-2">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            class={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Icon icon="lucide:github" />
            {t('dev.repo')}
          </a>
          <a
            href={API_REF_URL}
            target="_blank"
            rel="noreferrer"
            class={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Icon icon="lucide:book-open" />
            {t('dev.apiRef')}
          </a>
          <a
            href={MARKETPLACE_URL}
            target="_blank"
            rel="noreferrer"
            class={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Icon icon="lucide:puzzle" />
            {t('dev.marketplace')}
          </a>
          <a
            href={PY_REPO_URL}
            target="_blank"
            rel="noreferrer"
            class={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Icon icon="lucide:github" />
            {t('dev.originalRepo')}
          </a>
        </div>

        <div class="mt-6">
          <Section title={t('dev.installTitle')} desc={t('dev.installDesc')}>
            <CodeBlock code={INSTALL(locale())} lang="bash" />
          </Section>

          <Section title={t('dev.apiTitle')} desc={t('dev.apiDesc')}>
            <CodeBlock code={API(locale())} />
          </Section>

          <Section title={t('dev.nodeTitle')} desc={t('dev.nodeDesc')}>
            <CodeBlock code={NODE(locale())} />
          </Section>

          <Section title={t('dev.browserTitle')} desc={t('dev.browserDesc')}>
            <CodeBlock code={BROWSER(locale())} />
          </Section>

          <Section title={t('dev.moreTitle')} desc={t('dev.moreDesc')}>
            <CodeBlock code={MORE(locale())} />
          </Section>

          <Section title={t('dev.typesTitle')}>
            <CodeBlock code={TYPES(locale())} />
          </Section>

          <Section title={t('dev.httpTitle')} desc={t('dev.httpDesc')}>
            <div class="space-y-2">
              <EndpointRow method="POST" path="/api/parse" req="text/plain" res="application/json" />
              <EndpointRow method="POST" path="/api/to-midi" req="application/json" res="audio/midi" />
              <EndpointRow
                method="POST"
                path="/api/render"
                req="text/plain"
                res="audio/midi"
                extra="+ X-Note-Count / X-Track-Count / X-Duration-Ms"
              />
            </div>
            <p class="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Icon icon="lucide:shield-check" />
              {t('dev.httpSameOrigin')}
            </p>
            <div class="mt-5">
              <h3 class="mb-1 text-base font-semibold">{t('dev.tryTitle')}</h3>
              <p class="mb-3 text-sm text-muted-foreground">{t('dev.tryDesc')}</p>
              <ApiTester />
            </div>
          </Section>

          <Section title={t('dev.vscodeTitle')} desc={t('dev.vscodeDesc')}>
            <HighlightedCode code={'1=C 120bpm\n[1]1234[5]567'} />
          </Section>
        </div>

        <div class="py-8 text-center">
          <Button
            size="lg"
            class="gap-2"
            onClick={() =>
              navigateWithTransition(
                () => navigate({ to: '/workbench' }),
                location().pathname,
                '/workbench',
              )
            }
          >
            {t('dev.cta')}
            <Icon icon="lucide:arrow-right" />
          </Button>
        </div>
      </main>
    </div>
  );
}
