// Lightweight, line-aware PDDL sanity check for inline editor feedback. This is
// not a full validator — it catches the mistakes students actually make:
// unbalanced parentheses and a missing (define (domain|problem ...)) header.

export function validatePddl(
  text: string,
  kind: 'domain' | 'problem',
): string | null {
  let depth = 0;
  let line = 1;
  let inComment = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') {
      line++;
      inComment = false;
      continue;
    }
    if (inComment) continue;
    if (ch === ';') {
      inComment = true;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth < 0) return `Unexpected ')' on line ${line}`;
    }
  }
  if (depth > 0)
    return `${depth} unclosed '(' — check your parentheses`;

  const lower = text.toLowerCase();
  if (kind === 'domain' && !/\(\s*define\s+\(\s*domain\b/.test(lower))
    return 'Expected (define (domain ...))';
  if (kind === 'problem' && !/\(\s*define\s+\(\s*problem\b/.test(lower))
    return 'Expected (define (problem ...))';

  return null;
}
