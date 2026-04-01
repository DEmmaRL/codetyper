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
 * For each token index that belongs to a preprocessor directive, maps it to
 * the index of the '#' token that starts that directive.
 * O(n) — avoids repeated linear scans in compareTokens.
 */
function buildDirectiveMap(tokens: Token[]): Map<number, number> {
  const result = new Map<number, number>();
  let i = 0;
  while (i < tokens.length) {
    const lineStart = i;
    const line = tokens[i].line;
    while (i < tokens.length && tokens[i].line === line) { i++; }
    if (tokens[lineStart].value === '#') {
      for (let j = lineStart; j < i; j++) { result.set(j, lineStart); }
    }
  }
  return result;
}

/**
 * Compares typed tokens against target tokens position by position.
 *
 * Two kinds of errors are reported:
 *   1. Value mismatch — typed token differs from target token
 *   2. Preprocessor line violation:
 *      - A directive was split across lines (newline inside directive)
 *      - Two directives were merged onto the same line (missing newline between)
 */
export function compareTokens(target: Token[], typed: Token[]): DiffResult[] {
  const errors: DiffResult[] = [];
  // Map from token index → index of its directive's '#' (only for directive tokens)
  const directiveMap = buildDirectiveMap(target);
  const len = Math.max(target.length, typed.length);

  for (let i = 0; i < len; i++) {
    const t = target[i]?.value;
    const u = typed[i]?.value;

    if (t !== u) {
      errors.push({ tokenIndex: i, expected: t ?? '', got: u ?? '' });
      continue;
    }

    const hashIdx = directiveMap.get(i);
    if (hashIdx === undefined || !typed[i]) { continue; }

    // Rule 1: all tokens in a directive must be on the same typed line as its '#'
    if (typed[i].line !== typed[hashIdx].line) {
      errors.push({ tokenIndex: i, expected: t, got: '(newline inside preprocessor directive)' });
      continue;
    }

    // Rule 2: a '#' starting a directive must be on a different line than the previous token
    if (i === hashIdx && i > 0 && typed[i - 1] && typed[i].line === typed[i - 1].line) {
      errors.push({ tokenIndex: i, expected: t, got: '(missing newline before preprocessor directive)' });
    }
  }
  return errors;
}

