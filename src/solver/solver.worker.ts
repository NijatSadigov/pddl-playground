// Runs Pyodide + pyperplan in a Web Worker (a background thread) so solving and
// the initial WASM load never block the main thread. The UI stays responsive
// during a solve or "Compare all".

const PYODIDE_VERSION = 'v0.28.0';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;

// Defined once after the package installs; called for each planning request.
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

// Minimal typed view of the worker global, avoiding the WebWorker lib dependency.
const ctx = self as unknown as {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: 'message', cb: (e: MessageEvent) => void) => void;
};

let ready: Promise<any> | null = null;

function initEngine(): Promise<any> {
  if (ready) return ready;
  ready = (async () => {
    ctx.postMessage({ type: 'status', phase: 'loading-runtime' });
    const mod: any = await import(/* @vite-ignore */ `${PYODIDE_INDEX_URL}pyodide.mjs`);
    const py = await mod.loadPyodide({ indexURL: PYODIDE_INDEX_URL });

    ctx.postMessage({ type: 'status', phase: 'installing-planner' });
    await py.loadPackage('micropip');
    const micropip = py.pyimport('micropip');
    await micropip.install('pyperplan');

    py.runPython(PY_DRIVER);
    ctx.postMessage({ type: 'status', phase: 'ready' });
    return py;
  })();
  ready.catch((err) => {
    ctx.postMessage({ type: 'status', phase: 'error', detail: String(err) });
    ready = null;
  });
  return ready;
}

ctx.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data;
  if (!msg) return;

  if (msg.type === 'init') {
    initEngine();
    return;
  }

  if (msg.type === 'solve') {
    initEngine()
      .then((py) => {
        const solve = py.globals.get('solve');
        try {
          const resultJson: string = solve(
            msg.domain,
            msg.problem,
            msg.search,
            msg.heuristic ?? 'none',
          );
          ctx.postMessage({ type: 'result', id: msg.id, resultJson });
        } finally {
          solve.destroy?.();
        }
      })
      .catch((err) => {
        ctx.postMessage({
          type: 'result',
          id: msg.id,
          resultJson: JSON.stringify({ ok: false, error: String(err) }),
        });
      });
  }
});
