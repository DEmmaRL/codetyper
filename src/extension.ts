import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TypingSession } from './session';
import { saveRecord, getHistory } from './history';

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

      await startSession(templatePath, context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.restart', async () => {
      if (!lastTemplatePath) {
        vscode.window.showErrorMessage('CodeTyper: No previous session to restart.');
        return;
      }
      await startSession(lastTemplatePath, context);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.stop', () => {
      activeSession?.dispose();
      activeSession = undefined;
      vscode.window.showInformationMessage('CodeTyper: Session stopped.');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.toggleBlind', () => {
      if (!activeSession) { vscode.window.showErrorMessage('CodeTyper: No active session.'); return; }
      activeSession.toggleBlind();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.togglePreview', async () => {
      if (!activeSession) { vscode.window.showErrorMessage('CodeTyper: No active session.'); return; }
      await activeSession.togglePreview();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.history', () => {
      const history = getHistory(context);
      if (history.length === 0) {
        vscode.window.showInformationMessage('CodeTyper: No sessions recorded yet.');
        return;
      }
      const items = history.map(r => ({
        label: r.template,
        description: `${r.wpm} wpm | ${r.errors} errors | ${Math.floor(r.seconds / 60)}:${(r.seconds % 60).toString().padStart(2, '0')}`,
        detail: new Date(r.date).toLocaleString()
      }));
      vscode.window.showQuickPick(items, { placeHolder: 'Session history' });
    })
  );
}

async function startSession(templatePath: string, context: vscode.ExtensionContext) {
  const targetCode = fs.readFileSync(templatePath, 'utf8');
  const ext = path.extname(templatePath).slice(1);
  const langMap: Record<string, string> = {
    cpp: 'cpp', py: 'python', java: 'java',
    js: 'javascript', ts: 'typescript', c: 'c', go: 'go', rs: 'rust'
  };
  const lang = langMap[ext] ?? 'plaintext';

  const config = vscode.workspace.getConfiguration('codetyper');
  const blindMode = config.get<string>('defaultMode') === 'blind';
  const showPreview = config.get<boolean>('showPreview') ?? true;

  const doc = await vscode.workspace.openTextDocument({ language: lang, content: '' });
  const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);

  activeSession?.dispose();
  activeSession = new TypingSession(editor, targetCode, (wpm, errors, seconds) => {
    saveRecord(context, {
      template: path.basename(templatePath),
      wpm, errors, seconds,
      date: new Date().toISOString()
    });
  }, blindMode, showPreview);
  lastTemplatePath = templatePath;
}

export function deactivate() {
  activeSession?.dispose();
}
