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

    // Ghost text: token-aware — show remaining target content from the current/next untyped token.
    // If the user is mid-token, show the remainder of that token + rest of the line.
    // If they just finished a token (or haven't started), show from the next token onward.
    const ghostDecorations: vscode.DecorationOptions[] = [];

    // Determine if the last typed token is a partial match of the corresponding target token
    const lastTypedToken = typedTokens[typedTokens.length - 1];
    const correspondingTarget = targetTokens[typedTokens.length - 1];
    const isMidToken = lastTypedToken &&
      correspondingTarget &&
      correspondingTarget.value.startsWith(lastTypedToken.value) &&
      correspondingTarget.value !== lastTypedToken.value;

    const ghostFromTokenIdx = isMidToken ? typedTokens.length - 1 : typedTokens.length;
    const ghostFromCharOffset = isMidToken
      ? correspondingTarget.offset + lastTypedToken.value.length  // skip already-typed part
      : targetTokens[ghostFromTokenIdx]?.offset;

    if (ghostFromCharOffset !== undefined && targetTokens[ghostFromTokenIdx]) {
      // Find which line in the target this offset lives on
      const targetLines = this.targetCode.split('\n');
      let charCount = 0;
      let targetLineIdx = 0;
      for (let i = 0; i < targetLines.length; i++) {
        if (charCount + targetLines[i].length >= ghostFromCharOffset) {
          targetLineIdx = i;
          break;
        }
        charCount += targetLines[i].length + 1; // +1 for \n
      }

      const lineStart = charCount;
      const remaining = this.targetCode.slice(ghostFromCharOffset, lineStart + targetLines[targetLineIdx].length);

      if (remaining.trim()) {
        const docLine = this.editor.document.lineAt(this.editor.document.lineCount - 1).lineNumber;
        const pos = this.editor.document.lineAt(docLine).range.end;
        ghostDecorations.push({ range: new vscode.Range(pos, pos), renderOptions: { after: { contentText: remaining } } });
      }
    }

    this.editor.setDecorations(ghostDecoration, ghostDecorations);

    // Show next line preview in status bar
    const targetLines = this.targetCode.split('\n');
    const currentLineIndex = typed.split('\n').length - 1;
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
