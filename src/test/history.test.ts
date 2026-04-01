import * as assert from 'assert';
import * as vscode from 'vscode';
import { saveRecord, getHistory, SessionRecord } from '../history';

function makeCtx(): vscode.ExtensionContext {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get: <T>(key: string) => store.get(key) as T | undefined,
      update: (_key: string, value: unknown) => { store.set(_key, value); return Promise.resolve(); },
      keys: () => [],
      setKeysForSync: () => {}
    }
  } as unknown as vscode.ExtensionContext;
}

function record(template: string): SessionRecord {
  return { template, wpm: 60, errors: 0, seconds: 30, date: new Date().toISOString() };
}

async function withMaxHistory(value: number, fn: (ctx: vscode.ExtensionContext) => void) {
  await vscode.workspace.getConfiguration('codetyper').update('maxHistory', value, vscode.ConfigurationTarget.Global);
  try {
    fn(makeCtx());
  } finally {
    await vscode.workspace.getConfiguration('codetyper').update('maxHistory', undefined, vscode.ConfigurationTarget.Global);
  }
}

suite('History', () => {

  test('getHistory returns empty array when nothing saved', () => {
    assert.deepStrictEqual(getHistory(makeCtx()), []);
  });

  test('saveRecord persists and getHistory retrieves it', () => {
    const ctx = makeCtx();
    saveRecord(ctx, record('dijkstra.cpp'));
    const h = getHistory(ctx);
    assert.strictEqual(h.length, 1);
    assert.strictEqual(h[0].template, 'dijkstra.cpp');
  });

  test('records are stored newest-first', () => {
    const ctx = makeCtx();
    saveRecord(ctx, record('a.cpp'));
    saveRecord(ctx, record('b.cpp'));
    assert.strictEqual(getHistory(ctx)[0].template, 'b.cpp');
  });

  test('maxHistory clamps history length', async () => {
    await withMaxHistory(2, ctx => {
      saveRecord(ctx, record('a.cpp'));
      saveRecord(ctx, record('b.cpp'));
      saveRecord(ctx, record('c.cpp'));
      const h = getHistory(ctx);
      assert.strictEqual(h.length, 2);
      assert.strictEqual(h[0].template, 'c.cpp');
    });
  });

  test('negative maxHistory is treated as 1', async () => {
    await withMaxHistory(-5, ctx => {
      saveRecord(ctx, record('a.cpp'));
      saveRecord(ctx, record('b.cpp'));
      assert.strictEqual(getHistory(ctx).length, 1);
    });
  });

  test('maxHistory of 0 is treated as 1', async () => {
    await withMaxHistory(0, ctx => {
      saveRecord(ctx, record('a.cpp'));
      assert.strictEqual(getHistory(ctx).length, 1);
    });
  });

});
