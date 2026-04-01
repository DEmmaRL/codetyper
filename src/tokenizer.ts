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
  /** Zero-based line number in the source string. */
  line: number;
}

export interface DiffResult {
  tokenIndex: number; // which token is wrong
  expected: string;
  got: string;
}

// Regex groups listed in match-priority order (see module doc above).
// NOTE: Not using a module-level /g regex to avoid lastIndex state bugs between calls.
const CPP_TOKEN_SOURCE =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[a-zA-Z_]\w*|\d+(?:\.\d+)?|->|::|<<|>>|<=|>=|==|!=|\+\+|--|&&|\|\||[+\-*/%&|^~<>=!?:;,.()\[\]{}#]/;

/**
 * Tokenizes C++ source code into an ordered array of tokens.
 * Comments are consumed by the regex but excluded from the output.
 */
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const re = new RegExp(CPP_TOKEN_SOURCE.source, 'g');
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(code)) !== null) {
    if (match[0].startsWith('//') || match[0].startsWith('/*')) { continue; }
    const line = code.slice(0, match.index).split('\n').length - 1;
    tokens.push({ value: match[0], index: index++, offset: match.index, line });
  }
  return tokens;
}

/**
 * Compares typed tokens against target tokens position by position.
 *
 * In addition to token value mismatches, enforces that preprocessor directive
 * tokens (#define, #include, etc.) are not split across lines in the typed text,
 * since newlines are semantically significant for preprocessor directives in C++.
 */
export function compareTokens(target: Token[], typed: Token[]): DiffResult[] {
  const errors: DiffResult[] = [];
  const len = Math.max(target.length, typed.length);
  for (let i = 0; i < len; i++) {
    const t = target[i]?.value;
    const u = typed[i]?.value;
    if (t !== u) {
      errors.push({ tokenIndex: i, expected: t ?? '', got: u ?? '' });
      continue;
    }

    // Check that preprocessor directive tokens aren't split across lines.
    // A directive starts with '#' — all tokens on that target line must stay
    // on the same line in the typed text.
    if (typed[i] && target[i]) {
      const directiveStart = findDirectiveStart(target, i);
      if (directiveStart !== -1 && typed[i].line !== typed[directiveStart].line) {
        errors.push({ tokenIndex: i, expected: t ?? '', got: `(newline in preprocessor directive)` });
      }
    }
  }
  return errors;
}

/**
 * If token at `idx` belongs to a preprocessor directive line (a line whose
 * first token is '#'), returns the index of the '#' token. Otherwise -1.
 */
function findDirectiveStart(tokens: Token[], idx: number): number {
  const line = tokens[idx].line;
  // Find the first token on this line
  let start = idx;
  while (start > 0 && tokens[start - 1].line === line) { start--; }
  return tokens[start].value === '#' ? start : -1;
}

