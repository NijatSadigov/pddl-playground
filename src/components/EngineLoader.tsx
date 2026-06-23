import './EngineLoader.css';

type EnginePhase =
  | 'idle'
  | 'loading-runtime'
  | 'installing-planner'
  | 'ready'
  | 'error';

const PHASE_TEXT: Partial<Record<EnginePhase, string>> = {
  'loading-runtime': 'Loading the in-browser solver engine (Python · WebAssembly)…',
  'installing-planner': 'Installing the planner…',
};

interface Props {
  phase: EnginePhase;
}

// Shown only while the solver engine is being prepared. The first visit
// downloads Pyodide + pyperplan from a CDN (~15 MB) and the browser caches it,
// so this banner normally appears once and never again.
export function EngineLoader({ phase }: Props) {
  const text = PHASE_TEXT[phase];
  if (!text) return null;

  return (
    <div className="engine-loader" role="status" aria-live="polite">
      <div className="engine-loader-bar">
        <div className="engine-loader-fill" />
      </div>
      <div className="engine-loader-text">
        <strong>{text}</strong>
        <span>
          First load only — the solver is downloaded once from a CDN and cached
          in your browser, so it’s instant next time.
        </span>
      </div>
    </div>
  );
}
