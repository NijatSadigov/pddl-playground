import { useEffect, useMemo, useState } from 'react';
import { CodeEditor } from './components/CodeEditor';
import { Intro } from './components/Intro';
import { EngineLoader } from './components/EngineLoader';
import { PlanVisualiser } from './components/PlanVisualiser';
import { ComparisonTable, type ComparisonRow } from './components/ComparisonTable';
import { EpistemicPanel } from './components/EpistemicPanel';
import {
  epistemicApiConfigured,
  solveEpistemic,
  type EpistemicResult,
} from './solver/epistemicSolver';
import { EXAMPLES, looksEpistemic } from './data/examples';

// The app has two modes with separate example sets and UIs, chosen by a
// top-level switch: classical PDDL (solved in-browser) and epistemic E-PDDL.
const CLASSICAL_EXAMPLES = EXAMPLES.filter((e) => !e.epistemic);
const EPISTEMIC_EXAMPLES = EXAMPLES.filter((e) => e.epistemic);
import { SOLVER_PRESETS, DEFAULT_PRESET_ID } from './solver/presets';
import {
  runPlanner,
  getSolverEngine,
  onSolverStatus,
  parseStats,
  type SolveResult,
  type SolverStats,
} from './solver/pyperplanRunner';
import { parseDomain, parseProblem, type Domain, type Problem } from './pddl/parser';
import { simulate, type Simulation } from './pddl/simulate';
import { compileNegativePreconditions } from './pddl/compileNegatives';
import { validatePddl } from './pddl/validate';
import {
  buildShareUrl,
  readShareFromHash,
  clearShareHash,
  saveLast,
  loadLast,
  downloadText,
} from './share';
import './App.css';

type EnginePhase =
  | 'idle'
  | 'loading-runtime'
  | 'installing-planner'
  | 'ready'
  | 'error';

const ENGINE_LABEL: Record<EnginePhase, string> = {
  idle: 'Solver engine: idle',
  'loading-runtime': 'Loading solver engine (Python/WASM)…',
  'installing-planner': 'Installing planner…',
  ready: 'Solver engine ready',
  error: 'Solver engine failed to load',
};

interface PlanState {
  plan: string[];
  stats: SolverStats;
  elapsedMs?: number;
  solverLabel: string;
  sim: Simulation | null;
  parsedDomain: Domain | null;
  parsedProblem: Problem | null;
}

// Initial sources: a shared link wins, then the auto-saved last session, then
// the default example.
function bootSources() {
  const shared = readShareFromHash();
  if (shared)
    return {
      domain: shared.domain,
      problem: shared.problem,
      preset: shared.preset ?? DEFAULT_PRESET_ID,
      exampleId: '',
    };
  const last = loadLast();
  if (last)
    return {
      domain: last.domain,
      problem: last.problem,
      preset: DEFAULT_PRESET_ID,
      exampleId: '',
    };
  return {
    domain: EXAMPLES[0].domain,
    problem: EXAMPLES[0].problem,
    preset: DEFAULT_PRESET_ID,
    exampleId: EXAMPLES[0].id,
  };
}

