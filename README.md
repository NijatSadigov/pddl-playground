# PDDL Playground

An interactive, in-browser tool for teaching and exploring AI planning with PDDL.
Write a planning **domain** and **problem**, choose a solver, watch the plan run
step by step (with a 2-D grid animation for the *MineField* domain), and compare
solvers side by side. The classical planner runs entirely in the browser; optional
backends add full-PDDL classical planning and multi-agent epistemic planning.

## Solver engines

A top-level picker chooses where and how planning runs. The in-browser engine is
always available; the others activate when a backend URL is configured at build
time.

| Engine | Planner(s) | Runs | Notes |
|--------|-----------|------|-------|
| **In-browser** | `pyperplan` (BFS, A\* + hFF / hMax / LM-Cut, Greedy, Weighted A\*) | The visitor's browser, via WebAssembly | STRIPS + typing; negative preconditions are compiled away on the fly. Fully offline. |
| **Server (full PDDL)** | LAPKT BFWS (`siw-then-bfsf`, `bfws`, `bfs_f`, `siw`) and Fast Downward (LAMA-first, A\* + LM-Cut, A\* + blind) | Backend | Handles negative preconditions, conditional effects and action costs natively. Includes cost-optimal configurations. |
| **Epistemic** | RP-MEP (`pdkb-planning`) for PDKBDDL, and native **EFP** for E-PDDL | Backend | Reasoning about what agents know and believe. EFP also renders the Kripke / possibility state graphs in the browser. |

## Features

- Two live PDDL editors (domain + problem) with syntax highlighting and inline
  validation (unbalanced parentheses, missing headers).
- Step-through plan visualiser: play / pause / scrub, a per-step added / deleted
  state diff, and goal tracking. The *MineField* domain also animates on a 2-D
  grid.
- "Compare all" for the in-browser presets and for the server planners: the same
  problem is run across every planner and tabulated by plan length, nodes
  expanded and time, showing the satisficing-versus-optimal and heuristic
  trade-offs.
- Negative-precondition compiler: domains using `:negative-preconditions` (which
  `pyperplan` cannot solve) are rewritten to a positive equivalent on the fly,
  with an in-app explanation of the transformation.
- Epistemic state visualisation: when the EFP engine solves an E-PDDL problem, the
  initial belief state and the state after each action are rendered as graphviz
  graphs, stepped through in the browser.
- Sharing and persistence: a self-contained share link (domain + problem
  compressed into the URL), `.pddl` / plan downloads, and `localStorage` autosave.
- Built-in examples: classical (MineField, Gripper, Blocksworld, Towers of Hanoi)
  and epistemic (Coin in the Box, Secure Handshake, Tactical Bluff, Thief and
  Guard, Grapevine, plus an E-PDDL Coin example for EFP).
- Light / dark theme, an onboarding card, and a first-load progress indicator.

## Architecture

The frontend is a static single-page app: build it and serve the `dist/` folder.
The in-browser planner (`pyperplan`) runs in each visitor's browser via Pyodide
(CPython compiled to WebAssembly) inside a Web Worker, so the UI never freezes.

The server and epistemic engines are optional. They call one backend over HTTP
(`pddl-epistemic-backend`), which solves PDKBDDL and classical PDDL locally and
proxies Fast Downward and EFP requests to two internal services over a private
Docker network. With no backend configured, the build is 100% static and offline.

```
browser (static app)
  in-browser: Pyodide + pyperplan
  server/epistemic ── HTTPS ──> pddl-epistemic-backend
                                  ├─ pdkb-planning (RP-MEP) + LAPKT BFWS
                                  ├─ proxy ─> fast-downward-backend
                                  └─ proxy ─> efp-backend (native EFP)
```

## Deployment

### Build

Requires Node.js >= 20 (developed on Node 24).

```bash
npm install
npm run build   # outputs the static site to ./dist
```

`dist/` is a self-contained website (HTML + JS + CSS, about 200 KB gzipped, plus
a lazily-loaded graphviz chunk used only by the epistemic visualiser). Asset paths
are relative (`base: './'` in `vite.config.ts`), so it works from a subdomain root
or a sub-path.

### Serve the `dist/` folder

Point a subdomain at the contents of `dist/`. Any static file server works.
Example Caddy configuration:

```caddy
pddl.example.com {
    root * /var/www/pddl-playground/dist
    encode gzip zstd
    file_server
    try_files {path} /index.html
}
```

Caddy provisions HTTPS automatically.

### Runtime notes

- **Serve over HTTPS.** The share-link feature uses a secure-context clipboard API.
- **Outbound internet on first load.** The browser downloads the Python/WASM
  runtime and planner from public CDNs (`cdn.jsdelivr.net` for Pyodide,
  `files.pythonhosted.org` for the `pyperplan` wheel), then caches them. A
  Content-Security-Policy, if set, must allow those hosts plus `'wasm-unsafe-eval'`:
  ```
  Content-Security-Policy: default-src 'self';
    script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
    connect-src 'self' https://cdn.jsdelivr.net https://files.pythonhosted.org;
    style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  ```
- **No special headers.** Standard Pyodide does not need cross-origin isolation.
- **Caching.** Built assets are content-hashed; cache `assets/*` aggressively and
  serve `index.html` with a short or no cache.

### Enable the server and epistemic engines

Deploy the backend services and build with the backend URL:

```bash
VITE_EPISTEMIC_API=https://epistemic.example.com npm run build
```

The three backends are separate repositories:
[`pddl-epistemic-backend`](https://github.com/NijatSadigov/pddl-epistemic-backend)
(the entry point the frontend talks to),
[`fast-downward-backend`](https://github.com/NijatSadigov/fast-downward-backend),
and [`efp-backend`](https://github.com/NijatSadigov/efp-backend). With the variable
unset, the server and epistemic engines are disabled and the build stays static.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173 (hot reload)
npm test         # Vitest: parser, plan simulator, compilers, validators
```

## Project structure

```
src/
  App.tsx                     UI shell and state wiring
  components/                 CodeEditor, PlanVisualiser, MinefieldGrid,
                              ComparisonTable, EpistemicPanel, EpistemicStates,
                              CompileInfo, EngineLoader, Intro
  solver/
    pyperplanRunner.ts        loads Pyodide + pyperplan, runs the planner
    solver.worker.ts          the Web Worker the planner runs in
    presets.ts                in-browser solver presets
    serverSolver.ts           server engine client (BFWS + Fast Downward)
    epistemicSolver.ts        epistemic engine client (RP-MEP + EFP)
  pddl/
    parser.ts                 lightweight PDDL parser (S-expressions)
    simulate.ts               applies a plan to produce per-step state and diff
    compileNegatives.ts       :negative-preconditions to positive normal form
    minefield.ts              grid interpretation for the MineField view
    validate.ts               inline editor validation
    pddl.test.ts              unit tests
  data/examples.ts            built-in domains and problems
  share.ts                    share-link encode/decode, downloads, autosave
```

## Design note: the PDDL subset and the compiler

`pyperplan` supports STRIPS + typing with positive preconditions only. With
"Compile negative preconditions" on (the default), a domain that negates a
predicate `P` in a precondition or goal is rewritten to positive normal form
before solving: a complementary predicate `not-P` is introduced, the initial
state is completed under the closed-world assumption, and effects are mirrored.
The original sources stay in the editors and drive the visualiser; only the solver
sees the compiled version. Delete effects such as `(not (at ?r ?from))` are pure
STRIPS and are not rewritten. See
[`src/pddl/compileNegatives.ts`](src/pddl/compileNegatives.ts). To avoid the
compiler entirely, the server engine accepts negative preconditions natively.

## Tech stack

React + TypeScript + Vite, CodeMirror 6 (editors), Pyodide + `pyperplan` (the
in-browser solver, loaded at runtime rather than bundled), `@hpcc-js/wasm`
(graphviz rendering for the epistemic state graphs), lz-string (share links),
Vitest (tests).

## Credits

`pyperplan` is GPL-licensed and loaded at runtime in the browser from PyPI; it is
not bundled into this site's source. The epistemic backends build on
[`pdkb-planning`](https://github.com/QuMuLab/pdkb-planning) (Muise et al.) and
[EFP](https://github.com/FrancescoFabiano/EFP) with the
[E-PDDL](https://github.com/FrancescoFabiano/E-PDDL) parser (Fabiano et al.). Built
as an MSc portfolio project alongside a dissertation on SMT/BMC for AI planning.

Developed with assistance from Claude Code, used to refine the design and the
wording of the documentation and UI.
