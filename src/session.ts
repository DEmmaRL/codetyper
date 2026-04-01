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

    // Map typed tokens back to ranges using the same tokenizer (keeps indices in sync)
    for (const token of typedTokens) {
      const start = this.editor.document.positionAt(token.offset);
      const end = this.editor.document.positionAt(token.offset + token.value.length);
      const range = new vscode.Range(start, end);
      if (errorSet.has(token.index)) {
        errorRanges.push(range);
      } else {
        okRanges.push(range);
      }
    }

    this.editor.setDecorations(errorDecoration, errorRanges);
    this.editor.setDecorations(okDecoration, okRanges);

    // Ghost text: only show remainder of current line
    const typedLines = typed.split('\n');
    const currentLineIndex = typedLines.length - 1;
    const targetLines = this.targetCode.split('\n');
    const ghostDecorations: vscode.DecorationOptions[] = [];

    if (currentLineIndex < targetLines.length) {
      const typedCurrentLine = typedLines[currentLineIndex] ?? '';
      const remaining = targetLines[currentLineIndex].slice(typedCurrentLine.length);
      if (remaining) {
        const pos = this.editor.document.lineAt(Math.min(currentLineIndex, this.editor.document.lineCount - 1)).range.end;
        ghostDecorations.push({ range: new vscode.Range(pos, pos), renderOptions: { after: { contentText: remaining } } });
      }
    }

    this.editor.setDecorations(ghostDecoration, ghostDecorations);

    // Show next line preview in status bar
    const nextLine = targetLines[currentLineIndex + 1];
    const nextLineHint = nextLine !== undefined ? `  ↵ ${nextLine.trim()}` : '';

    // Stats in status bar
    const done = typedTokens.length;
    const total = targetTokens.length;
    const errCount = errors.length;
    this.statusBar.text = `CodeTyper: ${done}/${total} tokens | errors: ${errCount}${nextLineHint}`;

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
