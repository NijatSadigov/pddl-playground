import type {
  EpistemicResult,
  EpistemicPlanner,
} from '../solver/epistemicSolver';
import { EpistemicStates } from './EpistemicStates';
import './EpistemicPanel.css';

// Shown in epistemic mode. Epistemic planning is not solved in the browser; the
// panel explains how the chosen backend planner solves it and, when a backend is
// configured, offers to solve on the server.
//   rpmep — pdkb-planning: compile the epistemic problem to classical planning.
//   efp   — native EFP: build and search explicit epistemic states.

const RPMEP_STEPS = [
  { label: 'PDKBDDL', sub: 'what agents know' },
  { label: 'classical PDDL', sub: 'with conditional effects' },
  { label: 'BFWS planner', sub: 'finds the plan' },
];

const EFP_STEPS = [
  { label: 'E-PDDL', sub: 'what agents know' },
  { label: 'possibility states', sub: 'explicit e-states' },
  { label: 'forward search', sub: 'over e-states' },
];

interface Props {
  apiConfigured: boolean;
  planner: EpistemicPlanner;
  solving: boolean;
  result: EpistemicResult | null;
  onSolve: () => void;
}

export function EpistemicPanel({
  apiConfigured,
  planner,
  solving,
  result,
  onSolve,
}: Props) {
  const isEFP = planner === 'efp';
  const lang = isEFP ? 'E-PDDL' : 'PDKBDDL';
  const steps = isEFP ? EFP_STEPS : RPMEP_STEPS;
  const tag = apiConfigured
    ? `${isEFP ? 'EFP' : 'RP-MEP'} · solved on the server`
    : 'explorer — not solved in-browser';

  return (
    <div className="epi">
      <div className="epi-head">
        <h2>Epistemic planning</h2>
        <span className="epi-tag">{tag}</span>
      </div>

      <p className="epi-lead">
        Epistemic planning reasons about what <strong>agents know and believe</strong>,
        not just facts about the world. Knowledge can nest — e.g. <code>[a](p)</code>{' '}
        ("a knows p"), <code>&lt;a&gt;(p)</code> ("a considers p possible"), and{' '}
        <code>[a][b](p)</code> ("a knows that b knows p").
      </p>

      {apiConfigured && (
        <div className="epi-solve">
          <button className="solve-btn" onClick={onSolve} disabled={solving}>
            {solving ? 'Solving on server…' : 'Solve on server ▶'}
          </button>
          <span className="epi-solve-note">
            {isEFP
              ? 'Sends the problem to the native EFP planner, which searches over explicit epistemic states.'
              : 'Sends the problem to the RP-MEP backend (pdkb-planning), which compiles it to classical planning.'}{' '}
            Network-dependent — the classical playground stays offline.
          </span>

          {result && (
            <div
              className={`epi-result${result.ok && result.plan && result.plan.length ? ' epi-ok' : ' epi-bad'}`}
            >
              {result.ok && result.plan && result.plan.length > 0 ? (
                <>
                  <strong>Plan ({result.plan.length} steps)</strong>
                  <ol className="epi-plan">
                    {result.plan.map((step, i) => (
                      <li key={i}>
                        <code>{step}</code>
                      </li>
                    ))}
                  </ol>
                </>
              ) : result.error ? (
                <strong>Could not solve: {result.error}</strong>
              ) : !result.ok ? (
                <strong>
                  The backend planner rejected this input
                  {typeof result.returncode === 'number'
                    ? ` (exit ${result.returncode})`
                    : ''}
                  . Check it is valid {lang} — see the raw output below.
                </strong>
              ) : (
                <strong>
                  Solved, but produced no plan steps (the goal may already
                  hold).
                </strong>
              )}
              {result.states && result.states.length > 0 && (
                <EpistemicStates states={result.states} />
              )}
              {result.output && (
                <details className="epi-rawwrap">
                  <summary>Raw planner output</summary>
                  <pre className="epi-raw">{result.output}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      <h3 className="epi-sub">
        {isEFP
          ? "How it's solved: native epistemic search"
          : "How it's solved: compile to classical planning"}
      </h3>
      <div className="epi-pipe">
        {steps.map((s, i) => (
          <div className="epi-stepwrap" key={s.label}>
            <div className="epi-step">
              <div className="epi-step-label">{s.label}</div>
              <div className="epi-step-sub">{s.sub}</div>
            </div>
            {i < steps.length - 1 && <div className="epi-arrow">→</div>}
          </div>
        ))}
      </div>
      <p className="epi-note">
        {isEFP ? (
          <>
            EFP does <em>not</em> compile to classical planning. It builds
            explicit epistemic states — Kripke structures or non-well-founded{' '}
            <em>possibilities</em> — and searches over them directly, applying
            each action as an update to the state. This handles constructs such as
            lies and false beliefs that are awkward for compilation approaches.
          </>
        ) : (
          <>
            The same trick as this app's negative-precondition compiler — a hard
            feature is <em>translated</em> into something a classical planner can
            solve. The compiled output uses conditional effects, which the
            in-browser solver (pyperplan) doesn't support, so the final step runs
            a full classical planner (<strong>BFWS</strong>) on the backend.
          </>
        )}
      </p>

      <h3 className="epi-sub">References</h3>
      <ul className="epi-links">
        <li>
          <a href="https://github.com/QuMuLab/pdkb-planning" target="_blank" rel="noreferrer">
            pdkb-planning
          </a>{' '}
          — Muise's RP-MEP compiler (epistemic → classical), solved with a
          classical planner.
        </li>
        <li>
          <a href="https://github.com/FrancescoFabiano/EFP" target="_blank" rel="noreferrer">
            EFP
          </a>{' '}
          — Fabiano et al.'s native epistemic forward planner (Kripke /
          possibilities), with{' '}
          <a href="https://github.com/FrancescoFabiano/E-PDDL" target="_blank" rel="noreferrer">
            E-PDDL
          </a>{' '}
          as its standardised input syntax.
        </li>
        <li>
          <a href="https://arxiv.org/pdf/2107.08739" target="_blank" rel="noreferrer">
            E-PDDL paper (Fabiano et al., 2021)
          </a>{' '}
          and Muise et al., “Planning over multi-agent epistemic states” (2015).
        </li>
      </ul>

      {!apiConfigured && (
        <p className="epi-note epi-roadmap">
          Solving is disabled because no epistemic backend is configured. Set{' '}
          <code>VITE_EPISTEMIC_API</code> at build time to point at a running
          backend to enable "Solve on server".
        </p>
      )}
    </div>
  );
}
