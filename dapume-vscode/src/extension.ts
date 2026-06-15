/**
 * Dapume VSCode 扩展入口。
 * 提供「渲染为 MIDI」命令：解析当前 .dapume 文件，渲染为同名 .mid 并写入磁盘。
 */
import * as vscode from 'vscode';
import { parse, toMidi, tokenize } from 'dapume-js';

/**
 * 文档符号提供器：把每个「参数行」（含调号 1=X 或速度 bpm 的行）作为一个符号，
 * 其范围覆盖到下一参数行之前。借此启用 VSCode 的粘性滚动（sticky scroll）、
 * 大纲视图与面包屑——参数行被当作「标题行」。
 */
const symbolProvider: vscode.DocumentSymbolProvider = {
  provideDocumentSymbols(document) {
    const lineSet = new Set<number>();
    for (const tk of tokenize(document.getText())) {
      if (tk.type === 'key' || tk.type === 'bpm') lineSet.add(document.positionAt(tk.start).line);
    }
    const lines = [...lineSet].sort((a, b) => a - b);
    const lastLine = Math.max(0, document.lineCount - 1);
    return lines.map((line, i) => {
      const endLine = i + 1 < lines.length ? lines[i + 1]! - 1 : lastLine;
      const headerText = document.lineAt(line).text.trim();
      const fullRange = new vscode.Range(line, 0, endLine, document.lineAt(endLine).text.length);
      const selRange = document.lineAt(line).range;
      return new vscode.DocumentSymbol(
        headerText || `行 ${line + 1}`,
        '',
        vscode.SymbolKind.Key,
        fullRange,
        selRange,
      );
    });
  },
};

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand('dapume.renderMidi', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Dapume: 没有处于活动状态的编辑器。');
      return;
    }
    const doc = editor.document;
    if (doc.isUntitled) {
      vscode.window.showWarningMessage('Dapume: 请先保存文件，再渲染为 MIDI。');
      return;
    }

    try {
      const score = parse(doc.getText());
      if (score.notes.length === 0) {
        vscode.window.showWarningMessage('Dapume: 当前文件没有可渲染的音符。');
        return;
      }
      const bytes = toMidi(score);
      // 输出到与源文件同目录、同名的 .mid 文件
      const midiUri = doc.uri.with({ path: doc.uri.path.replace(/\.[^./]+$/, '') + '.mid' });
      await vscode.workspace.fs.writeFile(midiUri, bytes);
      const name = midiUri.path.split('/').pop();
      vscode.window.showInformationMessage(
        `Dapume: 已渲染 ${score.notes.length} 个音符 → ${name}`,
      );
    } catch (err) {
      vscode.window.showErrorMessage(`Dapume: 渲染失败 —— ${String(err)}`);
    }
  });

  // 注册文档符号提供器（驱动粘性滚动 / 大纲 / 面包屑）
  const symbols = vscode.languages.registerDocumentSymbolProvider(
    { language: 'dapume' },
    symbolProvider,
  );

  context.subscriptions.push(disposable, symbols);
}

export function deactivate(): void {
  /* 无需清理 */
}
