import * as vscode from 'vscode';

/**
 * Provides read-only virtual documents for the CodeTyper preview panel.
 * Documents are served under the 'codetyper-preview' scheme and are
 * truly read-only — VS Code won't allow editing them at all.
 *
 * Usage:
 *   PreviewProvider.instance.setContent(content);
 *   vscode.window.showTextDocument(PreviewProvider.uri, { ... });
 */
export class PreviewProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'codetyper-preview';
  static readonly uri = vscode.Uri.parse(`${PreviewProvider.scheme}://template/preview`);

  private content = '';
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this._onDidChange.event;

  setContent(content: string) {
    this.content = content;
    this._onDidChange.fire(PreviewProvider.uri);
  }

  provideTextDocumentContent(): string {
    return this.content;
  }

  dispose() {
    this._onDidChange.dispose();
  }
}
