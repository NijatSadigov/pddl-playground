// Compile :negative-preconditions away into an equivalent positive STRIPS+typing
// encoding that pyperplan accepts ("positive normal form").
//
// For every predicate P that appears negated in a precondition or goal, a
// complementary predicate `not-P` is introduced, then:
//   * preconditions/goal:  (not (P a))      ->  (not-P a)
//   * effects that add P:   (P a)            ->  (P a) + (not (not-P a))
//   * effects that delete P:(not (P a))      ->  (not (P a)) + (not-P a)
//   * initial state:        add (not-P a) for every typed tuple where (P a) is
//                           not initially true (closed-world assumption).
//
// This lets the original MineField dissertation domain (which uses
// :negative-preconditions) run unchanged in the browser.

import { type SExpr, tokenize, readSExpr } from './parser';

const isList = (e: SExpr): e is SExpr[] => Array.isArray(e);
const isAtom = (e: SExpr): e is string => typeof e === 'string';

const COMPLEMENT_PREFIX = 'not-';
// Guard against a closed-world blow-up on large/high-arity predicates.
const MAX_INIT_TUPLES = 200_000;

export interface CompileResult {
  changed: boolean;
  domain: string;
  problem: string;
  negated: string[];
  addedFacts: number;
  error?: string;
}

interface Typed {
  name: string;
  type: string;
}

function parseTypedList(items: SExpr[]): Typed[] {
  const out: Typed[] = [];
  let pending: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const tok = items[i];
    if (!isAtom(tok)) continue;
    if (tok === '-') {
      const type = isAtom(items[i + 1]) ? (items[i + 1] as string) : 'object';
      i++;
      for (const n of pending) out.push({ name: n, type });
      pending = [];
    } else {
      pending.push(tok);
    }
  }
  for (const n of pending) out.push({ name: n, type: 'object' });
  return out;
}

function section(tree: SExpr[], head: string): SExpr[] | undefined {
  for (const s of tree) if (isList(s) && s[0] === head) return s;
  return undefined;
}

// Collect predicate names that appear as (not (P ...)) anywhere in expr.
function collectNegated(expr: SExpr, into: Set<string>): void {
  if (!isList(expr)) return;
  if (expr[0] === 'not' && isList(expr[1]) && isAtom(expr[1][0])) {
    into.add(expr[1][0]);
    return;
  }
  for (const child of expr) collectNegated(child, into);
}

// Rewrite (not (P a)) -> (not-P a) for P in neg, recursively.
function rewritePositive(expr: SExpr, neg: Set<string>): SExpr {
  if (!isList(expr)) return expr;
  if (
    expr[0] === 'not' &&
    isList(expr[1]) &&
    isAtom(expr[1][0]) &&
    neg.has(expr[1][0])
  ) {
    const inner = expr[1];
    return [COMPLEMENT_PREFIX + inner[0], ...inner.slice(1)];
  }
  return expr.map((c) => rewritePositive(c, neg));
}

function effectItems(effect: SExpr): SExpr[] {
  if (isList(effect) && effect[0] === 'and') return effect.slice(1);
  return [effect];
}

// Mirror complement predicates inside an action effect.
function rewriteEffect(effect: SExpr, neg: Set<string>): SExpr {
  const out: SExpr[] = [];
  for (const item of effectItems(effect)) {
    if (!isList(item)) {
      out.push(item);
      continue;
    }
    if (item[0] === 'not' && isList(item[1])) {
      // delete P  ->  also set not-P true
      out.push(item);
      const inner = item[1];
      const pname = inner[0];
      if (isAtom(pname) && neg.has(pname))
        out.push([COMPLEMENT_PREFIX + pname, ...inner.slice(1)]);
    } else if (isAtom(item[0])) {
      // add P  ->  also set not-P false
      out.push(item);
      if (neg.has(item[0]))
        out.push(['not', [COMPLEMENT_PREFIX + item[0], ...item.slice(1)]]);
    } else {
      out.push(item);
    }
  }
  return out.length === 1 ? out[0] : ['and', ...out];
}

function rewriteAction(action: SExpr[], neg: Set<string>): SExpr {
  return action.map((part, i) => {
    const key = action[i - 1];
    if (key === ':precondition') return rewritePositive(part, neg);
    if (key === ':effect') return rewriteEffect(part, neg);
    return part;
  });
}

// --- serialization (PDDL pretty-printer) --------------------------------------

function serInline(e: SExpr): string {
  if (isAtom(e)) return e;
  return '(' + e.map(serInline).join(' ') + ')';
}

function serialize(e: SExpr, indent = 0): string {
  if (isAtom(e)) return e;
  if (e.length === 0) return '()';
  const inline = serInline(e);
  if (inline.length <= 76) return inline;
  const head = serInline(e[0]);
  const pad = '  '.repeat(indent + 1);
  const rest = e.slice(1).map((c) => '\n' + pad + serialize(c, indent + 1));
  return '(' + head + rest.join('') + ')';
}

