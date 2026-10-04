import { state } from '../state.js';
import { icResolved, waveDomainSize } from '../mesh/wave-info.js';

/**
 * Initial conditions and eigenmode shapes for the Wave module.
 *
 * Normalised shape s(x,y) (peak value 1):
 *   - 'gaussian': exp(-r^2 / 2 sigma^2) centred at (x0, y0)
 *   - 'mode':     the (m, n) eigenmode of the bar / rectangle for the
 *                 edge conditions currently set (see modalInfo())
 * Initial displacement u(x,y,0) = amp * s ;  initial velocity is 0, or
 * v0 * s when ic.velType === 'shape'.
 *
 * Eigenmodes are separable, one factor per axis. For an axis of length L
 * and index k >= 1, depending on the conditions at its two ends:
 *   fixed-fixed:  sin(k pi s / L)            lambda = k pi / L
 *   free-free:    cos(k pi s / L)            lambda = k pi / L
 *   fixed-free:   sin((k - 1/2) pi s / L)    lambda = (k - 1/2) pi / L
 *   free-fixed:   cos((k - 1/2) pi s / L)    lambda = (k - 1/2) pi / L
 * (the k = 0 constant mode of free-free is left out). Natural frequency
 * of the (m, n) mode: omega = c * sqrt(lambda_x^2 + lambda_y^2).
 */

  function axisMode(loType, hiType, L, k){
    if(loType==='fixed' && hiType==='fixed') return { f:s=>Math.sin(k*Math.PI*s/L), lam:k*Math.PI/L };
    if(loType==='free'  && hiType==='free')  return { f:s=>Math.cos(k*Math.PI*s/L), lam:k*Math.PI/L };
    const q = (k-0.5)*Math.PI/L;
    if(loType==='fixed') return { f:s=>Math.sin(q*s), lam:q };
    return { f:s=>Math.cos(q*s), lam:q };
  }

  /* { phi(x,y), lambda2 } for the current bar/rectangle and (m, n); null for a freeform polygon. */
  export function modalInfo(){
    const ic = icResolved();
    const t = e=> (state.wbc[e] ? state.wbc[e].type : 'fixed');
    const {w,h} = waveDomainSize();
    if(state.dimension==='1d'){
      const ax = axisMode(t('left'), t('right'), w, ic.m);
      return { phi:(x)=>ax.f(x), lambda2:ax.lam*ax.lam, lamX:ax.lam, lamY:0 };
    }
    if(state.shape!=='rectangle') return null;
    const ax = axisMode(t('left'), t('right'), w, ic.m);
    const ay = axisMode(t('bottom'), t('top'), h, ic.n);
    return { phi:(x,y)=>ax.f(x)*ay.f(y), lambda2:ax.lam*ax.lam+ay.lam*ay.lam, lamX:ax.lam, lamY:ay.lam };
  }

  /* Peak-1 shape function of the chosen initial condition: (x,y) -> number. */
  export function shapeFn(){
    const ic = icResolved();
    if(ic.type==='mode'){
      const mi = modalInfo();
      if(mi) return (x,y)=> mi.phi(x,y);
    }
    const s2 = 2*ic.sigma*ic.sigma;
    if(state.dimension==='1d') return (x)=> Math.exp(-((x-ic.x0)**2)/s2);
    return (x,y)=> Math.exp(-(((x-ic.x0)**2)+((y-ic.y0)**2))/s2);
  }

  /* Nodal initial displacement and velocity arrays for a mesh. */
  export function initialFields(nodes){
    const ic = icResolved();
    const s = shapeFn();
    const n = nodes.length;
    const u0 = new Float64Array(n), v0 = new Float64Array(n);
    for(let i=0;i<n;i++){
      const sv = s(nodes[i].x, nodes[i].y);
      u0[i] = ic.amp*sv;
      if(ic.velType==='shape') v0[i] = ic.v0*sv;
    }
    return { u0, v0 };
  }
