// A small, forgiving PDDL parser. It is NOT a full PDDL implementation — it
// extracts exactly what the visualiser needs: action schemas (parameters +
// add/delete effects), the problem's initial state, objects, and the goal.
// PDDL is case-insensitive, so everything is lower-cased for canonical matching
// (pyperplan emits lower-cased plan steps too).

export type SExpr = string | SExpr[];

export function tokenize(src: string): string[] {
  const noComments = src.replace(/;[^\n]*/g, ' ');
  const tokens = noComments.toLowerCase().match(/[()]|[^\s()]+/g);
  return tokens ?? [];
}

export function readSExpr(tokens: string[]): SExpr {
  let i = 0;
  function read(): SExpr {
    const t = tokens[i++];
    if (t === undefined) throw new Error('Unexpected end of input');
    if (t === '(') {
      const list: SExpr[] = [];
      while (tokens[i] !== ')') {
        if (i >= tokens.length) throw new Error('Unbalanced parentheses');
        list.push(read());
      }
      i++; // consume ')'
      return list;
    }
    if (t === ')') throw new Error('Unexpected )');
    return t;
  }
  return read();
}

const isList = (e: SExpr): e is SExpr[] => Array.isArray(e);
const isAtom = (e: SExpr): e is string => typeof e === 'string';

/** A predicate atom, e.g. ["at", "r1", "loc-0-0"]. */
export type Atom = string[];

/** Canonical key for set membership, e.g. "at|r1|loc-0-0". */
export const atomKey = (a: Atom) => a.join('|');
/** Pretty form, e.g. "(at r1 loc-0-0)". */
export const atomStr = (a: Atom) => `(${a.join(' ')})`;

export interface ActionSchema {
  name: string;
  params: string[]; // variable names in order, e.g. ["?r", "?from", "?to"]
  add: Atom[]; // effect atoms to add (may contain variables)
  del: Atom[]; // effect atoms to delete (may contain variables)
}

export interface Domain {
  name: string;
  actions: Map<string, ActionSchema>;
  predicates: string[];
}

export interface Problem {
  name: string;
  domain: string;
  objects: { name: string; type: string }[];
  init: Atom[];
  goal: Atom[]; // positive conjuncts only
}

// Parse a typed list like "?r - robot ?from - location" or "a b - room".
// Returns the names (variables or objects), in order, with their types.
function parseTypedList(items: SExpr[]): { name: string; type: string }[] {
  const out: { name: string; type: string }[] = [];
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
  for (const n of pending) out.push({ name: n, type: 'object' }); // untyped
  return out;
}

function collectAtoms(expr: SExpr, addOut: Atom[], delOut: Atom[]) {
  if (!isList(expr) || expr.length === 0) return;
  const head = expr[0];
  if (!isAtom(head)) return;
  if (head === 'and') {
    for (let i = 1; i < expr.length; i++) collectAtoms(expr[i], addOut, delOut);
  } else if (head === 'not') {
    const inner = expr[1];
    if (isList(inner) && inner.every(isAtom)) delOut.push(inner as string[]);
  } else if (expr.every(isAtom)) {
    addOut.push(expr as string[]);
  }
  // forall / when (conditional/quantified effects) are ignored by this MVP.
}

export function parseDomain(src: string): Domain {
  const ast = readSExpr(tokenize(src));
  if (!isList(ast)) throw new Error('Domain is not a valid S-expression');
  const actions = new Map<string, ActionSchema>();
  const predicates: string[] = [];
  let name = 'domain';

  for (const form of ast) {
    if (!isList(form) || !isAtom(form[0])) continue;
    const head = form[0];
    if (head === 'domain' && isAtom(form[1])) {
      name = form[1];
    } else if (head === ':predicates') {
      for (let i = 1; i < form.length; i++) {
        const p = form[i];
        if (isList(p) && isAtom(p[0])) predicates.push(p[0]);
      }
    } else if (head === ':action') {
      const aName = isAtom(form[1]) ? form[1] : 'action';
      let params: string[] = [];
      const add: Atom[] = [];
      const del: Atom[] = [];
      for (let i = 2; i < form.length; i++) {
        if (form[i] === ':parameters' && isList(form[i + 1])) {
          params = parseTypedList(form[i + 1] as SExpr[]).map((p) => p.name);
        } else if (form[i] === ':effect') {
          collectAtoms(form[i + 1], add, del);
        }
      }
      actions.set(aName, { name: aName, params, add, del });
    }
  }
  return { name, actions, predicates };
}

export function parseProblem(src: string): Problem {
  const ast = readSExpr(tokenize(src));
  if (!isList(ast)) throw new Error('Problem is not a valid S-expression');
  let name = 'problem';
  let domain = 'domain';
  let objects: { name: string; type: string }[] = [];
  const init: Atom[] = [];
  let goal: Atom[] = [];

  for (const form of ast) {
    if (!isList(form) || !isAtom(form[0])) continue;
    const head = form[0];
    if (head === 'problem' && isAtom(form[1])) {
      name = form[1];
    } else if (head === ':domain' && isAtom(form[1])) {
      domain = form[1];
    } else if (head === ':objects') {
      objects = parseTypedList(form.slice(1));
    } else if (head === ':init') {
      for (let i = 1; i < form.length; i++) {
        const a = form[i];
        if (isList(a) && a.every(isAtom)) init.push(a as string[]);
      }
    } else if (head === ':goal') {
      const g: Atom[] = [];
      const dummy: Atom[] = [];
      collectAtoms(form[1], g, dummy); // positive conjuncts
      goal = g;
    }
  }
  return { name, domain, objects, init, goal };
}

/** Parse a plan step string "(move r1 loc-0-0 loc-0-1)" → ["move","r1",...]. */
export function parsePlanStep(step: string): Atom {
  const inner = step.trim().replace(/^\(/, '').replace(/\)$/, '');
  return inner.split(/\s+/).filter(Boolean).map((s) => s.toLowerCase());
}
