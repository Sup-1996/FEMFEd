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

## Package 2 — flow/UX + accessibility (this round)

Scope: the "C" (workflow) and "E" (accessibility) items from the standing
proposal. No new files — every change below is an edit to a Package 1
file, listed under "Files changed" at the end of this section.

**Removed the "Set" buttons (material step, BC step):** every field
already wrote to `state` on every keystroke; the button only refreshed a
summary line. Values now apply live and the summary updates with them —
one less click, and it was never doing anything else.

**BC step no longer fully re-renders on every edit:** changing a value
now patches just the applied-BC tags and the Next button's enabled
state; changing an edge's *type* (which genuinely needs different
inputs) rebuilds only that one table cell. Previously every keystroke's
Enter/blur — or the Set button — called a full `renderMain()`, which
also reset your scroll position on a step that can run long. `renderMain()`
itself now also preserves scroll position generically (see `layout.js`)
as a second line of defense, while a true step *transition* (`renderAll()`)
still starts at the top as expected.

**Foldable theory blocks:** every `.eq-block` is now a `<details>` you
can collapse — a free accessibility win too, since `<summary>` is
natively keyboard-operable. Core, load-bearing equations (the governing
equation, the per-step main interpolation formula, the assembled system
equation) default **open**; secondary/illustrative material (the shape-
function diagram, the discretized-element aside, the BC type
definitions table) defaults **closed**. See `render/equation-markup.js`'s
`collapsibleBlock()`/`eqBlock()` if you want to change any default.

**Mesh density presets:** หยาบ/กลาง/ละเอียด buttons on the mesh step
fill in the max-elements field with a sensible starting value (scaled
for 1D vs 2D); the exact number field is still there for fine control
or for a convergence-study lesson.

**Polygon draw tool:** a ghost point now follows the mouse (with a
rubber-band line to the last placed point) before you click, plus a
live coordinate readout — and four shape templates (L / T / triangle /
trapezoid) fill in a ready-made point list you can still edit before
closing the shape.

**One-click starter presets:** step 1 now has three buttons that fully
configure a model (geometry, material, BCs), mesh it, solve it, and
jump straight to the results step — a 1D hot/cold bar, a 2D 4-edge-
Dirichlet plate, and a 2D plate with a convective edge. Good for a
quick classroom demo; "ย้อนกลับ" still walks back through every step to
see how it was built.

