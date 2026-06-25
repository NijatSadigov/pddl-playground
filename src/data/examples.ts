// Built-in example domains. All are written in the STRIPS + typing subset that
// pyperplan supports (positive preconditions only — see README).

export interface Example {
  id: string;
  name: string;
  description: string;
  domain: string;
  problem: string;
  /** Epistemic example, solved on the backend (not in-browser) — see EpistemicPanel. */
  epistemic?: boolean;
  /** Epistemic example written in E-PDDL for the native EFP planner (rather than
   * PDKBDDL for RP-MEP). Both are epistemic; this picks the backend planner. */
  epddl?: boolean;
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

// Render the grid as an ASCII sketch for the top of a problem file, so a reader
// can see the layout at a glance instead of decoding the flat fact list.
function gridSketch(spec: MinefieldSpec): string {
  const { size, robot, golds, obstacles } = spec;
  const symbol = (r: number, c: number) => {
    if (robot[0] === r && robot[1] === c) return 'R';
    if (golds.some(([gr, gc]) => gr === r && gc === c)) return 'G';
    if (obstacles.some(([or, oc]) => or === r && oc === c)) return 'X';
    return '.';
  };
  const rows: string[] = [];
  for (let r = 0; r < size; r++) {
    const cells: string[] = [];
    for (let c = 0; c < size; c++) cells.push(symbol(r, c));
    rows.push(`;;     ${cells.join(' ')}`);
  }
  return (
    `;; Grid layout (row 0 is the top row, loc-row-col):\n` +
    `${rows.join('\n')}\n` +
    `;;   R = robot start   G = gold   X = obstacle (mine)   . = open cell`
  );
}

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

  return `;; ${size}x${size} MineField instance (positive-precondition encoding)
${gridSketch(spec)}
(define (problem ${name})
  (:domain minefield)
  ;; One robot, the gold pieces, and one location object per grid cell.
  (:objects
    r1 - robot
    ${goldObjs} - gold
    ${locations.join(' ')} - location)
  (:init
    ;; where the robot starts
    (at r1 ${loc(robot[0], robot[1])})
    ;; where each gold piece sits
    ${goldAt.join('\n    ')}
    ;; gold not yet collected
    ${uncollected.join(' ')}
    ;; cells with no obstacle (the positive 'clear' encoding)
    ${clears.join('\n    ')}
    ;; which cells are adjacent (4-connected, both directions)
    ${adj.join('\n    ')})
  ;; Goal: collect every gold piece.
  (:goal (and ${goldGoal})))
`;
}


// --- MineField (ORIGINAL dissertation domain, with :negative-preconditions) ---
// pyperplan cannot solve this directly; the app compiles it to a positive
// equivalent on the fly (see compileNegatives.ts).

export const MINEFIELD_NEG_DOMAIN = `;; MineField — the ORIGINAL dissertation domain (uses :negative-preconditions).
;; A robot moves around a grid of locations, avoiding obstacles (mines), and
;; collects every gold piece. Locations are linked by an 'adjacent' relation, so
;; the grid's size and shape live entirely in the problem file; this domain works
;; for any grid.
(define (domain minefield)
  (:requirements :strips :typing :negative-preconditions)
  (:types robot gold location - object)
  (:predicates
    (at ?r - robot ?l - location)             ;; robot ?r is on cell ?l
    (gold-at ?g - gold ?l - location)         ;; gold ?g lies on cell ?l
    (obstacle-at ?l - location)               ;; cell ?l holds an obstacle (mine)
    (adjacent ?l1 - location ?l2 - location)  ;; you can step from ?l1 to ?l2
    (collected ?g - gold))                    ;; gold ?g has been picked up
  ;; Step to an adjacent cell, provided it has no obstacle.
  ;; The negative precondition (not (obstacle-at ?to)) is exactly what pyperplan
  ;; cannot read directly — see "How does the compiler work?" under the editors.
  (:action move
    :parameters (?r - robot ?from - location ?to - location)
    :precondition (and (at ?r ?from) (adjacent ?from ?to) (not (obstacle-at ?to)))
    :effect (and (not (at ?r ?from)) (at ?r ?to)))
  ;; Pick up the gold on the robot's current cell (each piece only once).
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

  return `;; ${size}x${size} MineField instance (original :negative-preconditions encoding)
