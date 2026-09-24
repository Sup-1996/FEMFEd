# FEMFEd — project structure

This is FEMFEd (the Thai-language finite-element teaching app) split from a
single ~2,700-line `index.html` into small, single-purpose ES modules. No
build step, no framework, no dependencies — just native browser `<script
type="module">` imports.

## Running it

Browsers refuse to load ES modules from a `file://` URL, so this has to be
served over http(s):

```bash
npx serve .
# or: python3 -m http.server
# or: VS Code's "Live Server" extension
# or just push it to GitHub Pages
```

Then open the printed `localhost` URL. That's the only "build step" — there
isn't one otherwise.

## Why this layout

The original file mixed five different concerns in one script tag: mesh
generation, the FEM solver, canvas rendering, DOM-building for six wizard
steps, and the wizard's own state/navigation. Any small change meant
scrolling through all of it to find the one function that mattered, and
it was easy to accidentally touch something unrelated.

The split follows those five concerns:

```
femfed/
├── index.html                  ← thin shell: header + 3 empty panels + <script type="module">
├── css/
│   └── styles.css              ← unchanged, just pulled out of <style>
└── js/
    ├── main.js                 ← one line: renderAll()
    ├── state.js                ← the `state` object + STEPS wizard config
    │
    ├── mesh/                   ← "given a shape, produce nodes + elements"
    │   ├── line-mesh.js            1D bar mesh (+ its quadratic upgrade)
    │   ├── rectangle-mesh.js       2D regular-grid mesh
    │   ├── polygon-mesh.js         freeform polygon → triangulated mesh
    │   ├── quadratic-mesh.js       2D triangle mesh → 6-node upgrade
    │   ├── mesh-service.js         generateMesh() — picks the right builder above
    │   └── shape-info.js           edge names/labels/bbox from state alone
    │                               (no mesh needed yet — used by the BC step,
    │                               which intentionally runs *before* meshing)
    │
    ├── solver/                 ← "given a mesh + BCs, produce a temperature field"
    │   ├── assembly.js             [K]{T}={F} assembly + Dirichlet elimination
    │   ├── mass-matrix.js          [M] (HRZ-lumped) for transient analysis
    │   ├── linear-solvers.js       Conjugate Gradient + direct LU (mesh-agnostic)
    │   ├── exact-solutions.js      closed-form comparisons where one exists
    │   ├── steady-solver.js        solveHeatConduction()
    │   └── transient-solver.js     solveTransientHeatConduction()
    │
    ├── render/                 ← "given a mesh/result, draw it on a <canvas>"
    │   ├── colormap.js             the rainbow temperature scale
    │   ├── canvas-transform.js     fitTransform() + triangle list for drawing
    │   ├── contour-canvas.js       2D gradient fill, outline, colorbar
    │   ├── domain-1d-canvas.js     1D domain line, mesh dots, results chart
    │   ├── shape-preview-canvas.js polygon drawing tool + shape preview
    │   ├── shape-function-diagram.js  the N_i(x) illustration on the mesh step
    │   └── equation-markup.js      frac()/rm()/bar()/vec()/eqBlock() + the
    │                               four governing-equation HTML strings
    │
    └── ui/                     ← the wizard itself
        ├── layout.js                renderAll() / renderMain() — the only
        │                            place that knows about all six steps
        ├── nav.js                   left-hand step list
        ├── info-panel.js            right-hand "model summary" panel
        ├── dom-helpers.js           makeTitle(), navButtons(), numField(), …
        ├── playback.js              the transient-results play/pause timer
        └── steps/
            ├── equation-step.js     step 1
            ├── geometry-step.js     step 2
            ├── material-step.js     step 3
            ├── bc-step.js           step 4 (runs before meshing — see shape-info.js)
            ├── mesh-step.js         step 5
            └── solve-step.js        step 6 (steady + transient results)
```

**Import direction, roughly:** `ui/steps/*` → `ui/dom-helpers`, `render/*`,
`solver/*`, `mesh/*` → `state.js`. `ui/layout.js` is the one file every step
imports `renderAll`/`renderMain` back from (a step's "Next" button needs to
trigger a re-render) — that's a deliberate two-way edge, not a mistake, and
it's fine in ES modules as long as neither side calls the other *while the
module is loading*, which none of these do.

## What changed vs. a pure copy-paste

Everything is behavior-for-behavior the same **except** one small thing:
the transient-results play/pause button used to reach into a bare
module-level `let playbackTimer` variable that lived next to `renderMain`.
That's now `js/ui/playback.js` (`startPlayback` / `stopPlayback` /
`isPlaying`), so the step file doesn't need a raw import of a mutable
variable from the layout module. Everything else — every formula, every
DOM structure, every class name — is unchanged.

## Adding the "Structural (elastic)" equation later

The equation-picker on step 1 already has a disabled "coming soon" button
for this. When you're ready to build it, the mesh/ and render/ layers
need no changes at all (a mesh is a mesh regardless of physics) — you'd
add a parallel `solver/structural-*.js` set and teach `solve-step.js` /
`material-step.js` to branch on `state.equation` the same way they
currently branch on `state.analysisType`.

## A note on the Thai text

This was rebuilt from a **PDF** of the source, not the original `.html`
file. PDF text extraction is genuinely unreliable for Thai — combining
vowels and tone marks (ั ิ ี ึ ื ่ ้ ๊ ๋ ์) get dropped, duplicated, or
reordered depending on how the PDF's font was embedded, in a way that's
invisible when you *look* at the PDF but corrupts the text underneath it.

I did a careful multi-pass recovery: reconstructed every line from the
PDF's own line-number gutter (`pdftotext -layout`), then found and fixed
the systematic reordering patterns by pattern-matching (e.g. `ร` + `า` +
`้` needing to become `ร` + `้` + `า`, stray spaces inserted around
combining marks, a recurring bug that shifted `ิ`/`ี` one consonant to
the right). I verified the result by running the reconstructed script
through `node --check` until it parsed cleanly, and ran a full functional
smoke test (see below) through every wizard step, both dimensions, both
element orders, both solvers, and both analysis types.

That said — I don't have your original file, so I can't diff against
ground truth. **If you still have the real `.html` file, it's worth a
quick visual diff of the Thai strings**, especially in the longer prose
notes (the ones explaining Gibbs phenomenon, HRZ lumping, and the
quadratic-transient overshoot warning) in:
- `js/ui/steps/mesh-step.js`
- `js/solver/exact-solutions.js`
- `js/ui/steps/solve-step.js`

Everything else — labels, button text, table headers — is short enough
that a glance while using the app will catch anything off. If you paste
me the original `.html`, I can do an exact diff and fix anything I got
wrong in minutes.

## What I actually tested

- **Every file** passes `node --check` (valid JS syntax) individually.
- **Every `import { x } from './y.js'`** resolves to a real `export` in
  the target file (checked programmatically across all 32 files — no
  typos, no stale paths).
- **A full functional smoke test** (no real browser available here, so
  this runs under Node with a minimal hand-written DOM/canvas stub —
  it exercises the actual logic, not pixel output): equation step →
  geometry (rectangle, 1D bar, and a freeform polygon) → material → BC →
  mesh (linear and quadratic) → solve, for both the CG and direct
  solvers, and separately a full transient run with the time-scrubber
  and play/pause controls. All of it ran without errors, and the 1D
  fixed-100/fixed-0 case's solved min/max (0/100) matched the expected
  linear profile.

What I could **not** test here: actual pixel-correct canvas rendering,
mobile layout, and real click-through in an actual browser — there's no
display in this environment. I'd still open it in a real browser and
click through all six steps once before you trust it fully.
