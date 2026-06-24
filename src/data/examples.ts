// Built-in example domains. All are written in the STRIPS + typing subset that
// pyperplan supports (positive preconditions only — see README).

export interface Example {
  id: string;
  name: string;
  description: string;
  domain: string;
  problem: string;
  /** Epistemic (E-PDDL) examples can't be solved in-browser — see EpistemicPanel. */
  epistemic?: boolean;
}

// Heuristic: does this look like an epistemic (E-PDDL / PDKB) domain rather than
// classical PDDL? Used to switch the UI into the read-only "epistemic explorer".
export function looksEpistemic(domainText: string): boolean {
  const t = domainText.toLowerCase();
  return /:agents\b/.test(t) || /:mep\b/.test(t) || /:epistemic\b/.test(t);
}

// --- MineField (the dissertation domain, positive-precondition variant) --------

export const MINEFIELD_DOMAIN = `;; MineField domain — robot collects all gold on a grid, avoiding obstacles.
;; Positive-precondition STRIPS variant (pyperplan-friendly):
;;   (clear ?l)        instead of  (not (obstacle-at ?l))
;;   (uncollected ?g)  instead of  (not (collected ?g))
(define (domain minefield)
  (:requirements :strips :typing)
  (:types robot gold location - object)
  (:predicates
    (at ?r - robot ?l - location)
    (gold-at ?g - gold ?l - location)
    (clear ?l - location)
    (adjacent ?l1 - location ?l2 - location)
    (uncollected ?g - gold)
    (collected ?g - gold))
  (:action move
    :parameters (?r - robot ?from - location ?to - location)
    :precondition (and (at ?r ?from) (adjacent ?from ?to) (clear ?to))
    :effect (and (not (at ?r ?from)) (at ?r ?to)))
  (:action collect
    :parameters (?r - robot ?g - gold ?l - location)
    :precondition (and (at ?r ?l) (gold-at ?g ?l) (uncollected ?g))
    :effect (and (collected ?g) (not (uncollected ?g)))))
`;

type Cell = [number, number]; // [row, col]

export interface MinefieldSpec {
  size: number;
  robot: Cell;
  golds: Cell[];
  obstacles: Cell[];
  name?: string;
}

const loc = (r: number, c: number) => `loc-${r}-${c}`;

// Generate a MineField problem file from a grid specification. Reused by the
// "random instance" button and the default example.
export function makeMinefieldProblem(spec: MinefieldSpec): string {
  const { size, robot, golds, obstacles } = spec;
  const name = spec.name ?? `minefield-${size}x${size}`;
  const isObstacle = (r: number, c: number) =>
    obstacles.some(([or, oc]) => or === r && oc === c);

  const locations: string[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) locations.push(loc(r, c));

  const clears: string[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!isObstacle(r, c)) clears.push(`(clear ${loc(r, c)})`);

  // 4-connected adjacency (both directions).
  const adj: string[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (c + 1 < size) {
        adj.push(`(adjacent ${loc(r, c)} ${loc(r, c + 1)})`);
        adj.push(`(adjacent ${loc(r, c + 1)} ${loc(r, c)})`);
      }
      if (r + 1 < size) {
        adj.push(`(adjacent ${loc(r, c)} ${loc(r + 1, c)})`);
        adj.push(`(adjacent ${loc(r + 1, c)} ${loc(r, c)})`);
      }
    }

  const goldObjs = golds.map((_, i) => `g${i + 1}`).join(' ');
  const goldAt = golds.map(([r, c], i) => `(gold-at g${i + 1} ${loc(r, c)})`);
  const uncollected = golds.map((_, i) => `(uncollected g${i + 1})`);
  const goldGoal = golds.map((_, i) => `(collected g${i + 1})`).join(' ');

  return `;; ${size}x${size} MineField instance
(define (problem ${name})
  (:domain minefield)
  (:objects
    r1 - robot
    ${goldObjs} - gold
    ${locations.join(' ')} - location)
  (:init
    (at r1 ${loc(robot[0], robot[1])})
    ${goldAt.join('\n    ')}
    ${uncollected.join(' ')}
    ${clears.join('\n    ')}
    ${adj.join('\n    ')})
  (:goal (and ${goldGoal})))
`;
}

const MINEFIELD_PROBLEM = makeMinefieldProblem({
  size: 4,
  robot: [0, 0],
  golds: [
    [0, 3],
    [3, 3],
  ],
  obstacles: [
    [1, 1],
    [2, 1],
    [1, 2],
  ],
});

