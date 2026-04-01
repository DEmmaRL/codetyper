import * as assert from 'assert';
import { tokenize, compareTokens, Token } from '../tokenizer';

// Helper: extract just the token values for readable assertions
const vals = (code: string) => tokenize(code).map((t: Token) => t.value);

suite('Tokenizer', () => {

  suite('tokenize()', () => {

    test('splits identifiers and punctuation', () => {
      assert.deepStrictEqual(vals('arr[i]'), ['arr', '[', 'i', ']']);
    });

    test('spaces around tokens are ignored', () => {
      assert.deepStrictEqual(vals('arr[ i ]'), ['arr', '[', 'i', ']']);
    });

    test('multi-char operators are single tokens', () => {
      assert.deepStrictEqual(vals('a->b'), ['a', '->', 'b']);
      assert.deepStrictEqual(vals('a::b'), ['a', '::', 'b']);
      assert.deepStrictEqual(vals('a<<b'), ['a', '<<', 'b']);
      assert.deepStrictEqual(vals('a!=b'), ['a', '!=', 'b']);
      assert.deepStrictEqual(vals('a++'), ['a', '++']);
    });

    test('string literal is a single token', () => {
      assert.deepStrictEqual(vals('"hello world"'), ['"hello world"']);
    });

    test('string with escape sequences is a single token', () => {
      assert.deepStrictEqual(vals('"he said \\"hi\\""'), ['"he said \\"hi\\""']);
    });

    test('char literal is a single token', () => {
      assert.deepStrictEqual(vals("'\\n'"), ["'\\n'"]);
    });

    test('line comments are skipped', () => {
      assert.deepStrictEqual(vals('int x; // comment'), ['int', 'x', ';']);
    });

    test('block comments are skipped', () => {
      assert.deepStrictEqual(vals('int /* comment */ x;'), ['int', 'x', ';']);
    });

    test('block comment spanning multiple lines is skipped', () => {
      assert.deepStrictEqual(vals('int /*\n  comment\n*/ x;'), ['int', 'x', ';']);
    });

    test('empty string returns no tokens', () => {
      assert.deepStrictEqual(vals(''), []);
    });

    test('whitespace-only string returns no tokens', () => {
      assert.deepStrictEqual(vals('   \n\t  '), []);
    });

    test('comment-only string returns no tokens', () => {
      assert.deepStrictEqual(vals('// nothing'), []);
    });

    test('offset is correct for range mapping', () => {
      const tokens = tokenize('int x = 0;');
      assert.strictEqual(tokens[0].offset, 0);  // 'int'
      assert.strictEqual(tokens[1].offset, 4);  // 'x'
      assert.strictEqual(tokens[2].offset, 6);  // '='
      assert.strictEqual(tokens[3].offset, 8);  // '0'
      assert.strictEqual(tokens[4].offset, 9);  // ';'
    });

    test('token index is sequential from 0', () => {
      const tokens = tokenize('a + b');
      assert.deepStrictEqual(tokens.map(t => t.index), [0, 1, 2]);
    });

    test('calling tokenize twice gives consistent results (no lastIndex bug)', () => {
      const first  = vals('int x;');
      const second = vals('int x;');
      assert.deepStrictEqual(first, second);
    });

    test('real C++ snippet tokenizes correctly', () => {
      assert.deepStrictEqual(
        vals('dist[src] = 0;'),
        ['dist', '[', 'src', ']', '=', '0', ';']
      );
    });

    test('dijkstra priority_queue line: >> is one token (user must type >> not > >)', () => {
      assert.deepStrictEqual(
        vals('priority_queue<pair<int,int>, vector<pair<int,int>>, greater<>> pq;'),
        ['priority_queue', '<', 'pair', '<', 'int', ',', 'int', '>', ',',
         'vector', '<', 'pair', '<', 'int', ',', 'int', '>>', ',',
         'greater', '<', '>>', 'pq', ';']
      );
    });

    test('structured binding tokenizes correctly', () => {
      assert.deepStrictEqual(vals('auto [d, u] = pq.top();'),
        ['auto', '[', 'd', ',', 'u', ']', '=', 'pq', '.', 'top', '(', ')', ';']);
    });

  });

  suite('compareTokens()', () => {

    test('identical token streams have no errors', () => {
      const t = tokenize('int x = 0;');
      assert.deepStrictEqual(compareTokens(t, t), []);
    });

    test('spacing differences produce no errors', () => {
      const target = tokenize('arr[i]');
      const typed  = tokenize('arr[ i ]');
      assert.deepStrictEqual(compareTokens(target, typed), []);
    });

    test('wrong token is reported', () => {
      const target = tokenize('int x;');
      const typed  = tokenize('int y;');
      const errors = compareTokens(target, typed);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].expected, 'x');
      assert.strictEqual(errors[0].got, 'y');
    });

    test('extra typed tokens are reported as errors', () => {
      const target = tokenize('int x;');
      const typed  = tokenize('int x; extra');
      const errors = compareTokens(target, typed);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].got, 'extra');
    });

    test('missing tokens are reported as errors', () => {
      const target = tokenize('int x;');
      const typed  = tokenize('int x');
      const errors = compareTokens(target, typed);
      assert.strictEqual(errors.length, 1);
      assert.strictEqual(errors[0].expected, ';');
      assert.strictEqual(errors[0].got, '');
    });

    test('empty vs empty has no errors', () => {
      assert.deepStrictEqual(compareTokens([], []), []);
    });

    test('empty target with typed tokens reports all as errors', () => {
      const typed = tokenize('int x;');
      const errors = compareTokens([], typed);
      assert.strictEqual(errors.length, 3);
    });

    test('tokenIndex in error matches position in array', () => {
      const target = tokenize('a b c');
      const typed  = tokenize('a X c');
      const errors = compareTokens(target, typed);
      assert.strictEqual(errors[0].tokenIndex, 1);
    });

    test('multiple errors are all reported', () => {
      const target = tokenize('a b c');
      const typed  = tokenize('X Y Z');
      assert.strictEqual(compareTokens(target, typed).length, 3);
    });

  });

});
