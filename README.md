# PDDL Playground

An interactive, in-browser tool for teaching and exploring **AI planning** with
PDDL. Write a planning **domain** and **problem**, choose a **solver**, watch the
plan execute step by step (with a 2-D grid animation for the *MineField* domain),
and compare solvers side by side — all running entirely in the visitor's browser.

> **Deploying this?** Jump to **[Deployment](#deployment)**. Short version: it is
> a plain **static site** — run `npm run build` and serve the `dist/` folder.
> No backend, no database, no secrets.

---

## Deployment

This is a **static single-page app**. There is no server-side code: the planner
(`pyperplan`) runs in each visitor's browser via WebAssembly. To publish it you
only need to build it and serve the resulting static files.

### 1. Build

Requires **Node.js ≥ 20** (developed on Node 24).

```bash
npm ci          # or: npm install
npm run build   # outputs the static site to ./dist
```

`dist/` is the complete, self-contained website (HTML + JS + CSS, ~200 KB
gzipped). Asset paths are **relative** (`base: './'` in `vite.config.ts`), so it
works whether served from a subdomain root or a sub-path.

### 2. Serve the `dist/` folder

Point a subdomain (e.g. `pddl.example.com`) at the contents of `dist/`. Any
static file server works. **Caddy** example (`Caddyfile`):

```caddy
pddl.example.com {
    root * /var/www/pddl-playground/dist
    encode gzip zstd
    file_server
    # Optional SPA fallback (the app is single-page; harmless to include):
    try_files {path} /index.html
}
```

Caddy provisions HTTPS automatically. With another server (nginx/Apache/static
host), just serve `dist/` as the document root.

### Requirements & gotchas (please read before publishing)

- **Serve over HTTPS.** The app uses a secure-context API (clipboard for "share
  link"); Caddy gives automatic HTTPS out of the box.
- **Outbound internet at runtime.** On first load the visitor's browser
  downloads the Python/WASM runtime and the planner from public CDNs:
  - `https://cdn.jsdelivr.net` — Pyodide runtime (version-pinned)
  - `https://files.pythonhosted.org` (PyPI) — the `pyperplan` wheel
  These are fetched **by the browser, not the server**, and cached afterward.
  If you add a **Content-Security-Policy**, it must allow those two hosts plus
  `'wasm-unsafe-eval'` (Pyodide compiles WebAssembly). Example directive:
  ```
  Content-Security-Policy: default-src 'self';
    script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
    connect-src 'self' https://cdn.jsdelivr.net https://files.pythonhosted.org;
    style-src 'self' 'unsafe-inline'; img-src 'self' data:;
  ```
  If you don't set a CSP at all (typical), **nothing to configure** — it just works.
- **No special headers needed.** Standard Pyodide does not require cross-origin
  isolation (no COOP/COEP).
- **Caching.** Built assets are content-hashed, so you can cache `assets/*`
  aggressively; serve `index.html` with a short/no cache so updates roll out.

### Verifying the production build before going live

```bash
npm run preview   # serves the built dist/ locally; open the printed URL, click Solve
```

---

## Features

- **Two live PDDL editors** (domain + problem) with syntax highlighting and
  inline validation (unbalanced parentheses, missing headers).
- **Multiple solvers** — `pyperplan` search/heuristic combinations as presets:
  BFS (uninformed), A\* + hFF, A\* + hMax / LM-Cut (admissible → optimal),
  Greedy Best-First, Weighted A\*.
- **"Compare all"** — runs every solver on the same problem and tabulates plan
  length, nodes expanded and time, so students see the search/heuristic
  trade-off (e.g. uninformed BFS expands far more nodes than A\* + hFF).
- **Step-through visualiser** — play/pause/scrub the plan; per-step
  `+ added` / `− deleted` state diff; goal tracking; static facts hidden by
  default for readability.
- **Domain-specific MineField grid** — animates the robot collecting gold and
  avoiding obstacles on a 2-D grid.
- **Negative-precondition compiler** — domains using `:negative-preconditions`
  (which `pyperplan` can't solve) are compiled to a positive equivalent on the
  fly, so the original dissertation domain runs verbatim.
- **Sharing & persistence** — copy a self-contained share link (domain + problem
  compressed into the URL), download `.pddl`/plan files, and auto-save the last
  session to `localStorage`.
- **Epistemic (E-PDDL) explorer** — write/explore epistemic-planning domains
  (reasoning about what agents *know*). Not solved in-browser; instead the app
  explains how they're solved by *compiling to classical planning*
  (RP-MEP / `pdkb-planning`).
- **Built-in examples** — MineField (positive + original/negative encodings),
  Gripper, Blocksworld, Towers of Hanoi, and a Coin-in-the-Box epistemic example.
- **Light / dark theme**, onboarding card, and a first-load progress indicator.

## Architecture

![Where the work runs](docs/architecture.svg)

The server only serves static files. The solver runs in each visitor's browser,
so there is no shared back-end to overload — it scales to any number of
concurrent users.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173 (hot reload)
```

## Tests

```bash
npm test         # Vitest: parser, plan simulator, compilers, validators
```

## Project structure

```
src/
  App.tsx                     UI shell + state wiring
  components/                 CodeEditor, PlanVisualiser, MinefieldGrid,
                              ComparisonTable, EpistemicPanel, EngineLoader, Intro
  solver/
    pyperplanRunner.ts        loads Pyodide + pyperplan, runs the planner
    presets.ts                solver (search + heuristic) presets
  pddl/
    parser.ts                 lightweight PDDL parser (S-expressions)
    simulate.ts               applies a plan → per-step state + diff
    compileNegatives.ts       :negative-preconditions → positive normal form
    minefield.ts              grid interpretation for the MineField view
    validate.ts               inline editor validation
    pddl.test.ts              unit tests
  data/examples.ts            built-in domains/problems
  share.ts                    share-link encode/decode, downloads, autosave
docs/architecture.svg         "where the work runs" diagram
```

## Design note: PDDL subset

`pyperplan` supports **STRIPS + typing** with **positive preconditions only**.
When "Compile negative preconditions" is on (the default), a domain that negates
a predicate `P` in a precondition is compiled to **positive normal form** before
solving — a complementary predicate `not-P` is introduced, the initial state is
completed under the closed-world assumption, and effects are mirrored. The
original sources stay in the editors and drive the visualiser; only the solver
sees the compiled version. See [`src/pddl/compileNegatives.ts`](src/pddl/compileNegatives.ts).
Delete effects (e.g. `(not (at ?r ?from))`) are pure STRIPS and never need rewriting.

## Scope & future work

The solver runs **fully in the browser** by design, so the tool stays reliable
and offline. This covers the **STRIPS + typing** subset (plus negative
preconditions via the compiler).

- **Full-PDDL features** (conditional effects, quantifiers, action costs,
  temporal planning) need a heavier planner such as **Fast Downward**, which does
  not run in the browser. These could be added later via a self-hosted
  [planning-as-a-service](https://github.com/AI-Planning/planning-as-a-service)
  backend as an optional "online solver".
- **Epistemic (E-PDDL) solving** is solved in the literature by *compiling to
  classical planning* ([pdkb-planning](https://github.com/QuMuLab/pdkb-planning),
  [E-PDDL](https://github.com/FrancescoFabiano/E-PDDL)) and running Fast Downward —
  also a hosted-backend task. The in-app explorer documents this pipeline.

## Tech stack

React + TypeScript + Vite · CodeMirror 6 (editors) · Pyodide + `pyperplan` (solver,
loaded at runtime, not bundled) · lz-string (share links) · Vitest (tests).

## Credits

`pyperplan` (the planner) is GPL-licensed and is loaded **at runtime** in the
browser from PyPI — it is not bundled into this site's source. Built as an MSc
portfolio project alongside a dissertation on SMT/BMC for AI planning.