export default function App() {
  const [boot] = useState(bootSources);
  const [domain, setDomain] = useState(boot.domain);
  const [problem, setProblem] = useState(boot.problem);
  const [exampleId, setExampleId] = useState(boot.exampleId);
  const [presetId, setPresetId] = useState(boot.preset);

  const [domainError, setDomainError] = useState<string | null>(null);
  const [problemError, setProblemError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(
    () =>
      (localStorage.getItem('pddl-playground:theme') as 'light' | 'dark') ??
      'dark',
  );
  const [showIntro, setShowIntro] = useState(
    () => !localStorage.getItem('pddl-playground:introDismissed'),
  );

  const [enginePhase, setEnginePhase] = useState<EnginePhase>('idle');
  const [engineError, setEngineError] = useState<string | null>(null);
  const [solving, setSolving] = useState(false);

  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [noPlan, setNoPlan] = useState(false);
  const [solveError, setSolveError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [log, setLog] = useState('');

  const [comparison, setComparison] = useState<ComparisonRow[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareProgress, setCompareProgress] = useState(0);

  const [compileNeg, setCompileNeg] = useState(true);
  const [compiledNote, setCompiledNote] = useState<string | null>(null);

  const [epiSolving, setEpiSolving] = useState(false);
  const [epiResult, setEpiResult] = useState<EpistemicResult | null>(null);

  const preset = useMemo(
    () => SOLVER_PRESETS.find((p) => p.id === presetId) ?? SOLVER_PRESETS[0],
    [presetId],
  );

  // Top-level mode. Epistemic (E-PDDL) uses a separate example set + UI and is
  // solved on the optional backend, not in-browser.
  const [mode, setMode] = useState<'classical' | 'epistemic'>(() =>
    looksEpistemic(boot.domain) ? 'epistemic' : 'classical',
  );
  const isEpistemic = mode === 'epistemic';
  const exampleList = isEpistemic ? EPISTEMIC_EXAMPLES : CLASSICAL_EXAMPLES;

  // Preload the WASM runtime + planner in the background so the first solve is fast.
  useEffect(() => {
    const off = onSolverStatus((phase, detail) => {
      setEnginePhase(phase);
      if (phase === 'error') setEngineError(detail ?? 'unknown error');
    });
    getSolverEngine().catch(() => {});
    return () => {
      off();
    };
  }, []);

  // A shared link is consumed once on load; clear it so later edits + reload
  // restore the user's own work (from localStorage) instead of the old link.
  useEffect(() => {
    clearShareHash();
  }, []);

  // Apply + persist the colour theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('pddl-playground:theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  function dismissIntro() {
    setShowIntro(false);
    try {
      localStorage.setItem('pddl-playground:introDismissed', '1');
    } catch {
      /* ignore */
    }
  }

  // Inline PDDL validation (debounced).
  useEffect(() => {
    const id = setTimeout(
      () => setDomainError(validatePddl(domain, 'domain')),
      300,
    );
    return () => clearTimeout(id);
  }, [domain]);
  useEffect(() => {
    const id = setTimeout(
      () => setProblemError(validatePddl(problem, 'problem')),
      300,
    );
    return () => clearTimeout(id);
  }, [problem]);

  // Auto-save the current editors so work survives a reload.
  useEffect(() => {
    const id = setTimeout(() => saveLast({ domain, problem }), 500);
    return () => clearTimeout(id);
  }, [domain, problem]);

  async function shareLink() {
    const url = buildShareUrl({ domain, problem, preset: presetId });
    try {
      await navigator.clipboard.writeText(url);
      setShareMsg('Share link copied to clipboard');
    } catch {
      setShareMsg('Could not copy — check clipboard permissions');
    }
    setTimeout(() => setShareMsg(null), 3000);
  }

  function clearResults() {
    setPlanState(null);
    setNoPlan(false);
    setSolveError(null);
    setComparison(null);
    setCompiledNote(null);
    setEpiResult(null);
  }

  async function solveEpistemicHandler() {
    setEpiSolving(true);
    setEpiResult(null);
    // PDKBDDL is a single file; send domain + problem concatenated.
    const result = await solveEpistemic(`${domain}\n\n${problem}`);
    setEpiResult(result);
    setEpiSolving(false);
  }

  // The text actually sent to the solver. If the domain uses negative
  // preconditions and the toggle is on, compile them to a positive equivalent.
  // The visualiser still simulates the ORIGINAL sources shown in the editors.
  function effectiveSources(): {
    domain: string;
    problem: string;
    note: string | null;
  } {
    if (compileNeg) {
      const res = compileNegativePreconditions(domain, problem);
      if (res.changed) {
        const preds = res.negated.join(', ');
        return {
          domain: res.domain,
          problem: res.problem,
          note: `Compiled ${res.negated.length} negative precondition${
            res.negated.length > 1 ? 's' : ''
          } away (${preds}) and added ${res.addedFacts} closed-world facts so pyperplan can solve it.`,
        };
      }
    }
    return { domain, problem, note: null };
  }

  function loadExample(id: string) {
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    setExampleId(id);
    setDomain(ex.domain);
    setProblem(ex.problem);
    clearResults();
  }

  function switchMode(next: 'classical' | 'epistemic') {
    if (next === mode) return;
    setMode(next);
    const list = next === 'epistemic' ? EPISTEMIC_EXAMPLES : CLASSICAL_EXAMPLES;
    if (list.length) loadExample(list[0].id);
  }

  // Parse + simulate a plan so it can be visualised. Failure here is non-fatal:
  // we still show the textual plan.
  function buildPlanState(
    plan: string[],
    solverLabel: string,
    logText: string,
    elapsedMs?: number,
  ): PlanState {
    let sim: Simulation | null = null;
    let parsedDomain: Domain | null = null;
    let parsedProblem: Problem | null = null;
    try {
      parsedDomain = parseDomain(domain);
      parsedProblem = parseProblem(problem);
      sim = simulate(parsedDomain, parsedProblem, plan);
    } catch {
      sim = null;
    }
    return {
      plan,
      stats: parseStats(logText, plan.length),
      elapsedMs,
      solverLabel,
      sim,
      parsedDomain,
      parsedProblem,
    };
  }

  async function solve() {
    setSolving(true);
    clearResults();
    const src = effectiveSources();
    setCompiledNote(src.note);
    try {
      const res: SolveResult = await runPlanner(
        src.domain,
        src.problem,
        preset.search,
        preset.heuristic,
      );
      setLog(res.log ?? '');
      if (!res.ok) {
        setSolveError(res.error ?? 'Unknown solver error');
      } else if (!res.solved) {
        setNoPlan(true);
      } else {
        setPlanState(
          buildPlanState(
            res.plan ?? [],
            preset.label,
            res.log ?? '',
            res.elapsedMs,
          ),
        );
      }
    } catch (err) {
      setSolveError(String(err));
    } finally {
      setSolving(false);
    }
  }

  async function compareAll() {
    setComparing(true);
    clearResults();
    const src = effectiveSources();
    setCompiledNote(src.note);
    const rows: ComparisonRow[] = [];
    for (let i = 0; i < SOLVER_PRESETS.length; i++) {
      const p = SOLVER_PRESETS[i];
      setCompareProgress(i + 1);
      try {
        const res = await runPlanner(
          src.domain,
          src.problem,
          p.search,
          p.heuristic,
        );
        if (res.ok && res.solved) {
          const plan = res.plan ?? [];
          const stats = parseStats(res.log, plan.length);
          rows.push({
            presetId: p.id,
            label: p.label,
            optimal: p.optimal,
            solved: true,
            planLength: plan.length,
            nodesExpanded: stats.nodesExpanded,
            elapsedMs: res.elapsedMs,
            plan,
            log: res.log ?? '',
          });
        } else {
          rows.push({
            presetId: p.id,
            label: p.label,
            optimal: p.optimal,
            solved: false,
            error: res.error,
          });
        }
      } catch (err) {
        rows.push({
          presetId: p.id,
          label: p.label,
          optimal: p.optimal,
          solved: false,
          error: String(err),
        });
      }
      setComparison([...rows]); // progressive fill-in
    }
    setComparing(false);
  }

  function viewComparisonRow(row: ComparisonRow) {
    if (!row.plan) return;
    setPlanState(
      buildPlanState(row.plan, row.label, row.log ?? '', row.elapsedMs),
    );
    setLog(row.log ?? '');
  }

  const engineReady = enginePhase === 'ready';
  const busy = solving || comparing || (!engineReady && enginePhase !== 'error');

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>PDDL Playground</h1>
          <p className="subtitle">
            Write a planning domain &amp; problem, pick a solver, and watch it
            plan — entirely in your browser.
          </p>
        </div>
        <div className="header-right">
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            title="Toggle light / dark theme"
            aria-label="Toggle light or dark theme"
          >
            {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
          </button>
          {!isEpistemic && (
            <span
              className={`engine-badge engine-${enginePhase}`}
              title={engineError ?? undefined}
            >
              {ENGINE_LABEL[enginePhase]}
            </span>
          )}
        </div>
      </header>

      {showIntro && <Intro onDismiss={dismissIntro} />}

      <div className="mode-switch" role="tablist" aria-label="Planning mode">
        <button
          role="tab"
          aria-selected={!isEpistemic}
          className={!isEpistemic ? 'active' : ''}
          onClick={() => switchMode('classical')}
        >
          Classical PDDL
        </button>
        <button
          role="tab"
          aria-selected={isEpistemic}
          className={isEpistemic ? 'active' : ''}
          onClick={() => switchMode('epistemic')}
        >
          Epistemic E-PDDL
        </button>
      </div>

      <section className="toolbar">
        <label className="field">
          <span>Example</span>
          <select
            value={exampleId}
            onChange={(e) => loadExample(e.target.value)}
          >
            {!exampleList.some((ex) => ex.id === exampleId) && (
              <option value="">Custom / shared</option>
            )}
            {exampleList.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.name}
              </option>
            ))}
          </select>
        </label>

        {!isEpistemic && (
          <>
            <label className="field">
              <span>Solver</span>
              <select
                value={presetId}
                onChange={(e) => setPresetId(e.target.value)}
              >
                {SOLVER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <button className="solve-btn" onClick={solve} disabled={busy}>
              {solving
                ? 'Solving…'
                : !engineReady && enginePhase !== 'error'
                  ? 'Preparing solver…'
                  : 'Solve ▶'}
            </button>

            <button
              className="compare-btn"
              onClick={compareAll}
              disabled={busy}
              title="Run every solver on this problem and compare them"
            >
              {comparing
                ? `Comparing ${compareProgress}/${SOLVER_PRESETS.length}…`
                : 'Compare all'}
            </button>

            <label
              className="toggle"
              title="If the domain uses :negative-preconditions, compile it to a positive equivalent that pyperplan can solve"
            >
              <input
                type="checkbox"
                checked={compileNeg}
                onChange={(e) => setCompileNeg(e.target.checked)}
              />
              <span>Compile negative preconditions</span>
            </label>
          </>
        )}
      </section>

      {!isEpistemic && <EngineLoader phase={enginePhase} />}

      <p className="solver-desc">
        {isEpistemic
          ? 'Epistemic (E-PDDL) mode — these problems are solved on the optional backend (or explained below if none is connected).'
          : preset.description}
      </p>

      <section className="editors">
        <CodeEditor
          label="Domain"
          value={domain}
          onChange={setDomain}
          error={domainError}
          theme={theme}
        />
        <CodeEditor
          label="Problem"
          value={problem}
          onChange={setProblem}
          error={problemError}
          theme={theme}
        />
      </section>

      <section className="actions-bar">
        <button className="action-btn" onClick={shareLink}>
          🔗 Share link
        </button>
        <button
          className="action-btn"
          onClick={() => downloadText('domain.pddl', domain)}
        >
          ⬇ domain.pddl
        </button>
        <button
          className="action-btn"
          onClick={() => downloadText('problem.pddl', problem)}
        >
          ⬇ problem.pddl
        </button>
        {shareMsg && <span className="share-msg">{shareMsg}</span>}
      </section>

      <section className="results">
        {isEpistemic && (
          <EpistemicPanel
            apiConfigured={epistemicApiConfigured()}
            solving={epiSolving}
            result={epiResult}
            onSolve={solveEpistemicHandler}
          />
        )}

        {!isEpistemic && compiledNote && (
          <div className="compiled-note">⚙ {compiledNote}</div>
        )}

        {!isEpistemic && engineError && (
          <div className="result-error">
            <strong>Solver engine failed to load.</strong> {engineError}
            <div className="hint">
              This usually means the browser could not reach the CDN. Check your
              network and reload.
            </div>
          </div>
        )}

        {!isEpistemic && solveError && (
          <div className="result-error">
            <strong>Could not solve.</strong>
            <pre>{solveError}</pre>
            <div className="hint">
              pyperplan supports the STRIPS + typing subset only. A common cause
              is <code>:negative-preconditions</code> (e.g.{' '}
              <code>(not (...))</code> inside a precondition) — rewrite it using
              a positive predicate.
            </div>
          </div>
        )}

        {!isEpistemic && noPlan && (
          <div className="result-warn">
            No plan found — the goal may be unreachable for this problem.
          </div>
        )}

        {!isEpistemic && comparison && (
          <ComparisonTable
            rows={comparison}
            progress={{ done: compareProgress, total: SOLVER_PRESETS.length }}
            onView={viewComparisonRow}
          />
        )}

        {!isEpistemic && planState && (
          <div className="plan-panel">
            <div className="plan-header">
              <h2>Plan ({planState.plan.length} steps)</h2>
              <div className="stat-chips">
                <span className="chip">{planState.solverLabel}</span>
                {planState.stats.nodesExpanded !== undefined && (
                  <span className="chip">
                    {planState.stats.nodesExpanded} nodes expanded
                  </span>
                )}
                {planState.stats.operators !== undefined && (
                  <span className="chip">
                    {planState.stats.operators} ground actions
                  </span>
                )}
                {planState.elapsedMs !== undefined && (
                  <span className="chip">
                    {planState.elapsedMs.toFixed(0)} ms
                  </span>
                )}
              </div>
            </div>

            {planState.sim &&
              planState.parsedDomain &&
              planState.parsedProblem && (
                <PlanVisualiser
                  domain={planState.parsedDomain}
                  problem={planState.parsedProblem}
                  sim={planState.sim}
                />
              )}

            <details className="plan-details">
              <summary>Plan as text ({planState.plan.length} actions)</summary>
              <ol className="plan-list">
                {planState.plan.map((step, i) => (
                  <li key={i}>
                    <code>{step}</code>
                  </li>
                ))}
              </ol>
            </details>
            <div className="plan-actions">
              <button
                className="link-btn"
                onClick={() =>
                  downloadText('plan.txt', planState.plan.join('\n') + '\n')
                }
              >
                ⬇ Download plan
              </button>
              <button className="link-btn" onClick={() => setShowLog((s) => !s)}>
                {showLog ? 'Hide' : 'Show'} solver log
              </button>
            </div>
            {showLog && <pre className="solver-log">{log}</pre>}
          </div>
        )}
      </section>

      <footer className="app-footer">
        Runs <code>pyperplan</code> in the browser via Pyodide (WebAssembly). No
        server-side solver.
      </footer>
    </div>
  );
}
