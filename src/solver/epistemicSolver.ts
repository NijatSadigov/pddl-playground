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
  output?: string;
  returncode?: number;
  error?: string;
}

export async function solveEpistemic(pdkbddl: string): Promise<EpistemicResult> {
  if (!API) return { ok: false, error: 'No epistemic backend configured.' };
  try {
    const res = await fetch(`${API}/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdkbddl }),
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
