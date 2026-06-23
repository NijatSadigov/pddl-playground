import './ComparisonTable.css';

export interface ComparisonRow {
  presetId: string;
  label: string;
  optimal: boolean;
  solved: boolean;
  planLength?: number;
  nodesExpanded?: number;
  elapsedMs?: number;
  plan?: string[];
  log?: string;
  error?: string;
}

interface Props {
  rows: ComparisonRow[];
  progress?: { done: number; total: number } | null;
  onView: (row: ComparisonRow) => void;
}

const min = (vals: (number | undefined)[]) => {
  const nums = vals.filter((v): v is number => typeof v === 'number');
  return nums.length ? Math.min(...nums) : undefined;
};

export function ComparisonTable({ rows, progress, onView }: Props) {
  const bestLen = min(rows.filter((r) => r.solved).map((r) => r.planLength));
  const bestNodes = min(rows.filter((r) => r.solved).map((r) => r.nodesExpanded));

  return (
    <div className="cmp">
      <div className="cmp-head">
        <h2>Solver comparison</h2>
        {progress && progress.done < progress.total && (
          <span className="cmp-progress">
            running {progress.done}/{progress.total}…
          </span>
        )}
      </div>
      <p className="cmp-note">
        Same problem, different solvers. <span className="cmp-best-key">Green</span>{' '}
        marks the best value in each column — note how informed heuristics expand
        far fewer nodes, and how non-optimal solvers can return longer plans.
      </p>
      <div className="cmp-scroll">
        <table className="cmp-table">
          <thead>
            <tr>
              <th>Solver</th>
              <th>Optimal</th>
              <th>Plan length</th>
              <th>Nodes expanded</th>
              <th>Time</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.presetId} className={r.solved ? '' : 'cmp-unsolved'}>
                <td className="cmp-label">{r.label}</td>
                <td>{r.optimal ? <span className="cmp-tag">optimal</span> : '—'}</td>
                <td
                  className={
                    r.solved && r.planLength === bestLen ? 'cmp-best' : ''
                  }
                >
                  {r.solved ? r.planLength : 'no plan'}
                </td>
                <td
                  className={
                    r.solved && r.nodesExpanded === bestNodes ? 'cmp-best' : ''
                  }
                >
                  {r.nodesExpanded ?? '—'}
                </td>
                <td>
                  {typeof r.elapsedMs === 'number'
                    ? `${r.elapsedMs.toFixed(0)} ms`
                    : '—'}
                </td>
                <td>
                  {r.solved && (
                    <button className="cmp-view" onClick={() => onView(r)}>
                      Visualise →
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
