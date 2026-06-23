// Loads Pyodide (CPython compiled to WebAssembly) from a public CDN and runs the
// pure-Python `pyperplan` planner entirely in the browser. Nothing is installed
// on the host server: the WASM runtime and the pyperplan wheel are fetched from
// jsDelivr / PyPI at runtime and cached by the browser.

const PYODIDE_VERSION = 'v0.28.0';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

// The Python driver. Defined once after the package is installed; we then call
// `solve(...)` for each planning request and get a JSON string back.
const PY_DRIVER = `
import io, json, logging, time
from pyperplan.planner import SEARCHES, HEURISTICS, search_plan

def solve(domain_text, problem_text, search_name, heuristic_name):
    with open('/domain.pddl', 'w') as f:
        f.write(domain_text)
    with open('/problem.pddl', 'w') as f:
        f.write(problem_text)

    buf = io.StringIO()
    handler = logging.StreamHandler(buf)
    handler.setFormatter(logging.Formatter('%(message)s'))
    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    if search_name not in SEARCHES:
        return json.dumps({'ok': False, 'error': 'Unknown search: ' + search_name})
    search = SEARCHES[search_name]
    heuristic = None
    if heuristic_name and heuristic_name.lower() != 'none':
        if heuristic_name not in HEURISTICS:
            return json.dumps({'ok': False, 'error': 'Unknown heuristic: ' + heuristic_name})
        heuristic = HEURISTICS[heuristic_name]
    # blind searches take no heuristic
    if search_name in ('bfs', 'ids', 'sat'):
        heuristic = None

    t0 = time.time()
    try:
        solution = search_plan('/domain.pddl', '/problem.pddl', search, heuristic)
    except Exception as e:
        return json.dumps({'ok': False, 'error': str(e), 'log': buf.getvalue()})
    elapsed_ms = (time.time() - t0) * 1000.0
    log = buf.getvalue()

    if solution is None:
        return json.dumps({'ok': True, 'solved': False, 'plan': [], 'log': log,
                           'elapsedMs': elapsed_ms})
    plan = [op.name for op in solution]
    return json.dumps({'ok': True, 'solved': True, 'plan': plan, 'log': log,
                       'elapsedMs': elapsed_ms})
`;

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

let pyodide: any = null;
let loadPromise: Promise<any> | null = null;

const listeners = new Set<(phase: LoadPhase, detail?: string) => void>();

export function onSolverStatus(cb: (phase: LoadPhase, detail?: string) => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function emit(phase: LoadPhase, detail?: string) {
  listeners.forEach((cb) => cb(phase, detail));
}

async function loadPyodideScript(): Promise<(opts: any) => Promise<any>> {
  // Pyodide ships as an ES module; import it dynamically so Vite leaves it alone.
  const mod = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`);
  return mod.loadPyodide;
}

export function getSolverEngine(): Promise<any> {
  if (pyodide) return Promise.resolve(pyodide);
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    emit('loading-runtime');
    const loadPyodide = await loadPyodideScript();
    const py = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    emit('installing-planner');
    await py.loadPackage('micropip');
    const micropip = py.pyimport('micropip');
    await micropip.install('pyperplan');

    // Define the driver function once.
    py.runPython(PY_DRIVER);

    pyodide = py;
    emit('ready');
    return py;
  })();

  loadPromise.catch((err) => {
    emit('error', String(err));
    loadPromise = null;
  });

  return loadPromise;
}

export async function runPlanner(
  domain: string,
  problem: string,
  search: string,
  heuristic: string | null,
): Promise<SolveResult> {
  const py = await getSolverEngine();
  const solve = py.globals.get('solve');
  try {
    const resultJson: string = solve(domain, problem, search, heuristic ?? 'none');
    return JSON.parse(resultJson) as SolveResult;
  } finally {
    solve.destroy?.();
  }
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