// --- MineField (ORIGINAL dissertation domain, with :negative-preconditions) ---
// pyperplan cannot solve this directly; the app compiles it to a positive
// equivalent on the fly (see compileNegatives.ts).

export const MINEFIELD_NEG_DOMAIN = `;; MineField — the ORIGINAL dissertation domain, using :negative-preconditions.
(define (domain minefield)
  (:requirements :strips :typing :negative-preconditions)
  (:types robot gold location - object)
  (:predicates
    (at ?r - robot ?l - location)
    (gold-at ?g - gold ?l - location)
    (obstacle-at ?l - location)
    (adjacent ?l1 - location ?l2 - location)
    (collected ?g - gold))
  (:action move
    :parameters (?r - robot ?from - location ?to - location)
    :precondition (and (at ?r ?from) (adjacent ?from ?to) (not (obstacle-at ?to)))
    :effect (and (not (at ?r ?from)) (at ?r ?to)))
  (:action collect
    :parameters (?r - robot ?g - gold ?l - location)
    :precondition (and (at ?r ?l) (gold-at ?g ?l) (not (collected ?g)))
    :effect (and (collected ?g))))
`;

function makeMinefieldNegProblem(spec: MinefieldSpec): string {
  const { size, robot, golds, obstacles } = spec;
  const name = spec.name ?? `minefield-orig-${size}x${size}`;

  const locations: string[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) locations.push(loc(r, c));

  const adj: string[] = [];
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      if (c + 1 < size) {
        adj.push(`(adjacent ${loc(r, c)} ${loc(r, c + 1)})`);
        adj.push(`(adjacent ${loc(r, c + 1)} ${loc(r, c)})`);
      }
      if (r + 1 < size) {
        adj.push(`(adjacent ${loc(r, c)} ${loc(r + 1, c)})`);
        adj.push(`(adjacent ${loc(r + 1, c)} ${loc(r, c)})`);
      }
    }

  const goldObjs = golds.map((_, i) => `g${i + 1}`).join(' ');
  const goldAt = golds.map(([r, c], i) => `(gold-at g${i + 1} ${loc(r, c)})`);
  const obstacleAt = obstacles.map(([r, c]) => `(obstacle-at ${loc(r, c)})`);
  const goldGoal = golds.map((_, i) => `(collected g${i + 1})`).join(' ');

  return `;; ${size}x${size} MineField instance (original encoding)
(define (problem ${name})
  (:domain minefield)
  (:objects
    r1 - robot
    ${goldObjs} - gold
    ${locations.join(' ')} - location)
  (:init
    (at r1 ${loc(robot[0], robot[1])})
    ${goldAt.join('\n    ')}
    ${obstacleAt.join('\n    ')}
    ${adj.join('\n    ')})
  (:goal (and ${goldGoal})))
`;
}

const MINEFIELD_NEG_PROBLEM = makeMinefieldNegProblem({
  size: 4,
  robot: [0, 0],
  golds: [
    [0, 3],
    [3, 3],
  ],
  obstacles: [
    [1, 1],
    [2, 1],
    [1, 2],
  ],
});

// --- Gripper (classic IPC domain) ---------------------------------------------

const GRIPPER_DOMAIN = `;; Gripper — a robot with two grippers moves balls between two rooms.
(define (domain gripper)
  (:requirements :strips :typing)
  (:types room ball gripper)
  (:predicates
    (at-robby ?r - room)
    (at ?b - ball ?r - room)
    (free ?g - gripper)
    (carry ?b - ball ?g - gripper))
  (:action move
    :parameters (?from - room ?to - room)
    :precondition (at-robby ?from)
    :effect (and (at-robby ?to) (not (at-robby ?from))))
  (:action pick
    :parameters (?b - ball ?r - room ?g - gripper)
    :precondition (and (at ?b ?r) (at-robby ?r) (free ?g))
    :effect (and (carry ?b ?g) (not (at ?b ?r)) (not (free ?g))))
  (:action drop
    :parameters (?b - ball ?r - room ?g - gripper)
    :precondition (and (carry ?b ?g) (at-robby ?r))
    :effect (and (at ?b ?r) (free ?g) (not (carry ?b ?g)))))
`;

const GRIPPER_PROBLEM = `;; Move two balls from rooma to roomb.
(define (problem gripper-2balls)
  (:domain gripper)
  (:objects
    rooma roomb - room
    ball1 ball2 - ball
    left right - gripper)
  (:init
    (at-robby rooma)
    (free left) (free right)
    (at ball1 rooma) (at ball2 rooma))
  (:goal (and (at ball1 roomb) (at ball2 roomb))))
`;

