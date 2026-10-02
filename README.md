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

## Package 4 — Structural module (static, linear elastic)

Step 1 now has a working **Structural (elastic)** option next to Heat
Transfer. It is **static only** (no dynamics) and everything is in **SI**
(m, Pa, N). The geometry and mesh steps are shared with the heat module;
the material, supports/loads and results steps have structural versions,
chosen in `ui/layout.js` from `state.equation`. Switching physics keeps
the geometry and mesh but clears any old result.

**What it solves**
- **2D**: plane stress or plane strain (chosen on the material step),
  isotropic linear elastic (E, ν), thickness t (plane stress; plane strain
  is a 1 m-deep slice). Linear = CST (3-node), quadratic = LST (6-node),
  on the existing rectangle / freeform-polygon meshes. 2 DOF per node.
- **1D**: axial bar (E, A), 2-node or 3-node elements. 1 DOF per node.

**Supports and loads (step 4)** — per edge: Free, Fixed (ux = uy = 0),
Roller x (ux = 0), Roller y (uy = 0), Traction (uniform tx, ty, in Pa);
1D ends: Free / Fixed / axial point load. In 2D also point loads (Fx, Fy)
at the shape's corners (rectangle corners, or polygon vertices). Corners
are always mesh nodes, so these can be set before meshing. Force and
stress inputs have a unit selector (N/kN/MN, Pa/kPa/MPa/GPa...) that only
changes how a value is typed; `state` always holds SI.
The step refuses to continue until the supports can stop rigid-body
motion, and the solver double-checks (clear Thai error otherwise).

**Results (step 6)** — contour of |u|, ux, uy, von Mises, σx, σy, τxy on
the **deformed mesh** (adjustable exaggeration, Auto / ×1, dashed
undeformed outline), hover readout, mesh overlay, PNG and CSV export; for
1D a line chart of u(x) or σ(x). Every result also shows an **equilibrium
check** (applied loads + support reactions ≈ 0).

**Reference solutions** (`solver/structural-exact.js`): 1D bar (u linear);
2D uniform-stress patch test (left Roller x + bottom Roller y + uniform
traction on the right/top edge — must match to round-off for any mesh);
and an end-loaded cantilever, compared against Euler–Bernoulli and
Timoshenko tip deflection (a *reference*, not an exact elasticity
solution — the panel says so).

**Solver** — new files; the heat solvers are untouched. K is a **sparse
CSR** matrix (2 DOF/node would make the old dense n×n matrix 4× larger).
Constraints are applied by working on the free DOFs only, which also gives
the reactions as K·u − F. "Conjugate Gradient" is a Jacobi-preconditioned
CG; "Direct" is dense LU on the free DOFs, capped at 2,000 DOF. The 2D
mesh-size cap for structural models is 1,500 elements (heat: 5,000).
Stresses are computed per element, then averaged at shared nodes for the
contour.

**Animation and single-valued fields (added after first use)** — on the
2D structural results, a load-factor slider with Play / Pause / Restart
animates the deformation: the load ramps 0 → 100 % → 0 (cosine ease,
about 3 s per cycle, looping), and both the deformed shape and the
field values are scaled by the load factor — exact for linear elasticity,
where results are proportional to the load — while the colour scale
stays fixed at the full-load range. Play switches the deformed view on
if it was off and continues from the slider position. The 1D bar chart
has no animation (it is a graph, not a shape).
A field whose spread is negligible (under 1e-5 of the largest value of
its kind) is treated as **one value**: the contour is painted a single
flat colour and the colour bar becomes one solid block with one label
and "ค่าคงที่ทั้งแผ่น", instead of stretching round-off over the whole
rainbow (the uniform-tension plate has σx = 50 MPa everywhere). Hover
still reports the value. Files: `js/ui/steps/structural-solve-step.js`,
`js/render/structural-canvas.js`.

**Measured in Node (no browser):**
- Bar, linear and quadratic, CG and Direct: tip displacement PL/(EA) to
  ~1e-16 relative; σ = P/A exact.
- Uniform-stress patch test, plane stress and plane strain, linear and
  quadratic, CG and Direct: max displacement error ≤ 1e-16 m.
- Cantilever (L = 1 m, h = 0.2 m, plane stress, Timoshenko reference
  0.5156 mm): linear 160 el → 0.4225 mm (−18 %, the CST is too stiff in
  bending), linear 1000 el → 0.4961 mm (−3.8 %), quadratic 160 el →
  0.5132 mm (−0.5 %). Good material for a "why higher order" lesson.
- Freeform L-shaped polygon with a corner point load, linear and
  quadratic: corner → node mapping correct, ΣR + ΣF ≈ 1e-12 relative.
- A DOM/canvas-stub run clicking through all six steps for 1D, rectangle
  and polygon × linear/quadratic × CG/Direct, plus the three structural
  presets and the existing heat flow (heat solve and heat presets still
  work). Not tested: real pixels, mobile layout, click-through in an
  actual browser — please open it once and try each step.

