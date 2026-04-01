import * as vscode from 'vscode';
import { tokenize, compareTokens } from './tokenizer';
import { PreviewProvider } from './previewProvider';

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

  /** Pre-computed target tokens — immutable for the session lifetime. */
  private targetTokens: ReturnType<typeof tokenize>;
  /** Whether ghost text and color highlights are hidden (blind mode). */
  private blindMode: boolean;
  /** Whether the preview panel is currently open. */
  private previewOpen = false;
  /** Timestamp of the first keystroke; undefined until typing begins. */
  private startTime: number | undefined;

  constructor(
    editor: vscode.TextEditor,
    targetCode: string,
    onComplete: (wpm: number, errors: number, seconds: number) => void = () => {},
    blindMode = false,
    showPreview = true,
    provider?: PreviewProvider
  ) {
    this.editor = editor;
    this.targetCode = targetCode;
    this.onComplete = onComplete;
    this.blindMode = blindMode;
    this.targetTokens = tokenize(targetCode);

    if (provider) { provider.setContent(targetCode); }

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
            active?.document.uri.toString() !== PreviewProvider.uri.toString()) {
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
      `CodeTyper: ${this.blindMode ? '[blind] Blind mode ON' : '[ghost] Ghost mode ON'}`, 2000
    );
  }

  /** Toggle the preview panel on/off during an active session. */
  async togglePreview() {
    if (this.previewOpen) {
      await this._closePreview();
    } else {
      await this._openPreview();
    }
    await vscode.window.showTextDocument(this.editor.document, vscode.ViewColumn.One);
  }

  private async _openPreview() {
    // Use the virtual read-only scheme — no edits possible, no file created
    const doc = await vscode.workspace.openTextDocument(PreviewProvider.uri);
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: true,
      preview: true
    });
    this.previewOpen = true;
  }

  private async _closePreview() {
    for (const tabGroup of vscode.window.tabGroups.all) {
      for (const tab of tabGroup.tabs) {
        if (tab.input instanceof vscode.TabInputText &&
            tab.input.uri.toString() === PreviewProvider.uri.toString()) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
    this.previewOpen = false;
  }

  private _updateDecorations() {
    const cursor = this.editor.selection.active;
    const cursorOffset = this.editor.document.offsetAt(cursor);
    const typed = this.editor.document.getText().slice(0, cursorOffset);
    const typedTokens = tokenize(typed);
    const errors = compareTokens(this.targetTokens, typedTokens);
    const errorSet = new Set(errors.map(e => e.tokenIndex));

    const done = typedTokens.length;
    const total = this.targetTokens.length;
    const errCount = errors.length;

    if (done > 0 && this.startTime === undefined) { this.startTime = Date.now(); }

    if (this.blindMode) {
      this.editor.setDecorations(errorDecoration, []);
      this.editor.setDecorations(okDecoration, []);
      this.editor.setDecorations(ghostDecoration, []);
    } else {
      this._applyHighlights(typedTokens, errorSet);
      this._applyGhostText(typedTokens);
    }

    this._updateStatusBar(typed, done, total, errCount);

    if (done >= total && errCount === 0) {
      this._showSummary(typed, done, errCount);
      this.dispose();
    }
  }

  private _applyHighlights(typedTokens: ReturnType<typeof tokenize>, errorSet: Set<number>) {
    const errorRanges: vscode.Range[] = [];
    const okRanges: vscode.Range[] = [];
    for (const token of typedTokens) {
      const start = this.editor.document.positionAt(token.offset);
      const end = this.editor.document.positionAt(token.offset + token.value.length);
      const range = new vscode.Range(start, end);
      (errorSet.has(token.index) ? errorRanges : okRanges).push(range);
    }
    this.editor.setDecorations(errorDecoration, errorRanges);
    this.editor.setDecorations(okDecoration, okRanges);
  }

  private _applyGhostText(typedTokens: ReturnType<typeof tokenize>) {
    const lastTyped = typedTokens[typedTokens.length - 1];
    const correspondingTarget = this.targetTokens[typedTokens.length - 1];
    const isMidToken = lastTyped &&
      correspondingTarget &&
      correspondingTarget.value.startsWith(lastTyped.value) &&
      correspondingTarget.value !== lastTyped.value;

    const ghostFromTokenIdx = isMidToken ? typedTokens.length - 1 : typedTokens.length;
    const ghostFromCharOffset = isMidToken
      ? correspondingTarget.offset + lastTyped.value.length
      : this.targetTokens[ghostFromTokenIdx]?.offset;

    const ghostDecorations: vscode.DecorationOptions[] = [];

    if (ghostFromCharOffset !== undefined && this.targetTokens[ghostFromTokenIdx]) {
      const lines = this.targetCode.split('\n');
      let charCount = 0;
      let lineIdx = 0;
      for (let i = 0; i < lines.length; i++) {
        if (charCount + lines[i].length >= ghostFromCharOffset) { lineIdx = i; break; }
        charCount += lines[i].length + 1;
      }
      const remaining = this.targetCode.slice(ghostFromCharOffset, charCount + lines[lineIdx].length);
      if (remaining.trim()) {
        const pos = this.editor.document.lineAt(this.editor.document.lineCount - 1).range.end;
        ghostDecorations.push({ range: new vscode.Range(pos, pos), renderOptions: { after: { contentText: remaining } } });
      }
    }

    this.editor.setDecorations(ghostDecoration, ghostDecorations);
  }

  private _updateStatusBar(typed: string, done: number, total: number, errCount: number) {
    const targetLines = this.targetCode.split('\n');
    const nextLine = !this.blindMode ? targetLines[typed.split('\n').length] : undefined;
    const nextLineHint = nextLine !== undefined ? `  -> ${nextLine.trim()}` : '';
    const modeIcon = this.blindMode ? ' [blind]' : '';
    this.statusBar.text = `CodeTyper${modeIcon}: ${done}/${total} tokens | errors: ${errCount} | ${this._wpm(typed)}${nextLineHint}`;
  }

  private _wpm(typed: string): string {
    if (!this.startTime) { return '-- wpm'; }
    const elapsed = Date.now() - this.startTime;
    if (elapsed < 300) { return '-- wpm'; }
    const minutes = Math.max(0.01, elapsed / 60000);
    const wpm = Math.round(typed.replace(/\s+/g, '').length / 5 / minutes);
    return isFinite(wpm) && wpm >= 0 ? `${wpm} wpm` : '-- wpm';
  }

  private _showSummary(typed: string, totalTokens: number, errors: number) {
    if (!this.startTime) { return; }
    const elapsed = (Date.now() - this.startTime) / 1000;
    const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const secs = Math.floor(elapsed % 60).toString().padStart(2, '0');
    const chars = typed.replace(/\s+/g, '').length;
    const wpm = Math.round(chars / 5 / (elapsed / 60));
    vscode.window.showInformationMessage(
      `CodeTyper done: ${totalTokens} tokens | ${wpm} wpm | ${errors} errors | ${mins}:${secs}`
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
