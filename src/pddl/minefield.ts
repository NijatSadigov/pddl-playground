// Helpers to interpret a MineField state as a 2-D grid for the domain-specific
// visualiser. Location objects are named `loc-<row>-<col>`.

import { type Atom, type Domain, type Problem } from './parser';

const LOC_RE = /^loc-(\d+)-(\d+)$/;

export interface GridLayout {
  size: number;
  obstacles: Set<string>; // "row,col"
  goldStart: { id: string; row: number; col: number }[];
}

export interface GridState {
  robot: { row: number; col: number } | null;
  collected: Set<string>; // gold ids
}

const cellKey = (r: number, c: number) => `${r},${c}`;
const parseLoc = (name: string): [number, number] | null => {
  const m = name.match(LOC_RE);
  return m ? [Number(m[1]), Number(m[2])] : null;
};

export function isMinefield(domain: Domain, problem: Problem): boolean {
  if (domain.name === 'minefield') return true;
  // Fallback: looks like a grid if there are loc-r-c objects and an `at` action.
  const hasLocs = problem.objects.some((o) => LOC_RE.test(o.name));
  return hasLocs && domain.actions.has('move') && domain.actions.has('collect');
}

export function gridLayout(problem: Problem): GridLayout {
  let size = 0;
  const obstacles = new Set<string>();
  const goldStart: GridLayout['goldStart'] = [];

  // Determine grid size from all location objects.
  const locs: [number, number][] = [];
  for (const o of problem.objects) {
    const p = parseLoc(o.name);
    if (p) {
      locs.push(p);
      size = Math.max(size, p[0] + 1, p[1] + 1);
    }
  }

  // Two conventions: the positive variant flags passable cells with (clear loc)
  // — anything not clear is an obstacle; the original domain flags obstacles
  // directly with (obstacle-at loc).
  const clearAtoms = problem.init.filter((a) => a[0] === 'clear');
  if (clearAtoms.length > 0) {
    const clear = new Set<string>();
    for (const a of clearAtoms) {
      const p = parseLoc(a[1]);
      if (p) clear.add(cellKey(p[0], p[1]));
    }
    for (const [r, c] of locs) {
      if (!clear.has(cellKey(r, c))) obstacles.add(cellKey(r, c));
    }
  } else {
    for (const a of problem.init) {
      if (a[0] === 'obstacle-at') {
        const p = parseLoc(a[1]);
        if (p) obstacles.add(cellKey(p[0], p[1]));
      }
    }
  }

  // Initial gold positions.
  for (const a of problem.init) {
    if (a[0] === 'gold-at') {
      const p = parseLoc(a[2]);
      if (p) goldStart.push({ id: a[1], row: p[0], col: p[1] });
    }
  }

  return { size, obstacles, goldStart };
}

export function gridStateFrom(state: Atom[]): GridState {
  let robot: GridState['robot'] = null;
  const collected = new Set<string>();
  for (const a of state) {
    if (a[0] === 'at') {
      const p = parseLoc(a[2]);
      if (p) robot = { row: p[0], col: p[1] };
    } else if (a[0] === 'collected') {
      collected.add(a[1]);
    }
  }
  return { robot, collected };
}
