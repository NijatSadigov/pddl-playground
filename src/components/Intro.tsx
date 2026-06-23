import './Intro.css';

interface Props {
  onDismiss: () => void;
}

// A one-time "how it works" card for first-time visitors (students).
export function Intro({ onDismiss }: Props) {
  return (
    <div className="intro">
      <button className="intro-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
      <h2>New here? It works in three steps.</h2>
      <ol className="intro-steps">
        <li>
          <span className="intro-num">1</span>
          <div>
            <strong>Describe</strong> a planning <em>domain</em> (the actions)
            and a <em>problem</em> (objects, start, goal) in PDDL — or pick a
            built-in example.
          </div>
        </li>
        <li>
          <span className="intro-num">2</span>
          <div>
            <strong>Choose a solver</strong> and press <em>Solve</em>. The
            planner runs entirely in your browser — or press{' '}
            <em>Compare all</em> to see how the solvers differ.
          </div>
        </li>
        <li>
          <span className="intro-num">3</span>
          <div>
            <strong>Watch it plan</strong> — step through the plan and see the
            state change at each action (with a 2-D grid for the MineField
            domain).
          </div>
        </li>
      </ol>
    </div>
  );
}
