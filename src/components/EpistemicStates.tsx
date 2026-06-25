import { useEffect, useState } from 'react';
import './EpistemicStates.css';

export interface StateGraph {
  label: string;
  dot: string;
}

interface Props {
  states: StateGraph[];
}

// Lazily load (and cache) the graphviz WASM module, so the sizable wasm is only
// fetched when an epistemic state graph is actually displayed.
let gvPromise: Promise<{ layout: (dot: string, fmt: string, engine: string) => string }> | null =
  null;
function loadGraphviz() {
  if (!gvPromise) {
    // The subpath's bundled types don't resolve cleanly; the runtime export is
    // the Graphviz class with a static load().
    gvPromise = import('@hpcc-js/wasm/graphviz').then(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (m: any) => m.Graphviz.load(),
    );
  }
  return gvPromise;
}

// Renders the epistemic states EFP produced (the initial belief state and the
// state after each plan action) as navigable graphviz diagrams.
export function EpistemicStates({ states }: Props) {
  const [i, setI] = useState(0);
  const [svg, setSvg] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setI(0), [states]);

  useEffect(() => {
    let cancelled = false;
    const cur = states[i];
    if (!cur) return;
    setError(null);
    setSvg('');
    loadGraphviz()
      .then((gv) => {
        if (!cancelled) setSvg(gv.layout(cur.dot, 'svg', 'dot'));
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [states, i]);

  if (!states.length) return null;
  const cur = states[i];

  return (
    <div className="estates">
      <div className="estates-head">
        <h3>Epistemic state{states.length > 1 ? 's' : ''}</h3>
        {states.length > 1 && (
          <div className="estates-nav">
            <button onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0}>
              ‹ Prev
            </button>
            <span className="estates-step">
              {i + 1} / {states.length}
            </span>
            <button
              onClick={() => setI((v) => Math.min(states.length - 1, v + 1))}
              disabled={i === states.length - 1}
            >
              Next ›
            </button>
          </div>
        )}
      </div>
      <p className="estates-label">{cur.label}</p>
      <p className="estates-legend">
        Each node is a possible world (the <strong>double circle</strong> is the
        real one). A fluent shown in <span className="ef-t">red</span> is true,
        in <span className="ef-f">blue</span> false. An edge labelled with agents
        means those agents cannot tell the connected worlds apart — they consider
        both possible.
      </p>
      {error ? (
        <div className="estates-err">Could not render the graph: {error}</div>
      ) : svg ? (
        <div className="estates-svg" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="estates-loading">Rendering graph…</div>
      )}
    </div>
  );
}
