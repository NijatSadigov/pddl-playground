// Optional server-side classical solver. The same backend that hosts the
// epistemic endpoint (VITE_EPISTEMIC_API) also exposes /solve-classical, which
// runs a full-PDDL planner (LAPKT BFWS). It accepts features the in-browser
// pyperplan engine cannot: negative preconditions, conditional effects, and
// action costs. When the variable is unset, this solver is unavailable and the
// app stays fully offline.

const API = import.meta.env.VITE_EPISTEMIC_API?.replace(/\/$/, '');

export function serverApiConfigured(): boolean {
  return !!API;
}

// Bundled LAPKT planners exposed by the backend's /solve-classical endpoint.
// Each id must match a key of the backend's allowlist.
export interface ServerPlanner {
  id: string;
  label: string;
  description: string;
}

export const SERVER_PLANNERS: ServerPlanner[] = [
  {
    id: 'siw-then-bfsf',
    label: 'SIW + BFS(f)',
    description:
      'Serialised Iterated Width, falling back to best-first search with the FF heuristic. A robust default that solves most problems quickly.',
  },
  {
    id: 'bfws',
    label: 'Best-First Width Search',
    description:
      'Combines a novelty (width) measure with goal-counting heuristics. A strong satisficing planner across many benchmarks.',
  },
  {
    id: 'bfs_f',
    label: 'Best-First Search + FF',
    description:
      'Best-first search guided by the FF relaxed-plan heuristic — classic informed heuristic search.',
  },
  {
    id: 'siw',
    label: 'Serialised Iterated Width',
    description:
      'Decomposes the goal into subgoals and solves each with bounded-width search, with no heuristic guidance.',
  },
  {
    id: 'fd-lama-first',
    label: 'Fast Downward · LAMA-first',
    description:
      'Fast Downward in the LAMA-first configuration: a fast satisficing planner (greedy search with the FF and landmark heuristics). Returns a plan quickly; not guaranteed optimal.',
  },
  {
    id: 'fd-opt-lmcut',
    label: 'Fast Downward · A* + LM-Cut (optimal)',
    description:
      'Fast Downward running A* with the admissible LM-Cut heuristic, so the plan is cost-optimal. Slower and more memory-intensive than satisficing search.',
  },
  {
    id: 'fd-opt-blind',
    label: 'Fast Downward · A* + blind (optimal)',
    description:
      'Fast Downward running A* with a blind (uninformed) heuristic: still cost-optimal, but explores far more states. Shows how much an admissible heuristic helps.',
  },
];

export const DEFAULT_SERVER_PLANNER = 'siw-then-bfsf';

export interface ServerSolveStats {
  cost?: number;
  nodesExpanded?: number;
  nodesGenerated?: number;
  totalTimeMs?: number;
}

export interface ServerSolveResult {
  ok: boolean;
  plan?: string[];
  stats?: ServerSolveStats;
  output?: string;
  returncode?: number;
  error?: string;
}

export async function solveClassicalServer(
  domain: string,
  problem: string,
  planner: string = DEFAULT_SERVER_PLANNER,
): Promise<ServerSolveResult> {
  if (!API) return { ok: false, error: 'No solver backend configured.' };
  try {
    const res = await fetch(`${API}/solve-classical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, problem, planner }),
    });
    if (!res.ok) {
      return { ok: false, error: `Backend returned HTTP ${res.status}` };
    }
    const data = (await res.json()) as ServerSolveResult;
    // The planner emits actions in upper case; PDDL is case-insensitive, so
    // normalise to lower case to match the editor sources and the visualiser.
    if (data.plan) data.plan = data.plan.map((a) => a.toLowerCase());
    return data;
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the solver backend: ${String(err)}`,
    };
  }
}
