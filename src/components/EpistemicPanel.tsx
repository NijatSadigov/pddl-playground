import './EpistemicPanel.css';

// Shown when the editor holds an epistemic (E-PDDL) domain. Epistemic planning
// can't be solved in the browser, so instead of a plan we explain HOW it is
// solved — by compiling to classical planning (RP-MEP / pdkb-planning).

const STEPS = [
  { label: 'E-PDDL', sub: 'what agents know' },
  { label: 'PDKB-PDDL', sub: 'knowledge bases' },
  { label: 'classical PDDL', sub: 'with conditional effects' },
  { label: 'Fast Downward', sub: 'finds the plan' },
];

export function EpistemicPanel() {
  return (
    <div className="epi">
      <div className="epi-head">
        <h2>Epistemic planning (E-PDDL)</h2>
        <span className="epi-tag">explorer — not solved in-browser</span>
      </div>

      <p className="epi-lead">
        Epistemic planning reasons about what <strong>agents know and believe</strong>,
        not just facts about the world. Goals can nest knowledge — e.g.{' '}
        <code>[a] heads</code> ("a knows the coin is heads") and{' '}
        <code>![b][a] heads</code> ("b does <em>not</em> know that a knows it").
        You can write and explore it here; solving it needs a specialised
        planner.
      </p>

      <h3 className="epi-sub">How it's actually solved: compile to classical planning</h3>
      <div className="epi-pipe">
        {STEPS.map((s, i) => (
          <div className="epi-stepwrap" key={s.label}>
            <div className="epi-step">
              <div className="epi-step-label">{s.label}</div>
              <div className="epi-step-sub">{s.sub}</div>
            </div>
            {i < STEPS.length - 1 && <div className="epi-arrow">→</div>}
          </div>
        ))}
      </div>
      <p className="epi-note">
        The same trick as this app's negative-precondition compiler — a hard
        feature is <em>translated</em> into something a classical planner can
        solve. The catch: the compiled output uses conditional effects, which the
        in-browser solver (pyperplan) doesn't support, so the final step needs{' '}
        <strong>Fast Downward</strong> on a real machine.
      </p>

      <h3 className="epi-sub">To actually run epistemic plans</h3>
      <ul className="epi-links">
        <li>
          <a href="https://github.com/QuMuLab/pdkb-planning" target="_blank" rel="noreferrer">
            pdkb-planning
          </a>{' '}
          — Muise's RP-MEP compiler (epistemic → classical), solved with Fast
          Downward.
        </li>
        <li>
          <a href="https://github.com/FrancescoFabiano/E-PDDL" target="_blank" rel="noreferrer">
            E-PDDL
          </a>{' '}
          — a standardised epistemic syntax that feeds RP-MEP and the EFP planner.
        </li>
        <li>
          <a href="https://arxiv.org/pdf/2107.08739" target="_blank" rel="noreferrer">
            E-PDDL paper (Fabiano et al., 2021)
          </a>{' '}
          and Muise et al., “Planning over multi-agent epistemic states” (2015).
        </li>
      </ul>
      <p className="epi-note epi-roadmap">
        Roadmap: a hosted “epistemic mode” (pdkb-planning + Fast Downward in a
        container) could wire this up end-to-end — kept separate so the classical
        playground stays fully offline.
      </p>
    </div>
  );
}
