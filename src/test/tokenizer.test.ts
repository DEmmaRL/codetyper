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

    test('char literal is a single token', () => {
      assert.deepStrictEqual(vals("'\\n'"), ["'\\n'"]);
    });

    test('line comments are skipped', () => {
      assert.deepStrictEqual(vals('int x; // comment'), ['int', 'x', ';']);
    });

    test('block comments are skipped', () => {
      assert.deepStrictEqual(vals('int /* comment */ x;'), ['int', 'x', ';']);
    });

    test('offset is correct for range mapping', () => {
      const tokens = tokenize('int x = 0;');
      assert.strictEqual(tokens[0].offset, 0);  // 'int'
      assert.strictEqual(tokens[1].offset, 4);  // 'x'
      assert.strictEqual(tokens[2].offset, 6);  // '='
      assert.strictEqual(tokens[3].offset, 8);  // '0'
      assert.strictEqual(tokens[4].offset, 9);  // ';'
    });

    test('real C++ snippet tokenizes correctly', () => {
      const code = 'dist[src] = 0;';
      assert.deepStrictEqual(vals(code), ['dist', '[', 'src', ']', '=', '0', ';']);
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

  });

});
