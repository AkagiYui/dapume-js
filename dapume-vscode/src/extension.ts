/**
 * Dapume VSCode 扩展入口。
 * 提供「渲染为 MIDI」命令：解析当前 .dapume 文件，渲染为同名 .mid 并写入磁盘。
 */
import * as vscode from 'vscode';
import { parse, toMidi } from 'dapume-js';

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

  context.subscriptions.push(disposable);
}

export function deactivate(): void {
  /* 无需清理 */
}
