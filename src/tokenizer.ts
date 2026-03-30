// Tokenizes source code into meaningful tokens, ignoring whitespace differences.
// Comparison is token-based so "arr[ i ]" == "arr[i]" and extra newlines don't matter.

export interface Token {
  value: string;
  index: number; // position in token array
}

// Simple regex-based tokenizer — handles C++, Python, Java, etc.
// Splits on whitespace but keeps all non-whitespace sequences as tokens.
export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  const regex = /[^\s]+/g;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = regex.exec(code)) !== null) {
    tokens.push({ value: match[0], index: index++ });
  }
  return tokens;
}

export interface DiffResult {
  tokenIndex: number;   // which token is wrong
  expected: string;
  got: string;
}

// Compare typed tokens against target tokens.
// Returns list of mismatches.
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
