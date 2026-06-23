import { useEffect, useMemo, useState } from 'react';
import {
  type Atom,
  type Domain,
  type Problem,
  atomKey,
  atomStr,
} from '../pddl/parser';
import type { Simulation } from '../pddl/simulate';
import { isMinefield } from '../pddl/minefield';
import { MinefieldGrid } from './MinefieldGrid';
import './PlanVisualiser.css';

interface Props {
  domain: Domain;
  problem: Problem;
  sim: Simulation;
}

export function PlanVisualiser({ domain, problem, sim }: Props) {
  // step 0 = initial state; step i = state after action i
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showStatic, setShowStatic] = useState(false);

  const n = sim.steps.length;
  const showGrid = useMemo(
    () => isMinefield(domain, problem),
    [domain, problem],
  );

  // Reset to the start whenever a new plan is simulated.
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [sim]);

  // Auto-advance while playing.
  useEffect(() => {
    if (!playing) return;
    if (step >= n) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, n)), 900);
    return () => clearTimeout(id);
  }, [playing, step, n]);

  const current =
    step === 0
      ? {
          state: sim.initial,
          added: [] as Atom[],
          deleted: [] as Atom[],
          action: null as Atom | null,
        }
      : {
          state: sim.steps[step - 1].state,
          added: sim.steps[step - 1].added,
          deleted: sim.steps[step - 1].deleted,
          action: sim.steps[step - 1].action,
        };

  // Predicates that change at least once are "dynamic"; the rest (adjacency,
  // static facts…) are hidden by default to keep the state view readable.
  const dynamicPreds = useMemo(() => {
    const s = new Set<string>();
    for (const st of sim.steps)
      for (const a of [...st.added, ...st.deleted]) s.add(a[0]);
    return s;
  }, [sim]);

  const addedKeys = new Set(current.added.map(atomKey));
  const stateSet = new Set(current.state.map(atomKey));

  const visibleFacts = current.state.filter(
    (a) => showStatic || dynamicPreds.has(a[0]),
  );
  const staticHidden = current.state.length - visibleFacts.length;

  const goalRows = sim.goal.map((g) => ({
    atom: g,
    met: stateSet.has(atomKey(g)),
  }));
  const allGoalsMet = goalRows.every((r) => r.met);

  return (
    <div className="viz">
      <div className="viz-controls">
        <button
          className="viz-btn"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          aria-label="Previous step"
        >
          ◀
        </button>
        <button
          className="viz-btn viz-play"
          onClick={() => {
            if (step >= n) setStep(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <button
          className="viz-btn"
          onClick={() => setStep((s) => Math.min(n, s + 1))}
          disabled={step === n}
          aria-label="Next step"
        >
          ▶
        </button>
        <input
          className="viz-slider"
          type="range"
          min={0}
          max={n}
          value={step}
          onChange={(e) => {
            setPlaying(false);
            setStep(Number(e.target.value));
          }}
        />
        <span className="viz-counter">
          {step === 0 ? 'Initial state' : `Step ${step} / ${n}`}
        </span>
      </div>

      <div className="viz-action">
        {current.action ? (
          <code className="viz-action-code">{atomStr(current.action)}</code>
        ) : (
          <span className="viz-action-init">
            Initial state — before any action
          </span>
        )}
        {allGoalsMet && step > 0 && (
          <span className="viz-goal-badge">✓ goal reached</span>
        )}
      </div>

      <div className={`viz-body${showGrid ? ' viz-has-grid' : ''}`}>
        {showGrid && (
          <div className="viz-grid-pane">
            <MinefieldGrid problem={problem} state={current.state} />
          </div>
        )}

        <div className="viz-state-pane">
          {(current.added.length > 0 || current.deleted.length > 0) && (
            <div className="viz-diff">
              {current.added.map((a) => (
                <span key={'a' + atomKey(a)} className="viz-fact viz-added">
                  + {atomStr(a)}
                </span>
              ))}
              {current.deleted.map((a) => (
                <span key={'d' + atomKey(a)} className="viz-fact viz-deleted">
                  − {atomStr(a)}
                </span>
              ))}
            </div>
          )}

          <div className="viz-facts-title">
            True facts ({visibleFacts.length})
          </div>
          <div className="viz-facts">
            {visibleFacts.map((a) => {
              const isNew = addedKeys.has(atomKey(a));
              return (
                <span
                  key={atomKey(a)}
                  className={`viz-fact${isNew ? ' viz-added' : ''}`}
                >
                  {atomStr(a)}
                </span>
              );
            })}
          </div>
          {staticHidden > 0 && (
            <button
              className="link-btn"
              onClick={() => setShowStatic((s) => !s)}
            >
              {showStatic ? 'Hide' : 'Show'} {staticHidden} static facts
            </button>
          )}

          <div className="viz-goal">
            <div className="viz-facts-title">Goal</div>
            {goalRows.map((r) => (
              <span
                key={atomKey(r.atom)}
                className={`viz-fact viz-goal-row${
                  r.met ? ' viz-goal-met' : ''
                }`}
              >
                {r.met ? '✓' : '○'} {atomStr(r.atom)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {sim.warnings.length > 0 && (
        <div className="viz-warn">
          {sim.warnings.map((w, i) => (
            <div key={i}>⚠ {w}</div>
          ))}
        </div>
      )}
    </div>
  );
}
