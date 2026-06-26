import { useEffect, useMemo, useState } from 'react';
import { CodeEditor } from './components/CodeEditor';
import { Intro } from './components/Intro';
import { EngineLoader } from './components/EngineLoader';
import { PlanVisualiser } from './components/PlanVisualiser';
import { ComparisonTable, type ComparisonRow } from './components/ComparisonTable';
import { EpistemicPanel } from './components/EpistemicPanel';
import { CompileInfo } from './components/CompileInfo';
import {
  epistemicApiConfigured,
  solveEpistemic,
  solveEFP,
  type EpistemicResult,
  type EpistemicPlanner,
} from './solver/epistemicSolver';
import {
  serverApiConfigured,
  solveClassicalServer,
  SERVER_PLANNERS,
  DEFAULT_SERVER_PLANNER,
  type ServerSolveStats,
} from './solver/serverSolver';
import { EXAMPLES, looksEpistemic } from './data/examples';

// The app offers three solver engines, each with its own example set and UI,
// chosen by a top-level picker:
//   browser:   pyperplan, runs entirely in-browser (STRIPS + typing subset)
//   server:    full-PDDL classical solve on the optional backend (BFWS)
//   epistemic: multi-agent E-PDDL, solved on the optional backend
type Engine = 'browser' | 'server' | 'epistemic';

const ENGINE_OPTIONS: {
  id: Engine;
  title: string;
  tag: string;
  blurb: string;
}[] = [
  {
    id: 'browser',
    title: 'In-browser',
    tag: 'pyperplan · offline',
    blurb:
      'Runs the pyperplan planner entirely in your browser via WebAssembly. STRIPS + typing; negative preconditions are compiled away automatically.',
  },
  {
    id: 'server',
    title: 'Server · full PDDL',
    tag: 'BFWS · richer PDDL',
    blurb:
      'Solves on the backend with a full-PDDL planner (BFWS). Handles negative preconditions, conditional effects and action costs natively — no compilation needed.',
  },
  {
    id: 'epistemic',
    title: 'Epistemic · E-PDDL',
    tag: 'multi-agent knowledge',
    blurb:
      'Multi-agent epistemic planning (reasoning about what agents know). Compiled to classical planning and solved on the backend.',
  },
];

