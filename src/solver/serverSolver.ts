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
): Promise<ServerSolveResult> {
  if (!API) return { ok: false, error: 'No solver backend configured.' };
  try {
    const res = await fetch(`${API}/solve-classical`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, problem }),
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
