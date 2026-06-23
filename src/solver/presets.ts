// Each "solver" is a (search algorithm + heuristic) combination exposed by
// pyperplan. Together they make a useful teaching spread: uninformed vs.
// informed search, admissible (optimal) vs. greedy (fast) heuristics.

export interface SolverPreset {
  id: string;
  label: string;
  search: string;
  heuristic: string | null;
  optimal: boolean;
  description: string;
}

export const SOLVER_PRESETS: SolverPreset[] = [
  {
    id: 'bfs',
    label: 'Breadth-First Search (uninformed)',
    search: 'bfs',
    heuristic: null,
    optimal: true,
    description:
      'Explores states level by level with no guidance. Finds a plan with the fewest steps, but expands many nodes — good for showing the cost of uninformed search.',
  },
  {
    id: 'astar-hff',
    label: 'A* + hFF',
    search: 'astar',
    heuristic: 'hff',
    optimal: false,
    description:
      'A* guided by the FF (relaxed-plan) heuristic. Fast and usually returns short plans; the FF heuristic is not admissible, so optimality is not guaranteed.',
  },
  {
    id: 'astar-hmax',
    label: 'A* + hMax (admissible → optimal)',
    search: 'astar',
    heuristic: 'hmax',
    optimal: true,
    description:
      'A* with the admissible hMax heuristic, so the returned plan is optimal. Usually expands more nodes than hFF — a nice optimal-vs-fast comparison.',
  },
  {
    id: 'astar-lmcut',
    label: 'A* + LM-Cut (admissible → optimal)',
    search: 'astar',
    heuristic: 'lmcut',
    optimal: true,
    description:
      'A* with the landmark-cut heuristic — a strong admissible heuristic used in optimal classical planning. Typically expands far fewer nodes than hMax.',
  },
  {
    id: 'gbf-hff',
    label: 'Greedy Best-First + hFF',
    search: 'gbf',
    heuristic: 'hff',
    optimal: false,
    description:
      'Follows the heuristic greedily, ignoring path cost. Very fast and expands few nodes, but plans can be longer than optimal.',
  },
  {
    id: 'wastar-hff',
    label: 'Weighted A* + hFF',
    search: 'wastar',
    heuristic: 'hff',
    optimal: false,
    description:
      'Weights the heuristic to trade optimality for speed — sits between A* and greedy search.',
  },
];

export const DEFAULT_PRESET_ID = 'astar-hff';