const CLASSICAL_EXAMPLES = EXAMPLES.filter((e) => !e.epistemic);
// Epistemic examples split by backend planner: PDKBDDL (RP-MEP) vs E-PDDL (EFP).
const RPMEP_EXAMPLES = EXAMPLES.filter((e) => e.epistemic && !e.epddl);
const EFP_EXAMPLES = EXAMPLES.filter((e) => e.epistemic && e.epddl);
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
  serverStats?: ServerSolveStats;
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

  const [serverSolving, setServerSolving] = useState(false);
  const [serverPlannerId, setServerPlannerId] = useState(DEFAULT_SERVER_PLANNER);
  const [serverComparison, setServerComparison] = useState<ComparisonRow[] | null>(
    null,
  );
  const [serverComparing, setServerComparing] = useState(false);
  const [serverCompareProgress, setServerCompareProgress] = useState(0);

  const preset = useMemo(
    () => SOLVER_PRESETS.find((p) => p.id === presetId) ?? SOLVER_PRESETS[0],
    [presetId],
  );
  const serverPlanner = useMemo(
    () =>
      SERVER_PLANNERS.find((p) => p.id === serverPlannerId) ?? SERVER_PLANNERS[0],
    [serverPlannerId],
  );

  // Top-level engine choice. Epistemic uses a separate example set + UI; the
  // server engine reuses the classical examples but solves on the backend.
  const [engine, setEngine] = useState<Engine>(() =>
    looksEpistemic(boot.domain) ? 'epistemic' : 'browser',
  );
  const isEpistemic = engine === 'epistemic';
  const isServer = engine === 'server';
  const isBrowser = engine === 'browser';
  // Within epistemic mode, choose the backend planner (RP-MEP / PDKBDDL vs EFP /
  // E-PDDL); each has its own example set.
  const [epiPlanner, setEpiPlanner] = useState<EpistemicPlanner>('rpmep');
  const epistemicExamples = epiPlanner === 'efp' ? EFP_EXAMPLES : RPMEP_EXAMPLES;
  const exampleList = isEpistemic ? epistemicExamples : CLASSICAL_EXAMPLES;
  const serverReady = serverApiConfigured();

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
    setServerComparison(null);
    setCompiledNote(null);
    setEpiResult(null);
  }

  async function solveEpistemicHandler() {
    setEpiSolving(true);
    setEpiResult(null);
    // EFP takes E-PDDL as separate domain + problem; RP-MEP takes a single
    // PDKBDDL file (domain + problem concatenated).
    const result =
      epiPlanner === 'efp'
        ? await solveEFP(domain, problem)
        : await solveEpistemic(`${domain}\n\n${problem}`);
    setEpiResult(result);
    setEpiSolving(false);
  }

  function switchEpiPlanner(next: EpistemicPlanner) {
    if (next === epiPlanner) return;
    setEpiPlanner(next);
    clearResults();
    const list = next === 'efp' ? EFP_EXAMPLES : RPMEP_EXAMPLES;
    if (list.length) loadExample(list[0].id);
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

  function switchEngine(next: Engine) {
    if (next === engine) return;
    const crossesExampleSet = (next === 'epistemic') !== (engine === 'epistemic');
    setEngine(next);
    clearResults();
    // Browser and server share the classical examples, so keep the editors when
    // switching between them; only reset when moving to/from the epistemic set.
    if (crossesExampleSet) {
      const list = next === 'epistemic' ? epistemicExamples : CLASSICAL_EXAMPLES;
      if (list.length) loadExample(list[0].id);
    }
  }

  // Parse and simulate a plan so it can be visualised. Failure here is
  // non-fatal; the textual plan is still shown.
  function buildPlanState(
    plan: string[],
    solverLabel: string,
    opts: {
      logText?: string;
      elapsedMs?: number;
      serverStats?: ServerSolveStats;
    } = {},
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
      stats: parseStats(opts.logText ?? '', plan.length),
      serverStats: opts.serverStats,
      elapsedMs: opts.elapsedMs,
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
          buildPlanState(res.plan ?? [], preset.label, {
            logText: res.log ?? '',
            elapsedMs: res.elapsedMs,
          }),
        );
      }
    } catch (err) {
      setSolveError(String(err));
    } finally {
      setSolving(false);
    }
  }

  async function solveServer() {
    if (!serverReady) return;
    setServerSolving(true);
    clearResults();
    const started = performance.now();
    const result = await solveClassicalServer(domain, problem, serverPlannerId);
    const elapsedMs = performance.now() - started;
    if (!result.ok) {
      if (result.error && /no plan/i.test(result.error)) {
        setNoPlan(true);
      } else {
        setSolveError(result.error ?? 'Server solve failed.');
      }
      if (result.output) setLog(result.output);
    } else if (!result.plan || result.plan.length === 0) {
      setNoPlan(true);
    } else {
      setLog(result.output ?? '');
      setPlanState(
        buildPlanState(result.plan, `Server · ${serverPlanner.label}`, {
          elapsedMs,
          serverStats: result.stats,
        }),
      );
    }
    setServerSolving(false);
  }

  async function compareServerAll() {
    if (!serverReady) return;
    setServerComparing(true);
    clearResults();
    const rows: ComparisonRow[] = [];
    for (let i = 0; i < SERVER_PLANNERS.length; i++) {
      const p = SERVER_PLANNERS[i];
      setServerCompareProgress(i + 1);
      const started = performance.now();
      const res = await solveClassicalServer(domain, problem, p.id);
      const elapsedMs = performance.now() - started;
      if (res.ok && res.plan && res.plan.length) {
        rows.push({
          presetId: p.id,
          label: p.label,
          optimal: p.optimal,
          solved: true,
          planLength: res.plan.length,
          nodesExpanded: res.stats?.nodesExpanded,
          elapsedMs,
          plan: res.plan,
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
      setServerComparison([...rows]); // progressive fill-in
    }
    setServerComparing(false);
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
      buildPlanState(row.plan, row.label, {
        logText: row.log ?? '',
        elapsedMs: row.elapsedMs,
      }),
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
          {isBrowser && (
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

      <div
        className="engine-chooser"
        role="radiogroup"
        aria-label="Choose a solver"
      >
        {ENGINE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            role="radio"
            aria-checked={engine === opt.id}
            className={`engine-card ${engine === opt.id ? 'active' : ''}`}
            onClick={() => switchEngine(opt.id)}
          >
            <span className="engine-card-head">
              <span className="engine-card-title">{opt.title}</span>
              <span className="engine-card-tag">{opt.tag}</span>
            </span>
            <span className="engine-card-blurb">{opt.blurb}</span>
          </button>
        ))}
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

        {isBrowser && (
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

        {isServer && (
          <>
            {serverReady && (
              <label className="field">
                <span>Solver</span>
                <select
                  value={serverPlannerId}
                  onChange={(e) => setServerPlannerId(e.target.value)}
                >
                  {SERVER_PLANNERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              className="solve-btn"
              onClick={solveServer}
              disabled={serverSolving || serverComparing || !serverReady}
              title={
                serverReady
                  ? `Solve the full PDDL on the backend (${serverPlanner.label})`
                  : 'No solver backend is configured for this build'
              }
            >
              {serverSolving ? 'Solving on server…' : 'Solve on server ▶'}
            </button>

            {serverReady && (
              <button
                className="compare-btn"
                onClick={compareServerAll}
                disabled={serverSolving || serverComparing}
                title="Run every server planner on this problem and compare them"
              >
                {serverComparing
                  ? `Comparing ${serverCompareProgress}/${SERVER_PLANNERS.length}…`
                  : 'Compare all'}
              </button>
            )}
          </>
        )}

        {isEpistemic && (
          <label className="field">
            <span>Planner</span>
            <select
              value={epiPlanner}
              onChange={(e) => switchEpiPlanner(e.target.value as EpistemicPlanner)}
            >
              <option value="rpmep">RP-MEP · compile to classical (PDKBDDL)</option>
              <option value="efp">EFP · native Kripke / possibilities (E-PDDL)</option>
            </select>
          </label>
        )}
      </section>

      {isBrowser && <EngineLoader phase={enginePhase} />}

      <p className="solver-desc">
        {isBrowser && preset.description}
        {isServer &&
          (serverReady
            ? `${serverPlanner.label} — ${serverPlanner.description} Solved on the backend (full PDDL: negative preconditions, conditional effects and action costs are handled natively).`
            : 'Server engine — this build has no solver backend configured, so server solving is unavailable. The in-browser engine works offline.')}
        {isEpistemic &&
          'Epistemic (E-PDDL) mode — these problems are solved on the optional backend (or explained below if none is connected).'}
      </p>

      {isBrowser && <CompileInfo enabled={compileNeg} />}

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
            planner={epiPlanner}
            solving={epiSolving}
            result={epiResult}
            onSolve={solveEpistemicHandler}
          />
        )}

        {isBrowser && compiledNote && (
          <div className="compiled-note">⚙ {compiledNote}</div>
        )}

        {isBrowser && engineError && (
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
            {isBrowser && (
              <div className="hint">
                pyperplan supports the STRIPS + typing subset only. A common
                cause is <code>:negative-preconditions</code> (e.g.{' '}
                <code>(not (...))</code> inside a precondition) — rewrite it
                using a positive predicate, or switch to the Server engine.
              </div>
            )}
          </div>
        )}

        {!isEpistemic && noPlan && (
          <div className="result-warn">
            No plan found — the goal may be unreachable for this problem.
          </div>
        )}

        {isBrowser && comparison && (
          <ComparisonTable
            rows={comparison}
            progress={{ done: compareProgress, total: SOLVER_PRESETS.length }}
            onView={viewComparisonRow}
          />
        )}

        {isServer && serverComparison && (
          <ComparisonTable
            rows={serverComparison}
            progress={{
              done: serverCompareProgress,
              total: SERVER_PLANNERS.length,
            }}
            onView={viewComparisonRow}
          />
        )}

        {!isEpistemic && planState && (
          <div className="plan-panel">
            <div className="plan-header">
              <h2>Plan ({planState.plan.length} steps)</h2>
              <div className="stat-chips">
                <span className="chip">{planState.solverLabel}</span>
                {planState.serverStats ? (
                  <>
                    {planState.serverStats.cost !== undefined && (
                      <span className="chip">
                        cost {planState.serverStats.cost}
                      </span>
                    )}
                    {planState.serverStats.nodesExpanded !== undefined && (
                      <span className="chip">
                        {planState.serverStats.nodesExpanded} nodes expanded
                      </span>
                    )}
                    {planState.serverStats.nodesGenerated !== undefined && (
                      <span className="chip">
                        {planState.serverStats.nodesGenerated} nodes generated
                      </span>
                    )}
                    {planState.serverStats.totalTimeMs !== undefined && (
                      <span className="chip">
                        {planState.serverStats.totalTimeMs} ms (search)
                      </span>
                    )}
                  </>
                ) : (
                  <>
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
                  </>
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
        {isBrowser && (
          <>
            In-browser engine: <code>pyperplan</code> via Pyodide (WebAssembly),
            no server round-trip.
          </>
        )}
        {isServer && (
          <>
            Server engine: full PDDL solved by <code>BFWS</code> on the backend.
            The in-browser engine remains fully offline.
          </>
        )}
        {isEpistemic && (
          <>
            Epistemic engine: E-PDDL compiled to classical planning and solved on
            the backend.
          </>
        )}
      </footer>
    </div>
  );
}
