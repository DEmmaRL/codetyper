import * as vscode from 'vscode';
import { tokenize, compareTokens } from './tokenizer';

// Decoration types
const ghostDecoration = vscode.window.createTextEditorDecorationType({
  after: { color: '#555555', fontStyle: 'italic' }
});
const errorDecoration = vscode.window.createTextEditorDecorationType({
  textDecoration: 'underline wavy red',
  color: '#f44747'
});
const okDecoration = vscode.window.createTextEditorDecorationType({
  color: '#4ec9b0'
});

export class TypingSession {
  private targetCode: string;
  private editor: vscode.TextEditor;
  private disposables: vscode.Disposable[] = [];
  private statusBar: vscode.StatusBarItem;

  constructor(editor: vscode.TextEditor, targetCode: string) {
    this.editor = editor;
    this.targetCode = targetCode;
    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBar.show();

    // Show initial ghost text
    this._updateDecorations();

    // Listen for document changes
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document === this.editor.document) {
          this._updateDecorations();
        }
      })
    );
  }

  private _updateDecorations() {
    const typed = this.editor.document.getText();
    const targetTokens = tokenize(this.targetCode);
    const typedTokens = tokenize(typed);
    const errors = compareTokens(targetTokens, typedTokens);
    const errorSet = new Set(errors.map(e => e.tokenIndex));

    const errorRanges: vscode.Range[] = [];
    const okRanges: vscode.Range[] = [];

    // Map typed tokens back to ranges in the document
    const text = typed;
    const tokenRegex = /\S+/g;
    let match: RegExpExecArray | null;
    let ti = 0;
    while ((match = tokenRegex.exec(text)) !== null) {
      const start = this.editor.document.positionAt(match.index);
      const end = this.editor.document.positionAt(match.index + match[0].length);
      const range = new vscode.Range(start, end);
      if (errorSet.has(ti)) {
        errorRanges.push(range);
      } else {
        okRanges.push(range);
      }
      ti++;
    }

    this.editor.setDecorations(errorDecoration, errorRanges);
    this.editor.setDecorations(okDecoration, okRanges);

    // Ghost text: show remaining target tokens after cursor
    const remaining = targetTokens.slice(typedTokens.length).map(t => t.value).join(' ');
    if (remaining) {
      const end = this.editor.document.positionAt(typed.length);
      this.editor.setDecorations(ghostDecoration, [{
        range: new vscode.Range(end, end),
        renderOptions: { after: { contentText: '  ' + remaining } }
      }]);
    } else {
      this.editor.setDecorations(ghostDecoration, []);
    }

    // Stats in status bar
    const done = typedTokens.length;
    const total = targetTokens.length;
    const errCount = errors.length;
    this.statusBar.text = `CodeTyper: ${done}/${total} tokens | errors: ${errCount}`;

    if (done >= total && errCount === 0) {
      this.statusBar.text = `CodeTyper: ✓ Done!`;
      vscode.window.showInformationMessage('CodeTyper: Template complete!');
      this.dispose();
    }
  }

  dispose() {
    this.editor.setDecorations(ghostDecoration, []);
    this.editor.setDecorations(errorDecoration, []);
    this.editor.setDecorations(okDecoration, []);
    this.statusBar.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
