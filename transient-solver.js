import { state } from '../state.js';
import { assembleRawSystem } from './assembly.js';
import { assembleMassMatrix } from './mass-matrix.js';
import { luFactorize, luSolve, solveCG } from './linear-solvers.js';

  export function solveTransientHeatConduction(){
    const {K, F, n, fixed} = assembleRawSystem();
    const M = assembleMassMatrix();

      const totalTime = state.transient.totalTime;
      const steps = Math.max(1, Math.min(300, Math.round(state.transient.steps)));
      const dt = totalTime/steps;

      const Araw = new Float64Array(n*n);
      for(let idx=0; idx<n*n; idx++) Araw[idx] = M[idx] + dt*K[idx];

      const dirichletCorrection = new Float64Array(n);
      for(const [i, Ti] of fixed.entries()){
        for(let j=0;j<n;j++) dirichletCorrection[j] += Araw[j*n+i]*Ti;
      }

      const Abc = new Float64Array(Araw);
      for(const [i] of fixed.entries()){
        for(let j=0;j<n;j++){
          if(j===i) continue;
          Abc[j*n+i]=0;
          Abc[i*n+j]=0;
        }
        Abc[i*n+i]=1;
      }

      let T = new Float64Array(n).fill(state.transient.T0);
      for(const [i,Ti] of fixed.entries()) T[i]=Ti;

      const timeSeries = [{t:0, T:T.slice()}];

      const useDirect = state.solverMethod==='direct';
      const factorization = useDirect ? luFactorize(Abc, n) : null;

      for(let step=1; step<=steps; step++){
        const rawB = new Float64Array(n);
        for(let i=0;i<n;i++){
          let s=0; const base=i*n;
          for(let j=0;j<n;j++) s += M[base+j]*T[j];
          rawB[i] = s + dt*F[i];
        }
        const bBc = new Float64Array(n);
        for(let j=0;j<n;j++) bBc[j] = rawB[j] - dirichletCorrection[j];
        for(const [i,Ti] of fixed.entries()) bBc[i]=Ti;

          const Tnext = useDirect ? luSolve(factorization, bBc) : solveCG(Abc, bBc, n, T).T;
          T = Tnext;
          timeSeries.push({t: step*dt, T: T.slice()});
      }

      let min=Infinity, max=-Infinity;
      for(const snap of timeSeries) for(const v of snap.T){ if(v<min) min=v; if(v>max) max=v; }

      const methodLabel = useDirect ? 'Direct (LU decomposition, factorized once and reused every step)' : 'Conjugate Gradient (warm-started from the previous time step)';
      state.results = {
        transient: true,
        timeSeries, min, max, dt, steps, dof:n,
        info: `Backward Euler time-stepping — ${steps} steps, Δt = ${dt.toFixed(4)} s — solved with ${methodLabel}`,
         exact: { available:false, note:'ยังไม่รองรับการเปรียบเทียบ exact solution สำหรับการวิเคราะห์แบบ transient ในเวอร์ชันนี้ (รองรับเฉพาะ steady-state)' },
      };
  }