**Accessibility:** the `eq-btn`/`shape-btn` choice controls and the
step-rail items are now real `<button>` elements (previously `<div>`s
with an onclick, so they weren't keyboard-reachable at all) — Tab now
reaches every control, Enter/Space activates it, and locked steps and
the disabled "Structural" option use the native `disabled` attribute
so assistive tech announces them correctly instead of just being
silently unclickable divs.

**Files changed (12, all edits — no new files):**
`css/styles.css`, `js/render/equation-markup.js`,
`js/render/shape-preview-canvas.js`, `js/ui/dom-helpers.js`,
`js/ui/layout.js`, `js/ui/nav.js`, `js/ui/steps/bc-step.js`,
`js/ui/steps/equation-step.js`, `js/ui/steps/geometry-step.js`,
`js/ui/steps/material-step.js`, `js/ui/steps/mesh-step.js`,
`js/ui/steps/solve-step.js`.

Not in this pass (still open from the original proposal, package 3):
export/save results, hover-to-read-temperature on the contour plot, a
colorblind-safe colormap option, and saving/loading a model as JSON.

## Package 1 — bug fixes + visual refresh (this round)

Scope was deliberately limited to: real bugs, corrupted Thai text, and a
visual/typography/layout refresh — no workflow or content changes yet
(those are packages 2 and 3).

**Bugs fixed:**
- `solve-step.js`'s solver-method `<select>` called `renderMain()` without
  importing it, throwing a `ReferenceError` on every change and leaving
  the solver description stale. Now imported and working.
- `generateMesh()` had no error handling in the mesh step, so a bad
  freeform-polygon mesh would fail silently (the `errDiv` existed but was
  never wired up). It's now wrapped in try/catch and reports the error.
- A handful of Thai strings corrupted during the original PDF-to-code
  recovery (`ไม่มกี ารไหล`, `ทันที่`, `เครืองหมาย`, `พืนฐาน`/`พืนที่`,
  `เชือมจุด`, `รอบวนซำ`) are now corrected.
- A `position:sticky` action bar (tried mid-refresh) turned out to
  overlap scrolled content inside a scroll container — see the CSS
  comment above `.actions-bar` in `styles.css` if you're curious why.
  Fixed by making it a genuine sibling footer instead.

**Visual refresh:**
- Self-hosted IBM Plex Sans Thai (400/500/600/700, Thai+Latin subsets) —
  see `/fonts` (OFL license) — replacing the old Times-New-Roman/system-
  font fallback stack, so Thai and Latin text render consistently on any
  device.
- Deepened color palette for WCAG AA contrast (secondary text was
  ~3.8:1 on white before; now ≥5.6:1 everywhere it's used) while keeping
  the mint/amber identity, which deliberately echoes the app's own
  cool/hot temperature colormap.
- Numbered step-rail nav with a connecting spine (a real sequence, so
  earned rather than decorative), sticky at the top on narrow screens.
- Persistent Back/Next footer (`#actionsBar`, a flex sibling of
  `#mainPanel`, not part of its scroll area) — fixed to the bottom of
  the screen on mobile.
- HiDPI-aware canvas rendering (`js/render/hidpi.js`) so every canvas
  (mesh preview, contour plot, shape-function diagram, etc.) renders
  crisply on high-density displays instead of the browser upscaling a
  blurry low-res bitmap.
- Responsive down to phone widths: the 3-column wizard shell collapses
  to a single scrolling column with a horizontal step strip below ~880px.
- Visible keyboard focus rings, `prefers-reduced-motion` support.

Not in this pass (candidates for package 2 per the standing proposal):
the `eq-btn`/`shape-btn`/`step-item` choice controls are still plain
`<div>`s rather than real, keyboard-operable `<button>`s; the nav's ✓
mark still just means "past this step," not "step's inputs are valid."

## Why this layout

The original file mixed five different concerns in one script tag: mesh
generation, the FEM solver, canvas rendering, DOM-building for six wizard
steps, and the wizard's own state/navigation. Any small change meant
scrolling through all of it to find the one function that mattered, and
it was easy to accidentally touch something unrelated.

The split follows those five concerns:

```
femfed/
├── index.html                  ← thin shell: header + nav/main/footer/aside + <script type="module">
├── css/
│   └── styles.css              ← visual design system (see Package 1 above)
├── fonts/                      ← self-hosted IBM Plex Sans Thai (OFL license)
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
    │   ├── hidpi.js                sizeCanvas() — device-pixel-aware canvas sizing
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

## What changed vs. a pure copy-paste (original split)

Everything is behavior-for-behavior the same **except** one small thing:
the transient-results play/pause button used to reach into a bare
module-level `let playbackTimer` variable that lived next to `renderMain`.
That's now `js/ui/playback.js` (`startPlayback` / `stopPlayback` /
`isPlaying`), so the step file doesn't need a raw import of a mutable
variable from the layout module. Everything else — every formula, every
DOM structure, every class name — is unchanged. (Package 1, above, changes
more of this deliberately — see that section.)

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

A careful multi-pass recovery reconstructed every line from the PDF's own
line-number gutter (`pdftotext -layout`), then found and fixed the
systematic reordering patterns by pattern-matching. Package 1 (above)
caught and fixed several more of these that the original recovery pass
missed, found by a fresh read-through of every string in the app.

That said — if you still have the real `.html` file, a quick visual diff
of the Thai strings is still worth doing, especially in the longer prose
notes (the ones explaining Gibbs phenomenon, HRZ lumping, and the
quadratic-transient overshoot warning) in:
- `js/ui/steps/mesh-step.js`
- `js/solver/exact-solutions.js`
- `js/ui/steps/solve-step.js`

## What's been tested

- **Every file** passes `node --check` (valid JS syntax) individually.
- **Every `import { x } from './y.js'`** resolves to a real `export` in
  the target file.
- **Package 1's changes were tested in an actual headless browser**
  (not just simulated), clicking through: both dimensions (1D/2D), all
  three 2D shapes (rectangle, and a hand-drawn L-shaped polygon), both
  element orders, both solvers, both analysis types (steady + transient,
  including the play/pause/restart scrubber), the 4-edge-Dirichlet
  Fourier-series exact-solution comparison, devicePixelRatio 1 and 2 (to
  check the HiDPI canvas math), and the responsive layout at desktop,
  tablet, and phone widths (375–1400px) — with the browser console
  watched for errors throughout. All of it ran clean.
- **Package 2's changes were re-tested the same way**, on top of all of
  the above: every collapsible block's open/closed default and click-to-
  toggle, all three starter presets (confirmed each one meshes, solves,
  and lands on the results step with a sane answer), the mesh density
  presets, the polygon template buttons and the mouse-hover ghost
  point/coordinate readout, and specifically that editing a BC value no
  longer resets scroll position or rebuilds the whole step (only typing
  or a type-change updates precisely what needs to). Same clean-console
  bar across every scenario.

What still hasn't been tested: real click-through on an actual physical
phone/tablet (only viewport emulation), and other browser engines
(only Chromium was available here) — worth a quick manual pass before
you fully trust it.
