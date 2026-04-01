import * as assert from 'assert';
import * as vscode from 'vscode';
import { TypingSession } from '../session';

async function openEditor(content = ''): Promise<vscode.TextEditor> {
  const doc = await vscode.workspace.openTextDocument({ language: 'cpp', content });
  return vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
}

async function typeInto(editor: vscode.TextEditor, text: string) {
  await editor.edit(eb => eb.insert(new vscode.Position(0, 0), text));
  const end = editor.document.positionAt(editor.document.getText().length);
  editor.selection = new vscode.Selection(end, end);
}

/** Force a decoration update via the private method. */
function update(session: TypingSession) {
  (session as unknown as { _updateDecorations(): void })._updateDecorations();
}

suite('TypingSession', () => {

  test('disposes without error on empty document', async () => {
    const editor = await openEditor();
    const session = new TypingSession(editor, 'int x;', () => {});
    assert.doesNotThrow(() => session.dispose());
  });

  test('toggleBlind changes status bar icon', async () => {
    const editor = await openEditor();
    const session = new TypingSession(editor, 'int x;', () => {}, false);
    const bar = (session as unknown as { statusBar: vscode.StatusBarItem }).statusBar;
    assert.ok(!bar.text.includes('[blind]'), 'should start without blind icon');
    session.toggleBlind();
    update(session);
    assert.ok(bar.text.includes('[blind]'), 'should show blind icon after toggle');
    session.toggleBlind();
    update(session);
    assert.ok(!bar.text.includes('[blind]'), 'should remove blind icon after toggle back');
    session.dispose();
  });

  test('onComplete is called when all tokens typed correctly', async () => {
    const template = 'int x;';
    let called = false;
    const editor = await openEditor();
    const session = new TypingSession(editor, template, () => { called = true; });
    await typeInto(editor, template);
    update(session);
    assert.ok(called, 'onComplete should have been called');
  });

  test('onComplete is NOT called when there are errors', async () => {
    let called = false;
    const editor = await openEditor();
    const session = new TypingSession(editor, 'int x;', () => { called = true; });
    await typeInto(editor, 'int y;');
    update(session);
    assert.ok(!called);
    session.dispose();
  });

  test('status bar shows token progress', async () => {
    const editor = await openEditor();
    const session = new TypingSession(editor, 'int x;', () => {});
    const bar = (session as unknown as { statusBar: vscode.StatusBarItem }).statusBar;
    await typeInto(editor, 'int x');
    update(session);
    // 'int x' = 2 tokens; target 'int x;' = 3 tokens → "2/3 tokens"
    const match = bar.text.match(/(\d+)\/(\d+) tokens/);
    assert.ok(match, `status bar text unexpected: "${bar.text}"`);
    assert.strictEqual(match![1], '2', 'should show 2 typed tokens');
    assert.strictEqual(match![2], '3', 'target should have 3 tokens');
    session.dispose();
  });

  test('double dispose does not throw', async () => {
    const editor = await openEditor();
    const session = new TypingSession(editor, 'a', () => {});
    session.dispose();
    assert.doesNotThrow(() => session.dispose());
  });

});
