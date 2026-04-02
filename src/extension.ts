import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { TypingSession } from './session';
import { saveRecord, getHistory } from './history';
import { PreviewProvider } from './previewProvider';

let activeSession: TypingSession | undefined;
let lastTemplatePath: string | undefined;
export const previewProvider = new PreviewProvider();

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(PreviewProvider.scheme, previewProvider)
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.setTemplatesFolder', async () => {
      await pickTemplatesFolder();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('codetyper.start', async () => {
      // Resolve templates folder: user setting or prompt on first use
      let folder = vscode.workspace.getConfiguration('codetyper').get<string>('templatesFolder');
      if (!folder) {
        const choice = await vscode.window.showInformationMessage(
          'CodeTyper: No templates folder set. Pick one to get started.',
          'Choose Folder', 'Use Built-in Templates'
        );
        if (choice === 'Choose Folder') {
          folder = await pickTemplatesFolder();
          if (!folder) { return; }
        } else if (choice === 'Use Built-in Templates') {
          folder = path.join(context.extensionPath, 'templates');
        } else {
          return; // dismissed
        }
      } else {
        try {
          if (!fs.statSync(folder).isDirectory()) {
            const choice = await vscode.window.showErrorMessage(
              `CodeTyper: "${folder}" is not a directory.`,
              'Choose New Folder', 'Use Built-in Templates'
            );
            if (choice === 'Choose New Folder') {
              folder = await pickTemplatesFolder();
              if (!folder) { return; }
            } else {
              folder = path.join(context.extensionPath, 'templates');
            }
          }
        } catch {
          const choice = await vscode.window.showWarningMessage(
            `CodeTyper: Templates folder "${folder}" no longer exists.`,
            'Choose New Folder', 'Use Built-in Templates'
          );
          if (choice === 'Choose New Folder') {
            folder = await pickTemplatesFolder();
            if (!folder) { return; }
          } else {
            folder = path.join(context.extensionPath, 'templates');
          }
        }
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
    vscode.commands.registerCommand('codetyper.history', async () => {
      const history = getHistory(context);
      if (history.length === 0) {
        vscode.window.showInformationMessage('CodeTyper: No sessions recorded yet.');
        return;
      }
      interface HistoryItem extends vscode.QuickPickItem { templatePath?: string; }
      const items: HistoryItem[] = history.map(r => ({
        label: r.template,
        description: `${r.wpm} wpm | ${r.errors} errors | ${Math.floor(r.seconds / 60)}:${(r.seconds % 60).toString().padStart(2, '0')}`,
        detail: new Date(r.date).toLocaleString(),
        templatePath: r.templatePath
      }));
      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Pick a session to replay' });
      if (picked?.templatePath) {
        await startSession(picked.templatePath, context);
      }
    })
  );
}

async function pickTemplatesFolder(): Promise<string | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select Templates Folder'
  });
  if (!uris || uris.length === 0) { return undefined; }
  const folder = uris[0].fsPath;
  await vscode.workspace.getConfiguration('codetyper').update('templatesFolder', folder, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(`CodeTyper: Templates folder set to "${folder}"`);
  return folder;
}

async function startSession(templatePath: string, context: vscode.ExtensionContext) {
  try {
    const stat = fs.statSync(templatePath);
    if (!stat.isFile()) {
      vscode.window.showErrorMessage(`CodeTyper: "${templatePath}" is not a file.`);
      return;
    }
    const MAX_SIZE = 10 * 1024 * 1024;
    if (stat.size > MAX_SIZE) {
      vscode.window.showErrorMessage(`CodeTyper: File too large (${(stat.size / 1024 / 1024).toFixed(1)}MB). Max is 10MB.`);
      return;
    }
    const targetCode = fs.readFileSync(templatePath, 'utf8');
    if (!targetCode.trim()) {
      vscode.window.showErrorMessage('CodeTyper: Template file is empty.');
      return;
    }

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
        templatePath,
        wpm, errors, seconds,
        date: new Date().toISOString()
      });
    }, blindMode, showPreview, previewProvider);
    lastTemplatePath = templatePath;
  } catch (err) {
    vscode.window.showErrorMessage(`CodeTyper: ${err instanceof Error ? err.message : 'Unexpected error'}`);
  }
}

export function deactivate() {
  activeSession?.dispose();
}