// --- type-aware object enumeration --------------------------------------------

function ancestors(type: string, parent: Map<string, string>): Set<string> {
  const out = new Set<string>([type, 'object']);
  let cur = type;
  const seen = new Set<string>();
  while (parent.has(cur) && !seen.has(cur)) {
    seen.add(cur);
    cur = parent.get(cur)!;
    out.add(cur);
  }
  return out;
}

function product(lists: string[][]): string[][] {
  return lists.reduce<string[][]>(
    (acc, list) => acc.flatMap((a) => list.map((x) => [...a, x])),
    [[]],
  );
}

export function compileNegativePreconditions(
  domainText: string,
  problemText: string,
): CompileResult {
  const unchanged: CompileResult = {
    changed: false,
    domain: domainText,
    problem: problemText,
    negated: [],
    addedFacts: 0,
  };

  let domainTree: SExpr;
  let problemTree: SExpr;
  try {
    domainTree = readSExpr(tokenize(domainText));
    problemTree = readSExpr(tokenize(problemText));
  } catch (e) {
    return { ...unchanged, error: `Parse error: ${String(e)}` };
  }
  if (!isList(domainTree) || !isList(problemTree)) return unchanged;

  // 1. Find predicates negated in any action precondition or in the goal.
  const neg = new Set<string>();
  for (const s of domainTree) {
    if (isList(s) && s[0] === ':action') {
      for (let i = 0; i < s.length; i++)
        if (s[i] === ':precondition') collectNegated(s[i + 1], neg);
    }
  }
  const goal = section(problemTree, ':goal');
  if (goal) collectNegated(goal[1], neg);

  if (neg.size === 0) return unchanged;

  try {
    // 2. Predicate declarations -> parameter types per complemented predicate.
    const predsSection = section(domainTree, ':predicates');
    const declParams = new Map<string, SExpr[]>(); // name -> raw param tokens
    const declTypes = new Map<string, string[]>(); // name -> ordered types
    if (predsSection) {
      for (const decl of predsSection.slice(1)) {
        if (isList(decl) && isAtom(decl[0])) {
          declParams.set(decl[0], decl.slice(1));
          declTypes.set(
            decl[0],
            parseTypedList(decl.slice(1)).map((p) => p.type),
          );
        }
      }
    }

    const complementDecls: SExpr[] = [...neg].map((p) => [
      COMPLEMENT_PREFIX + p,
      ...(declParams.get(p) ?? []),
    ]);

    // 3. Rewrite the domain.
    const newDomain = domainTree.map((s) => {
      if (!isList(s)) return s;
      if (s[0] === ':requirements')
        return s.filter((x) => x !== ':negative-preconditions');
      if (s[0] === ':predicates') return [...s, ...complementDecls];
      if (s[0] === ':action') return rewriteAction(s, neg);
      return s;
    });

    // 4. Type hierarchy + objects for closed-world init.
    const typesSection = section(domainTree, ':types');
    const parent = new Map<string, string>();
    if (typesSection)
      for (const { name, type } of parseTypedList(typesSection.slice(1)))
        parent.set(name, type);

    const objectsSection = section(problemTree, ':objects');
    const objects = objectsSection
      ? parseTypedList(objectsSection.slice(1))
      : [];
    const objectsOfType = (t: string): string[] =>
      objects
        .filter((o) => t === 'object' || ancestors(o.type, parent).has(t))
        .map((o) => o.name);

    // 5. Closed-world: add (not-P tuple) for every tuple where P is not in init.
    const initSection = section(problemTree, ':init');
    const initAtoms = initSection
      ? initSection.slice(1).filter(isList)
      : [];
    const initKeys = new Set(
      initAtoms.map((a) => (a as string[]).join('|')),
    );

    const newInit: SExpr[] = [];
    for (const p of neg) {
      const types = declTypes.get(p);
      if (!types) continue; // undeclared predicate: cannot enumerate safely
      const lists = types.map(objectsOfType);
      const count = lists.reduce((n, l) => n * l.length, 1);
      if (count > MAX_INIT_TUPLES)
        throw new Error(
          `closed-world init for "${p}" would need ${count} facts (limit ${MAX_INIT_TUPLES})`,
        );
      for (const tuple of product(lists)) {
        const key = [p, ...tuple].join('|');
        if (!initKeys.has(key))
          newInit.push([COMPLEMENT_PREFIX + p, ...tuple]);
      }
    }

    // 6. Rewrite the problem (extend init, rewrite goal).
    const newProblem = problemTree.map((s) => {
      if (!isList(s)) return s;
      if (s[0] === ':init') return [...s, ...newInit];
      if (s[0] === ':goal') return [s[0], rewritePositive(s[1], neg)];
      return s;
    });

    return {
      changed: true,
      domain: serialize(newDomain),
      problem: serialize(newProblem),
      negated: [...neg],
      addedFacts: newInit.length,
    };
  } catch (e) {
    return { ...unchanged, error: String(e) };
  }
}
