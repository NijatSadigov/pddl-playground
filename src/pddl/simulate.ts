// Apply a plan to the initial state, action by action, producing the sequence
// of intermediate states plus the per-step add/delete diff. This is what powers
// the step-through visualiser.

import {
  type Atom,
  type Domain,
  type Problem,
  atomKey,
  parsePlanStep,
} from './parser';

export interface SimStep {
  index: number; // 1-based action number
  action: Atom; // ["move","r1","loc-0-0","loc-0-1"]
  added: Atom[];
  deleted: Atom[];
  state: Atom[]; // full state AFTER this action (sorted)
  goalMet: boolean;
}

export interface Simulation {
  initial: Atom[];
  steps: SimStep[];
  goal: Atom[];
  warnings: string[];
}

function substitute(atom: Atom, binding: Map<string, string>): Atom {
  return atom.map((t) => (t.startsWith('?') ? binding.get(t) ?? t : t));
}

function sortAtoms(set: Set<string>, lookup: Map<string, Atom>): Atom[] {
  return [...set]
    .map((k) => lookup.get(k)!)
    .sort((a, b) => atomKey(a).localeCompare(atomKey(b)));
}

export function simulate(
  domain: Domain,
  problem: Problem,
  plan: string[],
): Simulation {
  const warnings: string[] = [];
  const lookup = new Map<string, Atom>(); // key -> atom (for pretty output)
  const state = new Set<string>();

  const remember = (a: Atom) => {
    const k = atomKey(a);
    lookup.set(k, a);
    return k;
  };

  for (const a of problem.init) state.add(remember(a));
  const initial = sortAtoms(state, lookup);

  const goalMet = () => problem.goal.every((g) => state.has(atomKey(g)));

  const steps: SimStep[] = [];
  plan.forEach((stepStr, i) => {
    const action = parsePlanStep(stepStr);
    const [name, ...args] = action;
    const schema = domain.actions.get(name);

    const added: Atom[] = [];
    const deleted: Atom[] = [];

    if (!schema) {
      warnings.push(`Unknown action "${name}" — effects not applied.`);
    } else {
      const binding = new Map<string, string>();
      schema.params.forEach((p, idx) => binding.set(p, args[idx]));

      for (const eff of schema.del) {
        const atom = substitute(eff, binding);
        const k = atomKey(atom);
        if (state.has(k)) {
          state.delete(k);
          deleted.push(atom);
        }
      }
      for (const eff of schema.add) {
        const atom = substitute(eff, binding);
        const k = remember(atom);
        if (!state.has(k)) {
          state.add(k);
          added.push(atom);
        }
      }
    }

    steps.push({
      index: i + 1,
      action,
      added,
      deleted,
      state: sortAtoms(state, lookup),
      goalMet: goalMet(),
    });
  });

  return { initial, steps, goal: problem.goal, warnings };
}
