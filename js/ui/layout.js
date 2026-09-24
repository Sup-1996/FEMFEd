import { state, STEPS } from '../state.js';
import { renderNav } from './nav.js';
import { renderInfo } from './info-panel.js';
import { stopPlayback } from './playback.js';
import { renderEquationStep } from './steps/equation-step.js';
import { renderGeometryStep } from './steps/geometry-step.js';
import { renderMaterialStep } from './steps/material-step.js';
import { renderMeshStep } from './steps/mesh-step.js';
import { renderBcStep } from './steps/bc-step.js';
import { renderSolveStep } from './steps/solve-step.js';

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
 */

export function renderAll(){
  renderNav();
  renderMain();
  renderInfo();
}

export function renderMain(){
  stopPlayback();
  const main = document.getElementById('mainPanel');
  main.innerHTML = '';
  const key = STEPS[state.step].key;
  if(key==='equation') renderEquationStep(main);
  else if(key==='geometry') renderGeometryStep(main);
  else if(key==='material') renderMaterialStep(main);
  else if(key==='mesh') renderMeshStep(main);
  else if(key==='bc') renderBcStep(main);
  else if(key==='solve') renderSolveStep(main);
}