// --- Blocksworld (classic) ----------------------------------------------------

const BLOCKSWORLD_DOMAIN = `;; Blocksworld — a robot arm stacks blocks. Positive preconditions only.
(define (domain blocksworld)
  (:requirements :strips :typing)
  (:types block)
  (:predicates
    (on ?x ?y - block)
    (ontable ?x - block)
    (clear ?x - block)
    (handempty)
    (holding ?x - block))
  (:action pick-up
    :parameters (?x - block)
    :precondition (and (clear ?x) (ontable ?x) (handempty))
    :effect (and (not (ontable ?x)) (not (clear ?x)) (not (handempty)) (holding ?x)))
  (:action put-down
    :parameters (?x - block)
    :precondition (holding ?x)
    :effect (and (not (holding ?x)) (clear ?x) (handempty) (ontable ?x)))
  (:action stack
    :parameters (?x ?y - block)
    :precondition (and (holding ?x) (clear ?y))
    :effect (and (not (holding ?x)) (not (clear ?y)) (clear ?x) (handempty) (on ?x ?y)))
  (:action unstack
    :parameters (?x ?y - block)
    :precondition (and (on ?x ?y) (clear ?x) (handempty))
    :effect (and (holding ?x) (clear ?y) (not (clear ?x)) (not (handempty)) (not (on ?x ?y)))))
`;

const BLOCKSWORLD_PROBLEM = `;; Build the tower A on B on C from three blocks on the table.
(define (problem blocks-abc)
  (:domain blocksworld)
  (:objects a b c - block)
  (:init
    (ontable a) (ontable b) (ontable c)
    (clear a) (clear b) (clear c)
    (handempty))
  (:goal (and (on a b) (on b c))))
`;

// --- Towers of Hanoi ----------------------------------------------------------

const HANOI_DOMAIN = `;; Towers of Hanoi — move discs between pegs, never a larger disc onto a smaller.
(define (domain hanoi)
  (:requirements :strips :typing)
  (:types obj)
  (:predicates
    (clear ?x - obj)
    (on ?x ?y - obj)
    (smaller ?x ?y - obj))
  (:action move
    :parameters (?disc ?from ?to - obj)
    :precondition (and (smaller ?disc ?to) (on ?disc ?from) (clear ?disc) (clear ?to))
    :effect (and (clear ?from) (on ?disc ?to) (not (on ?disc ?from)) (not (clear ?to)))))
`;

const HANOI_PROBLEM = `;; Three discs, three pegs. Move the stack from peg1 to peg3.
(define (problem hanoi-3)
  (:domain hanoi)
  (:objects peg1 peg2 peg3 d1 d2 d3 - obj)
  (:init
    ;; smaller ?x ?y  =  ?x may be placed on ?y
    (smaller d1 peg1) (smaller d1 peg2) (smaller d1 peg3)
    (smaller d2 peg1) (smaller d2 peg2) (smaller d2 peg3)
    (smaller d3 peg1) (smaller d3 peg2) (smaller d3 peg3)
    (smaller d1 d2) (smaller d1 d3) (smaller d2 d3)
    (clear peg2) (clear peg3) (clear d1)
    (on d3 peg1) (on d2 d3) (on d1 d2))
  (:goal (and (on d3 peg3) (on d2 d3) (on d1 d2))))
`;

// --- Epistemic planning (E-PDDL) — illustrative, NOT solved in-browser --------

const COIN_DOMAIN = `;; ───────────────────────────────────────────────────────────────────────
;; Coin in the Box — a classic EPISTEMIC-planning scenario (illustrative).
;;
;; Epistemic planning reasons about what AGENTS KNOW, not just world facts.
;; Notation (epistemic logic / PDKB-style):
;;     [a] p        agent a knows p
;;     [a][b] p     a knows that b knows p        (knowledge can NEST)
;;     !p           not p
;;
;; This is E-PDDL / PDKB-style syntax shown for teaching. It is NOT solved in
;; the browser — see the panel below for how epistemic planners solve it (by
;; compiling to classical planning). Exact grammar: Muise 2015; Fabiano 2021.
;; ───────────────────────────────────────────────────────────────────────
(define (domain coin-in-the-box)
  (:requirements :mep)               ; :mep = multi-agent epistemic planning
  (:agents a b)
  (:predicates (heads) (looking ?ag))

  ;; Peeking: the agent comes to KNOW which way the coin faces.
  (:action peek
    :parameters (?ag)
    :precondition (looking ?ag)
    :effect (knows-whether ?ag heads))     ; [?ag] heads  or  [?ag] !heads

  ;; Announcing: a public, truthful announcement of the coin value, after
  ;; which everyone knows it — and everyone knows that everyone knows it.
  (:action announce
    :parameters (?ag)
    :precondition (knows-whether ?ag heads)
    :effect (common-knowledge heads)))     ; [a]heads, [b]heads, [a][b]heads …
`;