${gridSketch(spec)}
(define (problem ${name})
  (:domain minefield)
  ;; One robot, the gold pieces, and one location object per grid cell.
  (:objects
    r1 - robot
    ${goldObjs} - gold
    ${locations.join(' ')} - location)
  (:init
    ;; where the robot starts
    (at r1 ${loc(robot[0], robot[1])})
    ;; where each gold piece sits
    ${goldAt.join('\n    ')}
    ;; obstacles (mines) the robot must avoid
    ${obstacleAt.join('\n    ')}
    ;; which cells are adjacent (4-connected, both directions)
    ${adj.join('\n    ')})
  ;; Goal: collect every gold piece.
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

const COIN_DOMAIN = `;; Coin in the Box - a small REAL PDKBDDL epistemic example (backend-solvable).
;;   [a](p)  agent a knows/believes p     <a>(p)  a considers p possible     !p  not p
;; Doxastic (belief) planning: agent a revises its belief by peeking, then announces.
(define (domain coin-in-the-box)
    (:agents a)
    (:types )
    (:constants )
    (:predicates (heads) (announced))

    ;; a peeks and comes to believe the coin shows heads
    (:action peek
        :derive-condition   always
        :precondition       (and )
        :effect             (and [a](heads))
    )

    ;; a announces, allowed once a considers heads possible
    (:action announce
        :derive-condition   always
        :precondition       (and <a>(heads))
        :effect             (and (announced))
    )
)
`;

const COIN_PROBLEM = `;; Start: a believes the coin is NOT heads. Goal: it gets announced.
;; Plan: (peek) then (announce).
(define (problem prob)
    (:domain coin-in-the-box)

    (:projection )
    (:depth 2)
    (:task valid_generation)

    (:init-type complete)
    (:init
        [a](!heads)
    )

    (:goal (announced))
)
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

// --- Secure Handshake (cooperative coordination) ------------------------------
// Three agents on a 2x2 grid. The scout knows where the target is; the
// interceptor must come to know it while the eavesdropping enemy must not. The
// only way to satisfy "enemy does NOT know" is a targeted secure_ping rather than
// a public_announce — the planner works that out. "Agent does not know p" is
// written ![ag](p); [ag](p) is "ag knows p". {AK} marks common-knowledge facts.
const HANDSHAKE_DOMAIN = `;; Secure Handshake - cooperative, truthful coordination.
;;   [ag](p)  = agent ag knows p        ![ag](p) = ag does NOT know p
;;   {AK}(..) = common knowledge (every agent observes it)
(define (domain secure-handshake)
    (:agents scout interceptor enemy)
    (:types loc)
    (:constants)
    (:predicates
        {AK}(at ?ag - agent ?l - loc)
        {AK}(adjacent ?l1 - loc ?l2 - loc)
            (targetat ?l - loc))

    ;; Open channel: everyone (including the eavesdropping enemy) learns it.
    (:action public_announce
        :derive-condition  always
        :parameters        (?ag - agent ?l - loc)
        :precondition      (and [?ag](targetat ?l))
        :effect            (and [scout](targetat ?l)
                                [interceptor](targetat ?l)
                                [enemy](targetat ?l)))

    ;; Private channel: only the named receiver learns it.
    (:action secure_ping
        :derive-condition  always
        :parameters        (?sender ?receiver - agent ?l - loc)
        :precondition      (and [?sender](targetat ?l))
        :effect            (and [?receiver](targetat ?l)))

    ;; Physical movement between adjacent cells.
    (:action move
        :derive-condition  always
        :parameters        (?ag - agent ?from ?to - loc)
        :precondition      (and (at ?ag ?from) (adjacent ?from ?to))
        :effect            (and (at ?ag ?to) (!at ?ag ?from)))
)
`;

const HANDSHAKE_PROBLEM = `;; 2x2 grid. Scout@p00 knows the target is at p01; interceptor@p11; enemy@p10.
;; Goal: interceptor knows the target AND the enemy does not, so the planner
;; must choose secure_ping over public_announce.
(define (problem secure-handshake-2x2)
    (:domain secure-handshake)
    (:objects p00 p01 p10 p11 - loc)
    (:projection )
    (:depth 1)
    (:task valid_generation)
    (:init-type complete)
    (:init
        (adjacent p00 p01)(adjacent p01 p00)
        (adjacent p00 p10)(adjacent p10 p00)
        (adjacent p01 p11)(adjacent p11 p01)
        (adjacent p10 p11)(adjacent p11 p10)
        (at scout p00)(at interceptor p11)(at enemy p10)
        (targetat p01)
        [scout](targetat p01))
    (:goal (and
        [interceptor](targetat p01)
        ![enemy](targetat p01)))
)
`;

// --- Tactical Bluff (adversarial deception) -----------------------------------
// White knows the asset is in Box A; Black does not. The goal asks White to
// instill a FALSE belief in Black: that the asset is in Box B. pdkb-planning's
// default logic is KD (belief), which has no truth axiom, so a belief can be
// false — deceptive_tell solves it. (An S5/knowledge engine would reject this,
// since knowledge must be true.)
const BLUFF_DOMAIN = `;; Tactical Bluff - adversarial deception (doxastic / belief logic).
;;   [ag](p) here reads as "ag believes p"; beliefs need not be true.
(define (domain tactical-bluff)
    (:agents white black)
    (:types box)
    (:constants)
    (:predicates
            (in ?b - box))   ;; the asset is in box ?b

    ;; Secretly look inside a box: come to believe whether the asset is there.
    (:action peek
        :derive-condition  always
        :parameters        (?ag - agent ?b - box)
        :precondition      (and )
        :effect            (and (when (in ?b) [?ag](in ?b))
                                (when (!in ?b) [?ag](!in ?b))))

    ;; Deceptive tell: a sender who knows a box is empty makes the receiver
    ;; believe the asset is in it: a deliberate lie the receiver trusts.
    (:action deceptive_tell
        :derive-condition  always
        :parameters        (?sender ?receiver - agent ?b - box)
        :precondition      (and [?sender](!in ?b))
        :effect            (and [?receiver](in ?b)))
)
`;

const BLUFF_PROBLEM = `;; Asset really in Box A. White knows it; Black knows nothing yet.
;; Goal: White still knows the truth (Box A) while Black BELIEVES Box B - a
;; false belief that draws Black away from the asset.
(define (problem tactical-bluff)
    (:domain tactical-bluff)
    (:objects boxa boxb - box)
    (:projection )
    (:depth 1)
    (:task valid_generation)
    (:init-type complete)
    (:init
        (in boxa)
        (!in boxb)
        [white](in boxa)
        [white](!in boxb))
    (:goal (and
        [white](in boxa)
        [black](in boxb)))
)
`;

// --- Coin in the Box (E-PDDL, for the native EFP planner) ---------------------
// Same puzzle as the PDKBDDL Coin example, but written in E-PDDL and solved by
// EFP, which builds explicit possibility states rather than compiling to
// classical planning. :act_type marks ontic/sensing/announcement actions, and
// :observers / :p_observers say who fully or partially observes each action.
const COIN_EPDDL_DOMAIN = `(define (domain coininthebox)
  (:requirements :strips :negative-preconditions :mep)
  (:predicates (opened) (has_key ?ag - agent) (looking ?ag - agent) (tail))

  (:action open
    :act_type   ontic
    :parameters (?ag - agent)
    :precondition (and ([?ag](has_key ?ag)) (has_key ?ag))
    :effect (opened)
    :observers (and (forall (diff(?ag2)(?ag)) (when (looking ?ag2) (?ag2))) (?ag)))

  (:action peek
    :act_type   sensing
    :parameters (?ag - agent)
    :precondition (and ([?ag](opened)) ([?ag](looking ?ag)) (looking ?ag) (opened))
    :effect (when (looking ?ag) (tail))
    :observers  (?ag)
    :p_observers (and (forall (diff(?ag2)(?ag)) (when (looking ?ag2) (?ag2)))))

  (:action signal
    :parameters (?ag1 ?ag2 - agent)
    :precondition (and ([?ag1](looking ?ag1)) ([?ag2](not (looking ?ag2))))
    :effect (looking ?ag2)
    :observers (?ag1 ?ag2))

  (:action distract
    :parameters (?ag1 ?ag2 - agent)
    :precondition (and ([?ag1](looking ?ag1)) ([?ag2](looking ?ag2)))
    :effect (not (looking ?ag2))
    :observers (?ag1 ?ag2))

  (:action announce
    :act_type   announcement
    :parameters (?ag - agent)
    :precondition (and ([?ag](tail)) (tail))
    :effect (tail)
    :observers (and (forall (diff(?ag2)(?ag)) (when (looking ?ag2) (?ag2))) (?ag))))
`;

const COIN_EPDDL_PROBLEM = `(define (problem pb1)
  (:domain coininthebox)
  (:agents a b c)
  (:depth 2)
  (:init (tail) (has_key a) (looking a)
    ([a b c](has_key a)) ([a b c](not (has_key b))) ([a b c](not (has_key c)))
    ([a b c](not (opened))) ([a b c](looking a))
    ([a b c](not (looking b))) ([a b c](not (looking c))))
  (:goal ([b](opened)))
)
`;

export const EXAMPLES: Example[] = [
  {
    id: 'minefield',
    name: 'MineField (dissertation domain)',
    description:
      'A robot collects all the gold on a grid while avoiding obstacles (mines) — the dissertation domain, shown as a 2-D grid. The problem file opens with an ASCII sketch of the layout. It is written with :negative-preconditions, which pyperplan cannot solve directly: the in-browser engine compiles them to a positive form automatically (see the toggle and explanation under the editors), or the Server engine solves it natively.',
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
    name: 'Coin in the Box (epistemic)',
    description:
      'A small REAL PDKBDDL epistemic problem (belief revision). Solvable on the backend - plan: (peek) then (announce).',
    domain: COIN_DOMAIN,
    problem: COIN_PROBLEM,
    epistemic: true,
  },
  {
    id: 'closure-pdkbddl',
    name: 'Closure (real PDKBDDL · backend-solvable)',
    description:
      'A minimal but real PDKBDDL problem. Abstract, but genuinely solvable when an epistemic backend (pdkb-planning) is connected.',
    domain: CLOSURE_DOMAIN,
    problem: CLOSURE_PROBLEM,
    epistemic: true,
  },
  {
    id: 'secure-handshake',
    name: 'Secure Handshake (coordination)',
    description:
      'Three agents on a 2x2 grid: a scout that knows the target location, an interceptor that must learn it, and an enemy eavesdropping on the public channel. The goal requires the interceptor to know the target while the enemy does NOT — so the planner picks the targeted secure_ping over a public_announce. Solves on the backend to (secure_ping_scout_interceptor_p01).',
    domain: HANDSHAKE_DOMAIN,
    problem: HANDSHAKE_PROBLEM,
    epistemic: true,
  },
  {
    id: 'tactical-bluff',
    name: 'Tactical Bluff (deception · KD45)',
    description:
      'White knows an asset is in Box A; the goal is to make Black hold the FALSE belief that it is in Box B. pdkb-planning uses belief (KD) logic by default — beliefs need not be true — so the deception is representable and solves to (deceptive_tell_white_black_boxb). A pure S5/knowledge engine would reject it, since knowledge must be true.',
    domain: BLUFF_DOMAIN,
    problem: BLUFF_PROBLEM,
    epistemic: true,
  },
  {
    id: 'coin-epddl',
    name: 'Coin in the Box (E-PDDL · native EFP)',
    description:
      'The Coin puzzle in E-PDDL, solved by the native EFP planner, which builds explicit possibility states instead of compiling to classical planning. Agent a can open the box (it knows it has the key); b learns the coin shows tails only by looking. Solving (depth 2) yields a 2-step plan, e.g. (signal_a_b) then (open_a).',
    domain: COIN_EPDDL_DOMAIN,
    problem: COIN_EPDDL_PROBLEM,
    epistemic: true,
    epddl: true,
  },
];
