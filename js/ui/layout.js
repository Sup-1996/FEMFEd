import { state, STEPS } from '../state.js';
import { renderNav } from './nav.js';
import { renderInfo } from './info-panel.js';
import { stopPlayback } from './playback.js';
import { hideTip } from '../render/hover-tip.js';
import { renderEquationStep } from './steps/equation-step.js';
import { renderGeometryStep } from './steps/geometry-step.js';
import { renderMaterialStep } from './steps/material-step.js';
import { renderMeshStep } from './steps/mesh-step.js';
import { renderBcStep } from './steps/bc-step.js';
import { renderSolveStep } from './steps/solve-step.js';
import { renderStructuralMaterialStep } from './steps/structural-material-step.js';
import { renderStructuralBcStep } from './steps/structural-bc-step.js';
import { renderStructuralSolveStep } from './steps/structural-solve-step.js';
import { renderWaveMaterialStep } from './steps/wave-material-step.js';
import { renderWaveBcStep } from './steps/wave-bc-step.js';
import { renderWaveSolveStep } from './steps/wave-solve-step.js';

/**
 * Top-level render orchestration.
 *
 * renderAll() redraws all three panels (nav / main / info) - called
 * whenever state.step changes or a step is completed. renderMain()
 * redraws only the center panel by dispatching on the current step's
 * key - called for in-step updates that don't change which step is
 * shown (e.g. editing a field, toggling a dropdown).
 *
 * Every full renderMain() call replaces the #mainPanel DOM, so it also
 * stops any running transient-playback timer first - otherwise a timer
 * left over from the solve step would keep firing against elements
 * that no longer exist.
 *
 * renderMain() preserves main's scroll position across the rebuild (it
 * used to always snap back to the top, which was jarring for the
 * dropdown/value changes on a long step like "bc" that call it). A
 * step *transition* should still start at the top, though, so
 * renderAll() resets scrollTop itself right after calling renderMain().
 */

export function renderAll(){
  renderNav();
  renderMain();
  renderInfo();
  document.getElementById('mainPanel').scrollTop = 0;
}

export function renderMain(){
  stopPlayback();
  hideTip(); // in case the user navigates away mid-hover on a result canvas
  const main = document.getElementById('mainPanel');
  const prevScroll = main.scrollTop;
  main.innerHTML = '';
  document.getElementById('actionsBar').innerHTML = ''; // navButtons() renders here, not into `main` — see dom-helpers.js
  const key = STEPS[state.step].key;
  // geometry + mesh steps are shared by all three physics; material/bc/solve each have their own version
  const physics = state.equation; // 'heat' | 'structure' | 'wave'
  const pick = (heat, structure, wave)=> physics==='structure' ? structure : (physics==='wave' ? wave : heat);
  if(key==='equation') renderEquationStep(main);
  else if(key==='geometry') renderGeometryStep(main);
  else if(key==='material') pick(renderMaterialStep, renderStructuralMaterialStep, renderWaveMaterialStep)(main);
  else if(key==='mesh') renderMeshStep(main); // shared: the mesh step adapts its wording/limits to state.equation
  else if(key==='bc') pick(renderBcStep, renderStructuralBcStep, renderWaveBcStep)(main);
  else if(key==='solve') pick(renderSolveStep, renderStructuralSolveStep, renderWaveSolveStep)(main);
  main.scrollTop = prevScroll;
}
