import { rm, frac } from './equation-markup.js';

/**
 * HTML-markup strings for the Wave module's governing equations (same
 * span-markup approach as equation-markup.js — no MathJax).
 */

  export const WAVE_EQ_GENERAL = `${frac('∂²u','∂t²')} ${rm('+')} γ${frac('∂u','∂t')} ${rm('=')} c² ∇²u`;
  export const WAVE_EQ_1D = `${frac('∂²u','∂t²')} ${rm('+')} γ${frac('∂u','∂t')} ${rm('=')} c²${frac('∂²u','∂x²')}`;
  export const WAVE_EQ_2D = `${frac('∂²u','∂t²')} ${rm('+')} γ${frac('∂u','∂t')} ${rm('=')} c²${rm('(')}${frac('∂²u','∂x²')}${rm('+')}${frac('∂²u','∂y²')}${rm(')')}`;
  export const WAVE_EQ_SEMIDISCRETE = `${rm('[')}M${rm(']{')}ü${rm('} + γ[')}M${rm(']{')}u̇${rm('} + [')}K${rm(']{')}u${rm('} = {0}')}`;
