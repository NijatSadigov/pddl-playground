import { useMemo } from 'react';
import type { Atom } from '../pddl/parser';
import type { Problem } from '../pddl/parser';
import { gridLayout, gridStateFrom } from '../pddl/minefield';
import './MinefieldGrid.css';

interface Props {
  problem: Problem;
  state: Atom[];
}

export function MinefieldGrid({ problem, state }: Props) {
  const layout = useMemo(() => gridLayout(problem), [problem]);
  const view = useMemo(() => gridStateFrom(state), [state]);

  const { size, obstacles, goldStart } = layout;
  if (size === 0) return null;

  const goldByCell = new Map<string, string[]>();
  for (const g of goldStart) {
    if (view.collected.has(g.id)) continue; // collected gold disappears
    const k = `${g.row},${g.col}`;
    goldByCell.set(k, [...(goldByCell.get(k) ?? []), g.id]);
  }

  const cells = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const key = `${r},${c}`;
      const isObstacle = obstacles.has(key);
      const hasRobot = view.robot?.row === r && view.robot?.col === c;
      const golds = goldByCell.get(key) ?? [];
      cells.push(
        <div
          key={key}
          className={`mf-cell${isObstacle ? ' mf-obstacle' : ''}${
            hasRobot ? ' mf-robot-cell' : ''
          }`}
          title={`loc-${r}-${c}`}
        >
          {golds.length > 0 && !hasRobot && <span className="mf-gold">●</span>}
          {hasRobot && (
            <span className="mf-robot">
              {golds.length > 0 ? '◉' : '▲'}
            </span>
          )}
        </div>,
      );
    }
  }

  const totalGold = goldStart.length;
  const collectedCount = view.collected.size;

  return (
    <div className="mf-wrap">
      <div
        className="mf-grid"
        style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
      >
        {cells}
      </div>
      <div className="mf-legend">
        <span>
          <span className="mf-robot">▲</span> robot
        </span>
        <span>
          <span className="mf-gold">●</span> gold
        </span>
        <span>
          <span className="mf-obstacle-swatch" /> obstacle
        </span>
        <span className="mf-progress">
          collected {collectedCount}/{totalGold}
        </span>
      </div>
    </div>
  );
}