const COIN_PROBLEM = `;; Goal involves NESTED knowledge — the kind only epistemic planning captures.
(define (problem secret-keeper)
  (:domain coin-in-the-box)
  (:init
    (heads)            ; the coin really is heads …
    (looking a))       ; … and agent a is positioned to peek
  ;; a should KNOW the coin is heads, while b must NOT know that a knows it:
  (:goal (and ([a] heads)
              (! [b][a] heads))))
`;

// A real, minimal PDKBDDL problem (from AI-Planning/epistemic-domains). Abstract
// (p, q) but genuinely solvable by the Phase-2 backend (pdkb-planning). Notation:
//   [a](p)  agent a knows p     <a>(p)  a considers p possible     !p  not p
const CLOSURE_DOMAIN = `;; Real PDKBDDL syntax - solvable when an epistemic backend is connected.
;;   [a](p)  a knows p      <a>(p)  a considers p possible      !p  not p
(define (domain closure)
    (:agents a)
    (:types )
    (:constants )
    (:predicates (p) (q))

    (:action apply
        :derive-condition   always
        :precondition       (and )
        :effect             (and [a](p))
    )

    (:action check
        :derive-condition   always
        :precondition       (and <a>(p))
        :effect             (q)
    )
)
`;

const CLOSURE_PROBLEM = `(define (problem prob)
    (:domain closure)

    (:projection )
    (:depth 2)
    (:task valid_generation)

    (:init-type complete)
    (:init
        [a](!p)
    )

    (:goal (q))
)
`;

export const EXAMPLES: Example[] = [
  {
    id: 'minefield',
    name: 'MineField (dissertation domain)',
    description:
      'A robot collects all gold on a grid while avoiding obstacles — the domain from the SMT/BMC planning dissertation, rendered as a 2-D grid.',
    domain: MINEFIELD_DOMAIN,
    problem: MINEFIELD_PROBLEM,
  },
  {
    id: 'minefield-original',
    name: 'MineField (original — negative preconditions)',
    description:
      'The dissertation domain exactly as written, with :negative-preconditions. pyperplan cannot solve this directly — the app compiles it to a positive equivalent automatically.',
    domain: MINEFIELD_NEG_DOMAIN,
    problem: MINEFIELD_NEG_PROBLEM,
  },
  {
    id: 'gripper',
    name: 'Gripper (classic)',
    description:
      'A two-gripper robot moves balls between rooms — a classic International Planning Competition benchmark.',
    domain: GRIPPER_DOMAIN,
    problem: GRIPPER_PROBLEM,
  },
  {
    id: 'blocksworld',
    name: 'Blocksworld (classic)',
    description:
      'A robot arm stacks blocks into a target tower — the canonical AI-planning teaching domain.',
    domain: BLOCKSWORLD_DOMAIN,
    problem: BLOCKSWORLD_PROBLEM,
  },
  {
    id: 'hanoi',
    name: 'Towers of Hanoi',
    description:
      'Move a stack of discs between three pegs, never placing a larger disc on a smaller one.',
    domain: HANOI_DOMAIN,
    problem: HANOI_PROBLEM,
  },
  {
    id: 'coin-epistemic',
    name: 'Coin in the Box (epistemic · illustrative)',
    description:
      'A readable epistemic scenario about what agents KNOW. Illustrative syntax for learning the ideas — not valid PDKBDDL, so it will not solve on the backend.',
    domain: COIN_DOMAIN,
    problem: COIN_PROBLEM,
    epistemic: true,
  },
  {
    id: 'closure-pdkbddl',
    name: 'Closure (real PDKBDDL · backend-solvable)',
    description:
      'A minimal but real PDKBDDL problem. Abstract, but genuinely solvable when an epistemic backend (pdkb-planning + Fast Downward) is connected.',
    domain: CLOSURE_DOMAIN,
    problem: CLOSURE_PROBLEM,
    epistemic: true,
  },
];
