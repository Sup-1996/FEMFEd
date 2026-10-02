import { rm, frac, vec } from './equation-markup.js';

/**
 * HTML-markup strings for the Structural module's governing equations
 * (same span-markup approach as equation-markup.js — no MathJax). The
 * body force b is not offered as an input in this version, so the
 * equations are shown with b = 0 called out in the accompanying notes.
 */

  export const STRUCT_EQ_EQUILIBRIUM = `∇ ${rm('·')} ${vec('σ')} ${rm('+')} ${vec('b')} ${rm('=')} 0`;
  export const STRUCT_EQ_PLANE_X = `${frac('∂σ<sub>x</sub>','∂x')} ${rm('+')} ${frac('∂τ<sub>xy</sub>','∂y')} ${rm('+')} b<sub>x</sub> ${rm('=')} 0`;
  export const STRUCT_EQ_PLANE_Y = `${frac('∂τ<sub>xy</sub>','∂x')} ${rm('+')} ${frac('∂σ<sub>y</sub>','∂y')} ${rm('+')} b<sub>y</sub> ${rm('=')} 0`;
  export const STRUCT_EQ_CONSTITUTIVE = `${rm('{')}σ${rm('} = [')}D${rm(']{')}ε${rm('}')}`;
  export const STRUCT_EQ_KINEMATIC = `${rm('{')}ε${rm('} = {')}ε<sub>x</sub> ε<sub>y</sub> γ<sub>xy</sub>${rm('}')}<sup>T</sup> ${rm('= {')}${frac('∂u','∂x')} ${frac('∂v','∂y')} ${frac('∂u','∂y')}${rm('+')}${frac('∂v','∂x')}${rm('}')}<sup>T</sup>`;
  export const STRUCT_EQ_BAR = `${frac('d','dx')}${rm('(')}EA${frac('du','dx')}${rm(')')} ${rm('+')} b ${rm('=')} 0`;