**Known limits (by design, this version)**: Roller supports are
axis-aligned only (no roller normal to a slanted polygon edge); no body
force, thermal strain, or non-zero prescribed displacement; one material
per model; small-deformation theory; stress contours are smoothed by
nodal averaging, so values at sharp corners and point loads are
singular and grow as the mesh is refined.

**Files** — new: `js/mesh/structural-info.js`,
`js/solver/structural-assembly.js`, `js/solver/structural-solver.js`,
`js/solver/structural-exact.js`, `js/render/structural-canvas.js`,
`js/render/structural-markup.js`, `js/ui/structural-format.js`,
`js/ui/steps/structural-material-step.js`,
`js/ui/steps/structural-bc-step.js`,
`js/ui/steps/structural-solve-step.js`. Changed: `js/state.js`,
`js/mesh/mesh-service.js` (element cap), `js/ui/layout.js`,
`js/ui/info-panel.js`, `js/ui/steps/equation-step.js`,
`js/ui/steps/geometry-step.js`, `js/ui/steps/mesh-step.js`, `README.md`.

## Polygon mesh quality (post-Package 3)

Polygon meshes used to be built by ear-clipping the outline and then
subdividing every triangle into 4, again and again. That gives no control
over triangle shape — the T-shaped model in the report had a minimum
angle of 8° and a fan of long slivers — and the element count could only
move in steps of ×4 (a "500 element" request gave 384, or 128 for a
trapezoid). It also left `drawOutline()` drawing only the first polygon
edge for these meshes.

**New mesher** (`js/mesh/delaunay-refine.js`, no dependencies):
1. Each polygon edge is split into roughly equal pieces of length ≈ h.
2. A Delaunay triangulation is built (incremental Bowyer–Watson).
3. Ruppert refinement: a boundary segment is split when another node
   falls inside its diametral circle (this is what guarantees every
   boundary segment ends up an edge of the mesh, so no separate
   edge-recovery step is needed); a triangle inside the polygon gets its
   circumcenter inserted when it is too large or too skinny
   (circumradius/shortest-edge > 1.414, ≈ 20.7° minimum angle). If that
   circumcenter would encroach a segment or lie outside the polygon,
   the segment is split instead.
