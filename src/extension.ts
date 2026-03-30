import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TypingSession } from './session';

let activeSession: TypingSession | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.start', async () => {
      // Resolve templates folder: user setting or bundled
      let folder = vscode.workspace.getConfiguration('codetyper').get<string>('templatesFolder');
      if (!folder || !fs.existsSync(folder)) {
        folder = path.join(context.extensionPath, 'templates');
      }

      const files = fs.readdirSync(folder).filter(f => /\.(cpp|py|java|js|ts|c|go|rs)$/.test(f));
      if (files.length === 0) {
        vscode.window.showErrorMessage('CodeTyper: No templates found.');
        return;
      }

      const picked = await vscode.window.showQuickPick(files, { placeHolder: 'Pick a template' });
      if (!picked) return;

      const targetCode = fs.readFileSync(path.join(folder, picked), 'utf8');

      // Open a new untitled document with the same language
      const ext = path.extname(picked).slice(1);
      const langMap: Record<string, string> = { cpp: 'cpp', py: 'python', java: 'java', js: 'javascript', ts: 'typescript', c: 'c', go: 'go', rs: 'rust' };
      const lang = langMap[ext] ?? 'plaintext';

      const doc = await vscode.workspace.openTextDocument({ language: lang, content: '' });
      const editor = await vscode.window.showTextDocument(doc);

      activeSession?.dispose();
      activeSession = new TypingSession(editor, targetCode);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.stop', () => {
      activeSession?.dispose();
      activeSession = undefined;
      vscode.window.showInformationMessage('CodeTyper: Session stopped.');
    })
  );
}

export function deactivate() {
  activeSession?.dispose();
}
