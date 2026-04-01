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
  private onComplete: (wpm: number, errors: number, seconds: number) => void;

  /** Whether ghost text and color highlights are hidden (blind mode). */
  private blindMode: boolean;
  /** The read-only preview editor showing the template, if open. */
  private previewEditor: vscode.TextEditor | undefined;

  /** Timestamp of the first keystroke; undefined until typing begins. */
  private startTime: number | undefined;

  constructor(
    editor: vscode.TextEditor,
    targetCode: string,
    onComplete: (wpm: number, errors: number, seconds: number) => void = () => {},
    blindMode = false,
    showPreview = true
  ) {
    this.editor = editor;
    this.targetCode = targetCode;
    this.onComplete = onComplete;
    this.blindMode = blindMode;

    this.statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    this.statusBar.show();

    if (showPreview) { this._openPreview(); }

    this._updateDecorations();

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document === this.editor.document) {
          this._updateDecorations();
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(active => {
        if (active?.document !== this.editor.document &&
            active?.document !== this.previewEditor?.document) {
          this.dispose();
        }
      })
    );
  }

  /** Toggle blind mode on/off during an active session. */
  toggleBlind() {
    this.blindMode = !this.blindMode;
    this._updateDecorations();
    vscode.window.setStatusBarMessage(
      `CodeTyper: ${this.blindMode ? '🙈 Blind mode ON' : '👁 Ghost mode ON'}`, 2000
    );
  }

  /** Toggle the preview panel on/off during an active session. */
  async togglePreview() {
    if (this.previewEditor) {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      this.previewEditor = undefined;
      await vscode.window.showTextDocument(this.editor.document);
    } else {
      await this._openPreview();
      await vscode.window.showTextDocument(this.editor.document);
    }
  }

  private async _openPreview() {
    const doc = await vscode.workspace.openTextDocument({
      language: this.editor.document.languageId,
      content: this.targetCode
    });
    // Open to the right, read-only
    this.previewEditor = await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true
    });
    // Mark as read-only via a setting override isn't possible directly,
    // but we can prevent edits by listening and reverting
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document === this.previewEditor?.document) {
          vscode.commands.executeCommand('undo');
        }
      })
    );
  }

  private _updateDecorations() {
    const cursor = this.editor.selection.active;
    const cursorOffset = this.editor.document.offsetAt(cursor);
    const typed = this.editor.document.getText().slice(0, cursorOffset);
    const targetTokens = tokenize(this.targetCode);
    const typedTokens = tokenize(typed);
    const errors = compareTokens(targetTokens, typedTokens);
    const errorSet = new Set(errors.map(e => e.tokenIndex));

    if (this.blindMode) {
      // Clear all visual decorations in blind mode
      this.editor.setDecorations(errorDecoration, []);
      this.editor.setDecorations(okDecoration, []);
      this.editor.setDecorations(ghostDecoration, []);
    } else {
      const errorRanges: vscode.Range[] = [];
      const okRanges: vscode.Range[] = [];

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

      // Ghost text: token-aware
      const ghostDecorations: vscode.DecorationOptions[] = [];
      const lastTypedToken = typedTokens[typedTokens.length - 1];
      const correspondingTarget = targetTokens[typedTokens.length - 1];
      const isMidToken = lastTypedToken &&
        correspondingTarget &&
        correspondingTarget.value.startsWith(lastTypedToken.value) &&
        correspondingTarget.value !== lastTypedToken.value;

      const ghostFromTokenIdx = isMidToken ? typedTokens.length - 1 : typedTokens.length;
      const ghostFromCharOffset = isMidToken
        ? correspondingTarget.offset + lastTypedToken.value.length
        : targetTokens[ghostFromTokenIdx]?.offset;

      if (ghostFromCharOffset !== undefined && targetTokens[ghostFromTokenIdx]) {
        const targetLines = this.targetCode.split('\n');
        let charCount = 0;
        let targetLineIdx = 0;
        for (let i = 0; i < targetLines.length; i++) {
          if (charCount + targetLines[i].length >= ghostFromCharOffset) {
            targetLineIdx = i;
            break;
          }
          charCount += targetLines[i].length + 1;
        }
        const remaining = this.targetCode.slice(ghostFromCharOffset, charCount + targetLines[targetLineIdx].length);
        if (remaining.trim()) {
          const docLine = this.editor.document.lineAt(this.editor.document.lineCount - 1).lineNumber;
          const pos = this.editor.document.lineAt(docLine).range.end;
          ghostDecorations.push({ range: new vscode.Range(pos, pos), renderOptions: { after: { contentText: remaining } } });
        }
      }

      this.editor.setDecorations(ghostDecoration, ghostDecorations);
    }

    const done = typedTokens.length;
    const total = targetTokens.length;
    const errCount = errors.length;

    if (done > 0 && this.startTime === undefined) {
      this.startTime = Date.now();
    }

    const targetLines = this.targetCode.split('\n');
    const currentLineIndex = typed.split('\n').length - 1;
    const nextLine = targetLines[currentLineIndex + 1];
    const nextLineHint = !this.blindMode && nextLine !== undefined ? `  ↵ ${nextLine.trim()}` : '';
    const modeIcon = this.blindMode ? ' 🙈' : '';

    this.statusBar.text = `CodeTyper${modeIcon}: ${done}/${total} tokens | errors: ${errCount} | ${this._wpm(typed)}${nextLineHint}`;

    if (done >= total && errCount === 0) {
      this._showSummary(typed, done, errCount);
      this.dispose();
    }
  }

  private _wpm(typed: string): string {
    if (!this.startTime) { return '-- wpm'; }
    const minutes = (Date.now() - this.startTime) / 60000;
    const chars = typed.replace(/\s+/g, '').length;
    return `${Math.round(chars / 5 / minutes)} wpm`;
  }

  private _showSummary(typed: string, totalTokens: number, errors: number) {
    if (!this.startTime) { return; }
    const elapsed = (Date.now() - this.startTime) / 1000;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    const chars = typed.replace(/\s+/g, '').length;
    const wpm = Math.round(chars / 5 / (elapsed / 60));
    vscode.window.showInformationMessage(
      `CodeTyper ✓  ${totalTokens} tokens | ${wpm} wpm | ${errors} errors | ${mins}:${secs}`
    );
    this.onComplete(wpm, errors, Math.round(elapsed));
  }

  dispose() {
    this.editor.setDecorations(ghostDecoration, []);
    this.editor.setDecorations(errorDecoration, []);
    this.editor.setDecorations(okDecoration, []);
    this.statusBar.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
