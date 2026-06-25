// Optional epistemic-planning backend (Phase 2). When VITE_EPISTEMIC_API is set
// at build time, epistemic (PDKBDDL) problems can be solved on a server running
// pdkb-planning (RP-MEP) (see ../../../pddl-epistemic-backend). When it is
// unset, the app stays fully offline and epistemic mode is explain-only.

const API = import.meta.env.VITE_EPISTEMIC_API?.replace(/\/$/, '');

export function epistemicApiConfigured(): boolean {
  return !!API;
}

export interface EpistemicResult {
  ok: boolean;
  plan?: string[];
  stats?: { planLength?: number; nodesExpanded?: number; searchTimeMs?: number };
  /** EFP only: the initial belief state and the state after each plan action,
   * each as graphviz DOT for in-browser rendering. */
  states?: { label: string; dot: string }[];
  output?: string;
  returncode?: number;
  error?: string;
}

// The two epistemic planners reachable on the backend:
//   rpmep — pdkb-planning (PDKBDDL), compiles to classical planning
//   efp   — native EFP (E-PDDL), builds explicit possibility/Kripke states
export type EpistemicPlanner = 'rpmep' | 'efp';

export async function solveEpistemic(pdkbddl: string): Promise<EpistemicResult> {
  return postSolve('/solve', { pdkbddl });
}

// EFP takes E-PDDL as a separate domain and problem; the backend forwards this
// to the native EFP service.
export async function solveEFP(
  domain: string,
  problem: string,
): Promise<EpistemicResult> {
  return postSolve('/solve-efp', { domain, problem });
}

async function postSolve(
  path: string,
  body: Record<string, string>,
): Promise<EpistemicResult> {
  if (!API) return { ok: false, error: 'No epistemic backend configured.' };
  try {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `Backend returned HTTP ${res.status}` };
    }
    return (await res.json()) as EpistemicResult;
  } catch (err) {
    return {
      ok: false,
      error: `Could not reach the epistemic backend: ${String(err)}`,
    };
  }
}
