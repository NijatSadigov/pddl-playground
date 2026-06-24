// Main-thread client for the solver. The heavy lifting (Pyodide + pyperplan)
// happens in a Web Worker (solver.worker.ts) so the UI never freezes; this
// module just sends solve requests to the worker and relays status updates.

export interface SolveResult {
  ok: boolean;
  solved?: boolean;
  plan?: string[];
  log?: string;
  error?: string;
  elapsedMs?: number;
}

export interface SolverStats {
  variables?: number;
  operators?: number;
  nodesExpanded?: number;
  planLength?: number;
  searchTimeMs?: number;
}

type LoadPhase = 'idle' | 'loading-runtime' | 'installing-planner' | 'ready' | 'error';

const listeners = new Set<(phase: LoadPhase, detail?: string) => void>();

export function onSolverStatus(cb: (phase: LoadPhase, detail?: string) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(phase: LoadPhase, detail?: string) {
  listeners.forEach((cb) => cb(phase, detail));
}

let worker: Worker | null = null;
let enginePhase: LoadPhase = 'idle';
let readyPromise: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
const pending = new Map<number, (json: string) => void>();
let nextId = 1;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./solver.worker.ts', import.meta.url), {
    type: 'module',
  });
  worker.onmessage = (e: MessageEvent) => {
    const msg = e.data;
    if (!msg) return;
    if (msg.type === 'status') {
      enginePhase = msg.phase;
      emit(msg.phase, msg.detail);
      if (msg.phase === 'ready') readyResolve?.();
    } else if (msg.type === 'result') {
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg.resultJson);
      }
    }
  };
  worker.postMessage({ type: 'init' });
  return worker;
}

// Preload the worker + engine in the background. Resolves once ready.
export function getSolverEngine(): Promise<void> {
  ensureWorker();
  if (enginePhase === 'ready') return Promise.resolve();
  if (!readyPromise) {
    readyPromise = new Promise<void>((res) => {
      readyResolve = res;
    });
  }
  return readyPromise;
}

export function runPlanner(
  domain: string,
  problem: string,
  search: string,
  heuristic: string | null,
): Promise<SolveResult> {
  const w = ensureWorker();
  const id = nextId++;
  return new Promise<string>((resolve) => {
    pending.set(id, resolve);
    w.postMessage({
      type: 'solve',
      id,
      domain,
      problem,
      search,
      heuristic: heuristic ?? 'none',
    });
  }).then((json) => JSON.parse(json) as SolveResult);
}

// Pull the teaching-friendly numbers out of pyperplan's log output.
export function parseStats(log: string | undefined, planLength: number): SolverStats {
  const stats: SolverStats = { planLength };
  if (!log) return stats;
  const num = (re: RegExp) => {
    const m = log.match(re);
    return m ? Number(m[1]) : undefined;
  };
  stats.variables = num(/(\d+) Variables created/);
  stats.operators = num(/(\d+) Operators created/);
  stats.nodesExpanded = num(/(\d+) Nodes expanded/);
  return stats;
}
