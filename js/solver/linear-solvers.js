/**
 * Linear system solvers, independent of FEM/mesh concerns - each takes
 * a plain (K, F, n) system and returns an object with T, iters, info.
 *
 * - solveCG: iterative Conjugate Gradient (for symmetric positive
 *   definite systems), with optional warm-start (used by the transient
 *   solver to start each time step from the previous one's answer).
 * - luFactorize / luSolve: dense LU decomposition with partial
 *   pivoting. Split into two steps so the transient solver can
 *   factorize once and reuse the factorization every time step.
 * - solveDirect: convenience wrapper (factorize + solve once).
 * - solveLinearSystem: dispatches to solveDirect or solveCG based on
 *   the `method` argument ('direct' | 'cg') - callers pass
 *   state.solverMethod for this.
 */

  /* ---- Linear solvers ---- */
  export function solveCG(K,F,n,x0){
    const T = new Float64Array(n);
    if(x0) T.set(x0);
    const r = new Float64Array(n);
    // r = F - K*T (accounts for a warm-start initial guess; r=F when T starts at zero)
    for(let i=0;i<n;i++){
      let s=0; const base=i*n;
      for(let j=0;j<n;j++) s+=K[base+j]*T[j];
      r[i]=F[i]-s;
    }
    const p = new Float64Array(r);
    let rsold=0;
    for(let i=0;i<n;i++) rsold += r[i]*r[i];
    const maxIter = Math.min(4000, n*3+50);
    let iters=0;
    const Ap = new Float64Array(n);
    if(Math.sqrt(rsold) >= 1e-9){
      for(iters=0; iters<maxIter; iters++){
        for(let i=0;i<n;i++){
          let s=0; const base=i*n;
          for(let j=0;j<n;j++) s+=K[base+j]*p[j];
          Ap[i]=s;
        }
        let pAp=0;
        for(let i=0;i<n;i++) pAp += p[i]*Ap[i];
        if(Math.abs(pAp) < 1e-18) break;
        const alpha = rsold/pAp;
        for(let i=0;i<n;i++){ T[i]+=alpha*p[i]; r[i]-=alpha*Ap[i]; }
        let rsnew=0;
        for(let i=0;i<n;i++) rsnew += r[i]*r[i];
        if(Math.sqrt(rsnew) < 1e-9) { iters++; break; }
        const beta = rsnew/rsold;
        for(let i=0;i<n;i++) p[i]=r[i]+beta*p[i];
        rsold=rsnew;
      }
    }
    return { T, iters, info:`Conjugate Gradient — ${iters} รอบวนซำ` };
  }

  /* ---- Dense LU factorization with partial pivoting (reusable across many solves of the same matrix,
      which is exactly what a fixed-timestep transient simulation needs) ---- */
  export function luFactorize(Kin, n){
    const A = new Float64Array(n*n);
    A.set(Kin);
    const perm = new Int32Array(n);
    for(let i=0;i<n;i++) perm[i]=i;
    for(let col=0; col<n; col++){
       let maxRow=col, maxVal=Math.abs(A[col*n+col]);
       for(let r=col+1;r<n;r++){
         const v=Math.abs(A[r*n+col]);
         if(v>maxVal){ maxVal=v; maxRow=r; }
       }
       if(maxRow!==col){
         for(let c=0;c<n;c++){ const tmp=A[col*n+c]; A[col*n+c]=A[maxRow*n+c]; A[maxRow*n+c]=tmp; }
         const tmp=perm[col]; perm[col]=perm[maxRow]; perm[maxRow]=tmp;
       }
       const pivot = A[col*n+col];
       if(Math.abs(pivot) < 1e-13) continue;
       for(let r=col+1;r<n;r++){
         const factor = A[r*n+col]/pivot;
         A[r*n+col] = factor; // store the L multiplier in the (now eliminated) lower slot
         if(factor===0) continue;
         for(let c=col+1;c<n;c++) A[r*n+c] -= factor*A[col*n+c];
       }
    }
    return { LU:A, perm, n };
  }

  export function luSolve(fac, bIn){
    const {LU, perm, n} = fac;
    const b = new Float64Array(n);
    for(let i=0;i<n;i++) b[i]=bIn[perm[i]];
    for(let i=1;i<n;i++){ let s=b[i]; for(let j=0;j<i;j++) s-=LU[i*n+j]*b[j]; b[i]=s; }
    const x = new Float64Array(n);
    for(let i=n-1;i>=0;i--){
       let s=b[i];
       for(let j=i+1;j<n;j++) s-=LU[i*n+j]*x[j];
       x[i] = s/LU[i*n+i];
    }
    return x;
  }


  export function solveDirect(K,F,n){
    const fac = luFactorize(K,n);
    const T = luSolve(fac, F);
    return { T, iters:1, info:'Direct solve (LU decomposition with partial pivoting)' };
  }

  export function solveLinearSystem(K,F,n,method){
    if(method==='direct') return solveDirect(K,F,n);
    return solveCG(K,F,n);
  }
