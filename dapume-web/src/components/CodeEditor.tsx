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

const editableComp = new Compartment();

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  highlights?: HighlightRange[];
  placeholder?: string;
}

export function CodeEditor(props: CodeEditorProps) {
  let host!: HTMLDivElement;
  let view: EditorView | undefined;

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
          highlightField,
          EditorView.lineWrapping,
          cmPlaceholder(props.placeholder ?? ''),
          editableComp.of([
            EditorState.readOnly.of(!!props.readOnly),
            EditorView.editable.of(!props.readOnly),
          ]),
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

  // 播放高亮
  createEffect(() => {
    const ranges = props.highlights ?? [];
    view?.dispatch({ effects: setHighlights.of(ranges.map((r) => ({ from: r.from, to: r.to }))) });
  });

  onCleanup(() => view?.destroy());

  return <div ref={host} class="h-full w-full overflow-hidden" />;
}
