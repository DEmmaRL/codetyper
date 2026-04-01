import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TypingSession } from './session';

let activeSession: TypingSession | undefined;
let lastTemplatePath: string | undefined;

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.start', async () => {
      // Resolve templates folder: user setting or bundled
      let folder = vscode.workspace.getConfiguration('codetyper').get<string>('templatesFolder');
      if (!folder || !fs.existsSync(folder)) {
        folder = path.join(context.extensionPath, 'templates');
      }

      const files = fs.readdirSync(folder).filter(f => /\.(cpp|py|java|js|ts|c|go|rs)$/.test(f));

      // Build quick pick items: template files + a Browse option
      const items: vscode.QuickPickItem[] = [
        ...files.map(f => ({ label: f })),
        { label: '$(folder) Browse...', description: 'Open a file from anywhere' }
      ];

      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a template' });
      if (!picked) { return; }

      let templatePath: string;
      if (picked.label === '$(folder) Browse...') {
        const uris = await vscode.window.showOpenDialog({
          canSelectMany: false,
          filters: { 'Code templates': ['cpp', 'c', 'py', 'java', 'js', 'ts', 'go', 'rs'] }
        });
        if (!uris || uris.length === 0) { return; }
        templatePath = uris[0].fsPath;
      } else {
        templatePath = path.join(folder, picked.label);
      }

      await startSession(templatePath);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.restart', async () => {
      if (!lastTemplatePath) {
        vscode.window.showErrorMessage('CodeTyper: No previous session to restart.');
        return;
      }
      await startSession(lastTemplatePath);
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

async function startSession(templatePath: string) {
  const targetCode = fs.readFileSync(templatePath, 'utf8');
  const ext = path.extname(templatePath).slice(1);
  const langMap: Record<string, string> = {
    cpp: 'cpp', py: 'python', java: 'java',
    js: 'javascript', ts: 'typescript', c: 'c', go: 'go', rs: 'rust'
  };
  const lang = langMap[ext] ?? 'plaintext';

  const doc = await vscode.workspace.openTextDocument({ language: lang, content: '' });
  const editor = await vscode.window.showTextDocument(doc);

  activeSession?.dispose();
  activeSession = new TypingSession(editor, targetCode);
  lastTemplatePath = templatePath;
}

export function deactivate() {
  activeSession?.dispose();
}
