/**
 * C++ tokenizer for CodeTyper.
 *
 * Tokens are matched in priority order (left to right in the regex alternation):
 *   1. Line comments      //...          — skipped, not compared
 *   2. Block comments     /* ... *\/     — skipped, not compared
 *   3. String literals    "..."          — treated as one token
 *   4. Char literals      '.'            — treated as one token
 *   5. Identifiers        foo, int, _x   — letters/digits/underscore
 *   6. Numbers            42, 3.14       — integer or simple float
 *   7. Multi-char ops     ->, ::, <<, >>, <=, >=, ==, !=, ++, --, &&, ||
 *   8. Single-char punct  + - * / % & | ^ ~ < > = ! ? : ; , . ( ) [ ] { }
 *
 * Whitespace is intentionally ignored between tokens, so spacing differences
 * (e.g. "arr[ i ]" vs "arr[i]") never count as errors.
 */

export interface Token {
  value: string;
  /** Zero-based position in the token array (used for diff indexing). */
  index: number;
  /** Character offset in the source string (used for range mapping). */
  offset: number;
}

export interface DiffResult {
  tokenIndex: number; // which token is wrong
  expected: string;
  got: string;
}

// Regex groups listed in match-priority order (see module doc above).
const CPP_TOKEN_RE =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-zA-Z_]\w*|\d+(?:\.\d+)?|->|::|<<|>>|<=|>=|==|!=|\+\+|--|&&|\|\||[+\-*/%&|^~<>=!?:;,.()\[\]{}]/g;

/**
 * Tokenizes C++ source code into an ordered array of tokens.
 * Comments are consumed by the regex but excluded from the output.
 */
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = CPP_TOKEN_RE.exec(code)) !== null) {
    // Skip comments (groups 1 & 2 in the alternation)
    if (match[0].startsWith('//') || match[0].startsWith('/*')) { continue; }
    tokens.push({ value: match[0], index: index++, offset: match.index });
  }
  return tokens;
}

/**
 * Compares typed tokens against target tokens position by position.
 * Extra tokens typed beyond the target length are also reported as errors.
 * Returns an array of mismatches; empty array means perfect match.
 */
export function compareTokens(target: Token[], typed: Token[]): DiffResult[] {
  const errors: DiffResult[] = [];
  const len = Math.max(target.length, typed.length);
  for (let i = 0; i < len; i++) {
    const t = target[i]?.value;
    const u = typed[i]?.value;
    if (t !== u) {
      errors.push({ tokenIndex: i, expected: t ?? '', got: u ?? '' });
    }
  }
  return errors;
}

