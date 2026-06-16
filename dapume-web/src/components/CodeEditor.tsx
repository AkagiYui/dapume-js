/**
 * dapume 代码编辑器（基于 CodeMirror 6，非 input/textarea）。
 *
 * 三层能力：
 * 1. 语法高亮：用 dapume-js 的 tokenize() 把记号映射为 CSS 类（ViewPlugin + 装饰）。
 * 2. 播放高亮：单独的装饰层，根据当前发声音符的源字符范围加背景高亮（StateField + StateEffect）。
 * 3. 只读切换：播放时通过 Compartment 锁定编辑。
 */
import { createEffect, onCleanup, onMount } from 'solid-js';
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder as cmPlaceholder,
} from '@codemirror/view';
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { tokenize } from 'dapume-js';
import { TOKEN_CLASS } from '~/lib/tokenClass';

/** 源字符范围。 */
export interface HighlightRange {
  from: number;
  to: number;
}

/** 语法高亮装饰（来自外部分词器）。 */
const tokenPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const tokens = tokenize(view.state.doc.toString());
      for (const tk of tokens) {
        builder.add(tk.start, tk.end, Decoration.mark({ class: TOKEN_CLASS[tk.type] }));
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/** 更新「当前发声」高亮范围的副作用。 */
const setHighlights = StateEffect.define<HighlightRange[]>();
const playingMark = Decoration.mark({ class: 'cm-playing-highlight' });

const highlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes); // 编辑后保持位置有效
    for (const e of tr.effects) {
      if (e.is(setHighlights)) {
        const docLen = tr.state.doc.length;
        const ranges = e.value
          .map((r) => ({ from: Math.max(0, Math.min(r.from, docLen)), to: Math.max(0, Math.min(r.to, docLen)) }))
          .filter((r) => r.to > r.from)
          .map((r) => playingMark.range(r.from, r.to));
        deco = Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 当前发声的「行」高亮（对比度比音符字符高亮更低）。 */
const playingLine = Decoration.line({ class: 'cm-playing-line' });

const lineHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setHighlights)) {
        const doc = tr.state.doc;
        const docLen = doc.length;
        const lines = new Set<number>();
        for (const r of e.value) {
          const from = Math.max(0, Math.min(r.from, docLen));
          const to = Math.max(0, Math.min(r.to, docLen));
          if (to <= from) continue;
          const a = doc.lineAt(from).number;
          const b = doc.lineAt(Math.max(from, to - 1)).number;
          for (let n = a; n <= b; n++) lines.add(n);
        }
        const ranges = [...lines]
          .sort((x, y) => x - y)
          .map((n) => playingLine.range(doc.line(n).from));
        deco = Decoration.set(ranges, true);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** 粘性参数行「是否启用」开关（用状态字段而非增删插件，避免反复重建导致的累积）。 */
const setStickyEnabled = StateEffect.define<boolean>();
const stickyEnabledField = StateField.define<boolean>({
  create: () => true,
  update(val, tr) {
    for (const e of tr.effects) if (e.is(setStickyEnabled)) val = e.value;
    return val;
  },
});

/**
 * 「参数行粘性置顶」插件（类似 VSCode sticky scroll，但只有单层）。
 * 当某个参数行（1=调号 / 速度行）滚出视口顶部时，把它固定显示在编辑器顶部；点击回到该行。
 * 插件常驻，显隐由 {@link stickyEnabledField} 控制。
 */
function stickyHeaderPlugin() {
  return ViewPlugin.fromClass(
    class {
      view: EditorView;
      bar: HTMLDivElement;
      params: { line: number; text: string }[] = [];
      current: number | null = null;
      raf = 0;
      onScroll = () => this.schedule();

      constructor(view: EditorView) {
        this.view = view;
        this.bar = document.createElement('div');
        this.bar.className = 'cm-sticky-header';
        this.bar.style.display = 'none';
        // mousedown 阻止默认，避免抢走编辑器选区；click 跳回该参数行
        this.bar.addEventListener('mousedown', (e) => e.preventDefault());
        this.bar.addEventListener('click', () => this.jump());
        if (!view.dom.style.position) view.dom.style.position = 'relative';
        view.dom.appendChild(this.bar);
        view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true });
        this.computeParams();
        this.schedule(); // 用 rAF 调度首渲，避免在构造/更新期间读取布局（CM 不允许）
      }

      update(u: ViewUpdate) {
        if (u.docChanged) this.computeParams();
        // 经 rAF 调度重渲：render() 会读取布局（lineBlockAtHeight），不能在 update 周期内同步执行
        this.schedule();
      }

      destroy() {
        this.view.scrollDOM.removeEventListener('scroll', this.onScroll);
        if (this.raf) cancelAnimationFrame(this.raf);
        this.bar.remove();
      }

      schedule() {
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => {
          this.raf = 0;
          this.render();
        });
      }

      /** 扫描全文，记录所有「参数行」（含 key 或 bpm 记号的行）。 */
      computeParams() {
        const doc = this.view.state.doc;
        const set = new Set<number>();
        for (const tk of tokenize(doc.toString())) {
          if (tk.type === 'key' || tk.type === 'bpm') set.add(doc.lineAt(tk.start).number);
        }
        this.params = [...set]
          .sort((a, b) => a - b)
          .map((n) => ({ line: n, text: doc.line(n).text.trim() }));
      }

      render() {
        const v = this.view;
        if (!v.state.field(stickyEnabledField, false) || this.params.length === 0) return this.hide();
        // 用几何而非命中测试取视口顶部行：避免被粘性条自身遮挡而取错位置
        const topBlock = v.lineBlockAtHeight(v.scrollDOM.scrollTop);
        const topLine = v.state.doc.lineAt(topBlock.from).number;
        // 找到 ≤ 顶部行的最近参数行
        let found: { line: number; text: string } | null = null;
        for (const it of this.params) {
          if (it.line <= topLine) found = it;
          else break;
        }
        // 仅当该参数行已滚出视口顶部（在顶部行之上）时才显示
        if (!found || found.line >= topLine) return this.hide();
        this.current = found.line;
        this.bar.textContent = found.text;
        const gutter = v.dom.querySelector('.cm-gutters') as HTMLElement | null;
        this.bar.style.paddingLeft = `${(gutter ? gutter.offsetWidth : 4) + 6}px`;
        this.bar.style.display = '';
      }

      hide() {
        this.current = null;
        this.bar.style.display = 'none';
      }

      jump() {
        if (this.current == null) return;
        const line = this.view.state.doc.line(this.current);
        this.view.dispatch({ effects: EditorView.scrollIntoView(line.from, { y: 'start' }) });
      }
    },
  );
}

