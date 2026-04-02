import * as vscode from 'vscode';

export interface SessionRecord {
  template: string;       // basename of the template file
  templatePath?: string;  // full path for restarting (optional for backwards compat)
  wpm: number;
  errors: number;
  seconds: number;
  date: string;           // ISO string
}

const STORAGE_KEY = 'codetyper.history';

export function saveRecord(context: vscode.ExtensionContext, record: SessionRecord) {
  const raw = vscode.workspace.getConfiguration('codetyper').get<number>('maxHistory') ?? 1000;
  const max = Math.max(1, Math.min(10000, Math.floor(raw)));
  const history = getHistory(context);
  history.unshift(record);
  context.globalState.update(STORAGE_KEY, history.slice(0, max));
}

export function getHistory(context: vscode.ExtensionContext): SessionRecord[] {
  return context.globalState.get<SessionRecord[]>(STORAGE_KEY) ?? [];
}
