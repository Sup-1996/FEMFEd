import { state } from '../state.js';
import { assembleSystem } from './assembly.js';
import { solveLinearSystem } from './linear-solvers.js';
import { computeExactSolution } from './exact-solutions.js';

  export function solveHeatConduction(){
    const {K, F, n} = assembleSystem();
    const { T, iters, info } = solveLinearSystem(K, F, n, state.solverMethod);

      let min=Infinity, max=-Infinity;
      for(let i=0;i<n;i++){ if(T[i]<min)min=T[i]; if(T[i]>max)max=T[i]; }

      const exact = computeExactSolution();
      if(exact.available){
        let excludeSet = null;
        if(exact.excludeBoundaryFromError){
          excludeSet = new Set();
          Object.values(state.mesh.boundaries).forEach(list=> list.forEach(i=> excludeSet.add(i)));
        }
        let sumSq=0, maxErr=0, cnt=0;
        for(let i=0;i<n;i++){
          if(excludeSet && excludeSet.has(i)) continue;
          const e = Math.abs(T[i]-exact.T[i]);
          sumSq += e*e; cnt++;
            if(e>maxErr) maxErr=e;
          }
          exact.maxErr = maxErr;
          exact.rmsErr = Math.sqrt(sumSq/Math.max(1,cnt));
          exact.statsExcludeBoundary = !!excludeSet;
      }

      state.results = { T, min, max, iters, info, dof:n, exact, transient:false };
  }