/** keepLine 滚动锚点：当前演奏行的行顶停在视口的此比例处（与钢琴卷帘的 0.4 一致）。 */
const SCROLL_ANCHOR = 0.4;

/**
 * 把指定位置所在行平滑滚动到固定锚点（视口 ~40% 处）。
 * 仅在「当前演奏行号改变」时调用（见调用处），故每行至多滚动一次：
 * 既保持演奏行稳定在中上、一行行平滑推进，又不会逐音符重复滚动造成抖动闪烁。
 */
function scrollLineToAnchor(v: EditorView, pos: number, smooth: boolean): void {
  pos = Math.max(0, Math.min(pos, v.state.doc.length));
  const block = v.lineBlockAt(v.state.doc.lineAt(pos).from);
  const target = Math.max(0, block.top - v.scrollDOM.clientHeight * SCROLL_ANCHOR);
  v.scrollDOM.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
}

const editableComp = new Compartment();

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  highlights?: HighlightRange[];
  /** 是否在播放时把当前发声的行滚动到可视区域。 */
  keepVisible?: boolean;
  /** keepVisible 滚动时是否平滑（默认 true）。 */
  smoothScroll?: boolean;
  /** 是否启用「参数行粘性置顶」。 */
  sticky?: boolean;
  placeholder?: string;
}

export function CodeEditor(props: CodeEditorProps) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;
  let lastScrolledLine = -1; // keepLine：上次已锚定的演奏行号（仅换行时再滚动）

  onMount(() => {
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: props.value,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          highlightActiveLineGutter(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          tokenPlugin,
          lineHighlightField,
          highlightField,
          EditorView.lineWrapping,
          cmPlaceholder(props.placeholder ?? ''),
          editableComp.of([
            EditorState.readOnly.of(!!props.readOnly),
            EditorView.editable.of(!props.readOnly),
          ]),
          stickyEnabledField,
          stickyHeaderPlugin(),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) props.onChange?.(u.state.doc.toString());
          }),
        ],
      }),
    });
  });

  // 外部 value 变化时同步文档（避免回环）
  createEffect(() => {
    const next = props.value;
    if (view && next !== view.state.doc.toString()) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
    }
  });

  // 只读切换
  createEffect(() => {
    const ro = !!props.readOnly;
    view?.dispatch({
      effects: editableComp.reconfigure([
        EditorState.readOnly.of(ro),
        EditorView.editable.of(!ro),
      ]),
    });
  });

  // 粘性参数行开关：插件常驻，仅切换状态字段（含初始值，故不 defer）
  createEffect(() => {
    view?.dispatch({ effects: setStickyEnabled.of(!!props.sticky) });
  });

  // 播放高亮（含当前行高亮），并按需把当前发声的行滚动到可视区域
  createEffect(() => {
    const ranges = (props.highlights ?? []).map((r) => ({ from: r.from, to: r.to }));
    const v = view;
    if (!v) return;
    v.dispatch({ effects: setHighlights.of(ranges) });
    // 仅当「当前演奏行号」改变时才滚动，把该行锚定到视口约 40% 处：
    // 每行至多滚动一次，避免逐音符重复滚动造成的抖动闪烁。
    if (props.keepVisible && ranges.length > 0) {
      const line = v.state.doc.lineAt(Math.min(ranges[0]!.from, v.state.doc.length)).number;
      if (line !== lastScrolledLine) {
        lastScrolledLine = line;
        scrollLineToAnchor(v, ranges[0]!.from, props.smoothScroll !== false);
      }
    } else {
      lastScrolledLine = -1; // 停止/无高亮时复位，下次播放重新锚定
    }
  });

  onCleanup(() => view?.destroy());

  return <div ref={host} class="h-full w-full overflow-hidden" />;
}
