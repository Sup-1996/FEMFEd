import { state } from '../state.js';
import { luFactorize, luSolve } from './linear-solvers.js';
import { csrMatVec } from './structural-assembly.js';
import { assembleWaveSystem } from './wave-assembly.js';
import { initialFields } from './wave-ic.js';
import { computeWaveExact } from './wave-exact.js';

/**
 * Time-domain solver for the scalar wave equation (see wave-assembly.js):
 *
 *     [M]{a} + gamma [M]{v} + [K]{u} = {0}
 *
 * advanced with the Newmark-beta method, average-acceleration variant
 * (beta = 1/4, gamma_N = 1/2): unconditionally stable and second-order
 * accurate, and it conserves energy exactly for the undamped
 * semi-discrete system (so any drift in the energy plot comes from the
 * linear solver tolerance, not from the time integration).
 *
 * Displacement form: with dt constant, the effective matrix
 *     K_eff = K + (gamma_N gamma / (beta dt)) M + M / (beta dt^2)
 * never changes, so it is built once (CG: reused as-is; Direct: LU
 * factorised once) and only the right-hand side changes per step.
 *
 * Constrained DOFs (fixed edges, u = 0) are excluded by a mask, as in the
 * structural solver. Every step's nodal field is stored (Float32) for
 * the animation; energies and the error against the reference solution are
 * accumulated in full precision during the run.
 */

  const DIRECT_MAX_DOF = 1000;
  const BETA = 0.25, GAMMA_N = 0.5;

  function axpyCSR(A, B, ca, cb){ // returns CSR of ca*A + cb*B on the same sparsity pattern union (via dense row merge)
    const n = A.n, rowPtr = new Int32Array(n+1), cols = [], vals = [];
    for(let i=0;i<n;i++){
      rowPtr[i] = cols.length;
      const row = new Map();
      for(let q=A.rowPtr[i]; q<A.rowPtr[i+1]; q++) row.set(A.cols[q], (row.get(A.cols[q])||0) + ca*A.vals[q]);
      for(let q=B.rowPtr[i]; q<B.rowPtr[i+1]; q++) row.set(B.cols[q], (row.get(B.cols[q])||0) + cb*B.vals[q]);
      for(const j of [...row.keys()].sort((a,b)=>a-b)){ cols.push(j); vals.push(row.get(j)); }
    }
    rowPtr[n] = cols.length;
    return { n, rowPtr, cols:Int32Array.from(cols), vals:Float64Array.from(vals) };
  }

  /* Jacobi-preconditioned CG on the free DOFs, warm-started from x0. */
  function pcg(A, rhs, fixed, x0, diag, tol){
    const n = A.n;
    const x = new Float64Array(n), r = new Float64Array(n), z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
    let bnorm = 0;
    for(let i=0;i<n;i++){ if(!fixed[i]){ x[i] = x0 ? x0[i] : 0; bnorm += rhs[i]*rhs[i]; } }
    bnorm = Math.sqrt(bnorm);
    if(bnorm===0) return { x:new Float64Array(n), iters:0 };
    csrMatVec(A, x, Ap);
    let rnorm = 0;
    for(let i=0;i<n;i++){ r[i] = fixed[i] ? 0 : rhs[i]-Ap[i]; rnorm += r[i]*r[i]; }
    rnorm = Math.sqrt(rnorm);
    if(rnorm <= tol*bnorm) return { x, iters:0 };
    let rz = 0;
    for(let i=0;i<n;i++){ z[i] = r[i]/diag[i]; p[i] = z[i]; rz += r[i]*z[i]; }
    const maxIter = Math.min(20000, 5*n+200);
    let iters = 0;
    for(; iters<maxIter; iters++){
      csrMatVec(A, p, Ap);
      let pAp = 0;
      for(let i=0;i<n;i++){ if(fixed[i]) Ap[i] = 0; pAp += p[i]*Ap[i]; }
      if(!(pAp>0)) break;
      const alpha = rz/pAp;
      rnorm = 0;
      for(let i=0;i<n;i++){ x[i] += alpha*p[i]; r[i] -= alpha*Ap[i]; rnorm += r[i]*r[i]; }
      rnorm = Math.sqrt(rnorm);
      if(rnorm <= tol*bnorm){ iters++; break; }
      let rzNew = 0;
      for(let i=0;i<n;i++){ z[i] = r[i]/diag[i]; rzNew += r[i]*z[i]; }
      const beta = rzNew/rz; rz = rzNew;
      for(let i=0;i<n;i++) p[i] = z[i] + beta*p[i];
    }
    return { x, iters, relres: rnorm/bnorm };
  }

  function csrDiag(A, fixed){
    const d = new Float64Array(A.n);
    for(let i=0;i<A.n;i++){
      for(let q=A.rowPtr[i]; q<A.rowPtr[i+1]; q++) if(A.cols[q]===i) d[i] = A.vals[q];
      if(fixed[i] || !(d[i]>0)) d[i] = 1;
    }
    return d;
  }

  export function solveWave(){
    const mesh = state.mesh;
    const { c, damping:gam } = state.wave;
    if(!(c>0)) throw new Error('ความเร็วคลื่น c ต้องมากกว่า 0');
    if(!(gam>=0)) throw new Error('ค่าการหน่วง γ ต้องไม่ติดลบ');
    const totalTime = state.wave.transient.totalTime;
    const steps = Math.max(1, Math.min(2000, Math.round(state.wave.transient.steps)));
    if(!(totalTime>0)) throw new Error('เวลาสิ้นสุดต้องมากกว่า 0');
    const dt = totalTime/steps;

    const { n, K, M, fixed, hmin } = assembleWaveSystem();
    const nodes = mesh.nodes;
    const useDirect = state.solverMethod==='direct';

    // Effective matrix (constant in time)
    const a0c = 1/(BETA*dt*dt), a1c = GAMMA_N*gam/(BETA*dt);
    const Keff = axpyCSR(K, M, 1, a0c + a1c);
    const diag = csrDiag(Keff, fixed);
    let fac = null, freeIdx = null;
    if(useDirect){
      freeIdx = []; const map = new Int32Array(n).fill(-1);
      for(let i=0;i<n;i++) if(!fixed[i]){ map[i] = freeIdx.length; freeIdx.push(i); }
      const m = freeIdx.length;
      if(m>DIRECT_MAX_DOF) throw new Error(`วิธี Direct รองรับสูงสุด ${DIRECT_MAX_DOF} องศาอิสระ (ตอนนี้มี ${m}) — ลดจำนวนเอลิเมนต์หรือเลือกวิธี Conjugate Gradient`);
      const Ad = new Float64Array(m*m);
      for(let a=0;a<m;a++){
        const i = freeIdx[a];
        for(let q=Keff.rowPtr[i]; q<Keff.rowPtr[i+1]; q++){ const b = map[Keff.cols[q]]; if(b>=0) Ad[a*m+b] = Keff.vals[q]; }
      }
      fac = luFactorize(Ad, m);
    }
    function solveKeff(rhs, guess){
      if(!useDirect) return pcg(Keff, rhs, fixed, guess, diag, 1e-12);
      const m = freeIdx.length, r = new Float64Array(m);
      for(let a=0;a<m;a++) r[a] = rhs[freeIdx[a]];
      const s = luSolve(fac, r), x = new Float64Array(n);
      for(let a=0;a<m;a++) x[freeIdx[a]] = s[a];
      return { x, iters:1 };
    }

    // Initial state (fixed nodes start at rest at u = 0)
    const { u0, v0 } = initialFields(nodes);
    let u = new Float64Array(n), v = new Float64Array(n), a = new Float64Array(n);
    for(let i=0;i<n;i++) if(!fixed[i]){ u[i] = u0[i]; v[i] = v0[i]; }
    // a0 = M^-1 ( -gamma M v0 - K u0 )  ->  solve M a0 = -K u0, then subtract gamma v0
    const Ku = new Float64Array(n); csrMatVec(K, u, Ku);
    const rhs0 = new Float64Array(n); for(let i=0;i<n;i++) rhs0[i] = -Ku[i];
    {
      const sol = pcg(M, rhs0, fixed, null, csrDiag(M, fixed), 1e-13);
      for(let i=0;i<n;i++) a[i] = fixed[i] ? 0 : sol.x[i] - gam*v[i];
    }

    const Mv = new Float64Array(n), Kuv = new Float64Array(n), w = new Float64Array(n);
    function energies(){
      csrMatVec(M, v, Mv); csrMatVec(K, u, Kuv);
      let ke=0, pe=0; for(let i=0;i<n;i++){ ke += v[i]*Mv[i]; pe += u[i]*Kuv[i]; }
      return { ke:0.5*ke, pe:0.5*pe };
    }

    const exact = computeWaveExact(nodes);
    const snapshots = [], kinetic = new Float64Array(steps+1), potential = new Float64Array(steps+1), errMax = new Float64Array(steps+1);
    let maxAbs = 0, totalIters = 0;
    function record(k){
      snapshots.push(Float32Array.from(u));
      for(let i=0;i<n;i++) if(Math.abs(u[i])>maxAbs) maxAbs = Math.abs(u[i]);
      const e = energies(); kinetic[k] = e.ke; potential[k] = e.pe;
      if(exact.available){
        const ue = exact.at(k*dt); let m = 0;
        for(let i=0;i<n;i++){ const d = Math.abs(u[i]-ue[i]); if(d>m) m = d; }
        errMax[k] = m;
      }
    }
    record(0);

    const cu = a0c + gam*GAMMA_N/(BETA*dt);                 // coefficient of u_n inside M(...)
    const cv = 1/(BETA*dt) + gam*(GAMMA_N/BETA-1);          // coefficient of v_n
    const ca = (1/(2*BETA)-1) + gam*dt*(GAMMA_N/(2*BETA)-1); // coefficient of a_n
    for(let k=1;k<=steps;k++){
      for(let i=0;i<n;i++) w[i] = cu*u[i] + cv*v[i] + ca*a[i];
      const rhs = new Float64Array(n); csrMatVec(M, w, rhs);
      const guess = new Float64Array(n); for(let i=0;i<n;i++) guess[i] = u[i] + dt*v[i];
      const sol = solveKeff(rhs, guess); totalIters += sol.iters;
      const un = sol.x;
      for(let i=0;i<n;i++){
        if(fixed[i]){ un[i] = 0; continue; }
        const an = (un[i]-u[i])/(BETA*dt*dt) - v[i]/(BETA*dt) - (1/(2*BETA)-1)*a[i];
        const vn = v[i] + dt*((1-GAMMA_N)*a[i] + GAMMA_N*an);
        a[i] = an; v[i] = vn;
      }
      u = un;
      record(k);
    }

    const total = new Float64Array(steps+1); for(let k=0;k<=steps;k++) total[k] = kinetic[k]+potential[k];
    let eMax = 0; for(let k=0;k<=steps;k++) if(total[k]>eMax) eMax = total[k];
    let exactMaxErr = 0; if(exact.available) for(let k=0;k<=steps;k++) if(errMax[k]>exactMaxErr) exactMaxErr = errMax[k];
    if(exact.available){ exact.maxErr = exactMaxErr; exact.errSeries = errMax; exact.maxRef = maxAbs; }

    const is1D = mesh.dim==='1d';
    const massLabel = state.wave.massType==='lumped' ? 'lumped mass' : 'consistent mass';
    const method = useDirect ? 'Direct (LU, factorized once and reused every step)' : `Conjugate Gradient (Jacobi, avg ${(totalIters/steps).toFixed(1)} iterations/step, warm-started)`;
    state.results = {
      wave:true, dim: is1D?'1d':'2d', dof:n, steps, dt, totalTime,
      snapshots, kinetic, potential, total, energyMax:eMax, maxAbs,
      courant: hmin>0 ? c*dt/hmin : 0, hmin,
      exact,
      info:`Wave equation — Newmark-β (β = 1/4, γ = 1/2, average acceleration) ${steps} steps, Δt = ${dt.toPrecision(4)} s, ${massLabel}, ${n} DOF — solved with ${method}`,
    };
  }