4. Triangles outside the polygon are dropped and interior nodes get eight
   passes of Laplacian smoothing (a move is kept only if no triangle
   flips and the worst angle around that node doesn't get worse).
5. The result is validated (boundary segments present, triangle areas
   sum to the polygon's area). If validation fails, or anything throws,
   `polygon-mesh.js` falls back to the old ear-clip + subdivide method —
   valid, but with the old quality.

**Element count:** "จำนวน Element สูงสุด" is still a cap, but h is now
tuned over a few runs so the mesh lands close under it (e.g. 484 for a
500 request on the T shape) instead of jumping in ×4 steps.

**Mesh step summary** now also shows the minimum angle and the average
per-element minimum angle (an equilateral triangle scores 60°).

Measured on the four template shapes at a 500-element request
(min angle, old → new): L 18.4° → 30.2°, T 8.1° → 30.0°, triangle
58.0° → 31.0°, trapezoid 29.7° → 36.0°. The triangle is the one
case that got *worse*: the old method just cut it into 256 copies
similar to the original (angles 58°/58°/64°, already good), so its
worst angle stayed at 58°, whereas the new mesh uses ~490 elements of
varying shape (average per-element minimum 49.9° vs 58.0°, worst 31°).
So for a shape that is already a nice triangle, the old result was
better in angle terms; the new one reaches the requested element count.
Angles below ~20° that remain are always at sharp corners of the
polygon itself (a 3° corner cannot be meshed with larger angles).

**Rectangle and 1D meshes are unchanged** (they were already regular).

**Files:** new `js/mesh/delaunay-refine.js`, `js/mesh/mesh-quality.js`;
changed `js/mesh/polygon-mesh.js`, `js/render/contour-canvas.js`
(outline fix), `js/ui/steps/mesh-step.js` (quality figures), `README.md`.

**Verification** (beyond the browser click-through): the solver was run
on the new polygon meshes against exact solutions — a rectangle drawn as
a polygon, linear and quadratic, with Dirichlet/Dirichlet, flux/
Dirichlet and internal-heat-source cases — and matched to ~1e-10 for
Dirichlet, flux and the quadratic source case (linear elements with a
source show the expected discretization error, 0.28 °C on a 125 °C
peak). A 300-polygon random fuzz on the 0.05 m snap grid: 289 meshed by
the new mesher, 1 fell back to the old one, none unusable; slowest run
145 ms. At the 5000-element cap a mesh takes about half a second.

## Fixes after hands-on use (post-Package 3)

Two issues found by actually using the app; no new files, two edited
(`js/ui/steps/bc-step.js`, `css/styles.css`).

**BC step layout with many edges.** For a shape with many edges the edge
table runs past one screen, and the shape preview used to sit *below*
the whole table, so it was out of sight exactly while filling in the
rows that need it. Now the shape preview sits directly above the edge
table and stays pinned to the top of the scroll area while you scroll
through the table (hover an edge name to highlight it on the shape, as
before); the applied-BC summary moved to the very end, just before the
Back/Next buttons. Details worth knowing:
- The preview is pinned with `position:sticky`, and it shares a wrapper
  with the table so it un-pins when the table ends. Without that shared
  wrapper a sticky element has nowhere to stop and stays pinned over
  everything that follows — my first attempt did exactly that.
- The pinned canvas is deliberately compact (300×190 in 2D) since while
  it's pinned it covers whatever table rows are scrolling underneath;
  every row is still reachable by scrolling it below the preview.
- On narrow screens (≤880px) the page itself scrolls and the step rail
  is already pinned, so the preview is a normal in-flow block there.

**Fonts in the "สรุปโมเดล" panel.** Labels were the app sans and values
were a monospace stack with no Thai glyphs, so Thai values
(e.g. "สี่เหลี่ยม", "วาดเอง") fell back to a different face. Both sides
now use the app font; values are semibold to keep them distinguishable
from the labels.

## Package 3 — results-page tools

Scope: the "D" (results page) items from the standing proposal, minus
the ones you opted out of (save/load a model as JSON, colorblind-safe
colormap). Two new files, six edited ones — see "Files" at the end.

**Hover to read a value:** move the mouse over the 2D contour plot to
get a floating "T ≈ … °C" readout at that point (interpolated from the
element the cursor is over, same math as the fill itself), and over the
1D results chart to get the nearest node's `x` and `T`. Works on
transient results too and always reports the frame currently shown —
the handler reads the latest drawn data off the canvas on every move
rather than capturing a snapshot, so scrubbing or playing the time
slider never leaves it stale.

**Mesh overlay toggle:** a "แสดงเส้นเมชทับ contour" checkbox on the 2D
results (steady and transient) draws the element boundaries over the
colour fill, to see how the field relates to the mesh.

**Export:** PNG of the current result canvas (exported at the canvas's
real backing-store resolution, so on a high-density display it's sharper
than what's on screen) and CSV of node coordinates + temperature
(`x_m,y_m,T_C`, or `x_m,T_C` in 1D). For transient results both export
the frame currently shown, and the file name carries its time.

**Busy feedback:** "สร้างเมช" and "รันการจำลอง" now switch to a disabled
"กำลัง…" state before starting. To be upfront about what this is: the
computation is still synchronous and still blocks the page while it
runs — this only lets the browser paint the button's new state first
(via a 20 ms `setTimeout`) so it doesn't look like the click did
nothing, and it prevents double-clicks. A genuinely non-blocking solve
would need a Web Worker, which is a bigger change than this pass.

**Small fix found along the way:** the collapse chevron (▸) was being
drawn on *any* `.eq-caption`, including plain-`<div>` captions such as
the exact-solution comparison panel, making them look foldable when they
aren't. The chevron, pointer cursor and hover colour now apply only to a
real `<summary>` (`css/styles.css`).

**Files:**
- New: `js/render/hover-tip.js`, `js/ui/export-helpers.js`
- Changed: `css/styles.css`, `js/render/contour-canvas.js`,
  `js/render/domain-1d-canvas.js`, `js/ui/layout.js`,
  `js/ui/steps/mesh-step.js`, `js/ui/steps/solve-step.js`

Not done, by choice: save/load model as JSON, colorblind-safe colormap.
Also not done: a mesh-convergence comparison (solve at several densities
and plot the error), which was only ever an optional teaching extra.

## Package 2 — flow/UX + accessibility

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
    │   ├── polygon-mesh.js         freeform polygon → mesh: isSimplePolygon() and
    │   │                           the entry point (quality mesher, old one as fallback)
    │   ├── delaunay-refine.js      the quality polygon mesher (Delaunay + Ruppert)
    │   ├── mesh-quality.js         min-angle figures shown in the mesh summary
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
    │   ├── hover-tip.js            the one shared floating tooltip (showTip/hideTip)
    │   ├── colormap.js             the rainbow temperature scale
    │   ├── canvas-transform.js     fitTransform() + triangle list for drawing
    │   ├── contour-canvas.js       2D gradient fill, outline, colorbar, wireframe
    │   │                           overlay, mouse-hover temperature readout
    │   ├── domain-1d-canvas.js     1D domain line, mesh dots, results chart
    │   │                           (+ its hover readout)
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
        ├── export-helpers.js        downloadCanvasPNG(), downloadCSV()
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
- **Package 3's changes were re-tested on top of all of that:** hover
  readouts on the 2D contour, the 1D chart, and across transient frames
  (checked that the same screen position reports different values at
  different time steps, at devicePixelRatio 2 as well); the mesh overlay
  toggle; the busy state on the Solve button; and that the PNG/CSV
  buttons run without errors. One honest caveat: the hover tests
  dispatch mouse events directly at the canvas rather than through
  Puppeteer's simulated pointer, which didn't reliably reach the canvas
  in this headless setup — it's the same handler code a real mouse
  triggers, but I haven't watched it under a physical mouse. Likewise the
  file downloads were checked for "no error thrown", not by opening the
  saved files.

What still hasn't been tested: real click-through on an actual physical
phone/tablet (only viewport emulation), and other browser engines
(only Chromium was available here) — worth a quick manual pass before
you fully trust it.
