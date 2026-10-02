import { state } from '../state.js';
import { luFactorize, luSolve } from './linear-solvers.js';
import { assembleStructuralSystem, csrMatVec, planeD, cstB, lstB } from './structural-assembly.js';
import { computeStructuralExact } from './structural-exact.js';

/**
 * Static structural entry point: assembles [K]{u}={F}, solves it for the
 * free DOFs, recovers reactions and stresses, compares against a
 * closed-form solution when one applies, and writes state.results
 * (with results.structural = true).
 *
 * Solvers (state.solverMethod):
 * - 'cg'     Jacobi-preconditioned Conjugate Gradient on the sparse
 *            matrix, free DOFs only (default; handles the larger meshes).
 * - 'direct' dense LU on the free DOFs only — limited to DIRECT_MAX_DOF
 *            free DOFs, because a dense matrix grows with n^2 memory
 *            and n^3 time.
 *
 * Stress recovery: stresses are computed per element (at the element
 * centre for CST, at the six nodes for LST), then averaged at shared
 * nodes to give the smooth nodal field used by the contour plot.
 */

  const DIRECT_MAX_DOF = 2000;

  function solvePCG(A, F, fixed){
    const n = A.n;
    const x = new Float64Array(n);
    const r = new Float64Array(n);
    const diag = new Float64Array(n);
    for(let i=0;i<n;i++){
      for(let q=A.rowPtr[i]; q<A.rowPtr[i+1]; q++) if(A.cols[q]===i) diag[i] = A.vals[q];
      if(fixed[i] || !(diag[i]>0)) diag[i] = 1;
    }
    let bnorm = 0;
    for(let i=0;i<n;i++){ r[i] = fixed[i] ? 0 : F[i]; bnorm += r[i]*r[i]; }
    bnorm = Math.sqrt(bnorm);
    if(bnorm===0) return { x, iters:0, relres:0, trivial:true };
    const z = new Float64Array(n), p = new Float64Array(n), Ap = new Float64Array(n);
    for(let i=0;i<n;i++){ z[i] = r[i]/diag[i]; p[i] = z[i]; }
    let rz = 0; for(let i=0;i<n;i++) rz += r[i]*z[i];
    const maxIter = Math.min(30000, 10*n+200);
    let iters = 0, rnorm = bnorm;
    for(; iters<maxIter; iters++){
      csrMatVec(A, p, Ap);
      for(let i=0;i<n;i++) if(fixed[i]) Ap[i] = 0;
      let pAp = 0; for(let i=0;i<n;i++) pAp += p[i]*Ap[i];
      if(!(pAp>0)) break;
      const alpha = rz/pAp;
      rnorm = 0;
      for(let i=0;i<n;i++){ x[i] += alpha*p[i]; r[i] -= alpha*Ap[i]; rnorm += r[i]*r[i]; }
      rnorm = Math.sqrt(rnorm);
      if(rnorm <= 1e-11*bnorm){ iters++; break; }
      let rzNew = 0;
      for(let i=0;i<n;i++){ z[i] = r[i]/diag[i]; rzNew += r[i]*z[i]; }
      const beta = rzNew/rz; rz = rzNew;
      for(let i=0;i<n;i++) p[i] = z[i] + beta*p[i];
    }
    return { x, iters, relres: rnorm/bnorm, trivial:false };
  }

  function solveDirectReduced(A, F, fixed){
    const n = A.n;
    const freeIdx = [];
    const map = new Int32Array(n).fill(-1);
    for(let i=0;i<n;i++) if(!fixed[i]){ map[i] = freeIdx.length; freeIdx.push(i); }
    const m = freeIdx.length;
    if(m>DIRECT_MAX_DOF) throw new Error(`วิธี Direct รองรับสูงสุด ${DIRECT_MAX_DOF} องศาอิสระ (ตอนนี้มี ${m}) — ลดจำนวนเอลิเมนต์หรือเลือกวิธี Conjugate Gradient`);
    const Ad = new Float64Array(m*m);
    for(let a=0;a<m;a++){
      const i = freeIdx[a];
      for(let q=A.rowPtr[i]; q<A.rowPtr[i+1]; q++){
        const b = map[A.cols[q]];
        if(b>=0) Ad[a*m+b] = A.vals[q];
      }
    }
    const rhs = new Float64Array(m);
    for(let a=0;a<m;a++) rhs[a] = F[freeIdx[a]];
    const sol = luSolve(luFactorize(Ad, m), rhs);
    const x = new Float64Array(n);
    for(let a=0;a<m;a++) x[freeIdx[a]] = sol[a];
    return { x, iters:1, relres:0, trivial:false };
  }

  function vonMises(sx, sy, txy, mode, nu){
    if(mode==='plane_strain'){
      const sz = nu*(sx+sy);
      return Math.sqrt(0.5*((sx-sy)**2 + (sy-sz)**2 + (sz-sx)**2) + 3*txy*txy);
    }
    return Math.sqrt(sx*sx - sx*sy + sy*sy + 3*txy*txy);
  }

  function recoverStresses2D(U){
    const {nodes, elements} = state.mesh;
    const isQuad = state.mesh.order==='quadratic';
    const {E, nu, mode} = state.structural;
    const D = planeD(E, nu, mode);
    const nn = nodes.length;
    const sx = new Float64Array(nn), sy = new Float64Array(nn), txy = new Float64Array(nn);
    const cnt = new Float64Array(nn);
    // natural coordinates of the six T6 nodes
    const nodeL = [[1,0,0],[0,1,0],[0,0,1],[.5,.5,0],[0,.5,.5],[.5,0,.5]];
    function stressAt(B, m, ue){
      const eps = [0,0,0];
      for(let r=0;r<3;r++){ let s=0; for(let j=0;j<m;j++) s += B[r*m+j]*ue[j]; eps[r]=s; }
      return [
        D[0][0]*eps[0]+D[0][1]*eps[1]+D[0][2]*eps[2],
        D[1][0]*eps[0]+D[1][1]*eps[1]+D[1][2]*eps[2],
        D[2][0]*eps[0]+D[2][1]*eps[1]+D[2][2]*eps[2],
      ];
    }
    for(const ids of elements){
      const coords = ids.map(i=>nodes[i]);
      const ue = [];
      ids.forEach(i=>{ ue.push(U[2*i], U[2*i+1]); });
      if(!isQuad){
        const {B, area} = cstB(coords);
        if(area<1e-14) continue;
        const s = stressAt(B, 6, ue);
        ids.forEach(i=>{ sx[i]+=s[0]; sy[i]+=s[1]; txy[i]+=s[2]; cnt[i]++; });
      } else {
        ids.forEach((i,k)=>{
          const {B} = lstB(coords, nodeL[k]);
          const s = stressAt(B, 12, ue);
          sx[i]+=s[0]; sy[i]+=s[1]; txy[i]+=s[2]; cnt[i]++;
        });
      }
    }
    const vm = new Float64Array(nn);
    for(let i=0;i<nn;i++){
      if(cnt[i]>0){ sx[i]/=cnt[i]; sy[i]/=cnt[i]; txy[i]/=cnt[i]; }
      vm[i] = vonMises(sx[i], sy[i], txy[i], mode, nu);
    }
    return { sx, sy, txy, vm };
  }

  /* 1D: axial stress at the two end nodes of each element (sigma = E du/dx). */
  function recoverStresses1D(U){
    const {nodes, elements} = state.mesh;
    const isQuad = state.mesh.order==='quadratic';
    const E = state.structural.E;
    return elements.map(el=>{
      if(!isQuad){
        const [a,b] = el;
        const L = nodes[b].x-nodes[a].x;
        const s = E*(U[b]-U[a])/L;
        return { xa:nodes[a].x, xb:nodes[b].x, sa:s, sb:s };
      }
      const [a,m,b] = el;
      const L = nodes[b].x-nodes[a].x;
      const dudx = (xi)=> ((4*xi-3)*U[a] + (4-8*xi)*U[m] + (4*xi-1)*U[b])/L;
      return { xa:nodes[a].x, xb:nodes[b].x, sa:E*dudx(0), sb:E*dudx(1) };
    });
  }

  export function solveStructural(){
    const mesh = state.mesh;
    const {E, nu, mode} = state.structural;
    if(!(E>0)) throw new Error('ค่า E ต้องมากกว่า 0');
    if(state.dimension==='2d' && !(nu>=0 && nu<0.5)) throw new Error('อัตราส่วนปัวซอง ν ต้องอยู่ในช่วง 0 ≤ ν < 0.5');

    const sys = assembleStructuralSystem();
    const {n, ndpn, K, F, fixed, is1D} = sys;

    const sol = state.solverMethod==='direct' ? solveDirectReduced(K, F, fixed) : solvePCG(K, F, fixed);
    if(!sol.trivial && state.solverMethod!=='direct' && !(sol.relres < 1e-6)){
      throw new Error('ระบบสมการไม่ลู่เข้า — มักเกิดจากการยึดรั้งไม่เพียงพอ (โครงสร้างยังหมุนหรือเลื่อนได้) กรุณาตรวจสอบ supports ในขั้นตอนก่อนหน้า');
    }
    const U = sol.x;

    // Reactions at constrained DOFs: R = K u - F; equilibrium check on the sums.
    const KU = new Float64Array(n); csrMatVec(K, U, KU);
    const R = [0,0], Fsum = [0,0];
    for(let i=0;i<n;i++){
      Fsum[i%ndpn] += F[i];
      if(fixed[i]) R[i%ndpn] += KU[i]-F[i];
    }
    const equilibrium = { Rx:R[0], Ry:ndpn===2?R[1]:0, Fx:Fsum[0], Fy:ndpn===2?Fsum[1]:0 };
    const scaleF = Math.max(Math.abs(Fsum[0]), Math.abs(Fsum[1]||0), 1e-300);
    equilibrium.residual = Math.hypot(R[0]+Fsum[0], (ndpn===2?R[1]+Fsum[1]:0));
    equilibrium.relResidual = equilibrium.residual/scaleF;

    const method = state.solverMethod==='direct'
      ? 'Direct (LU decomposition) บน DOF อิสระเท่านั้น'
      : `Conjugate Gradient (Jacobi preconditioner, ${sol.iters} รอบ, residual สัมพัทธ์ ${sol.relres.toExponential(1)})`;
    const info = `Static structural — ${is1D ? '1D bar' : (mode==='plane_stress' ? 'Plane stress' : 'Plane strain')}, ${n} DOF (${fixed.reduce((a,b)=>a+b,0)} DOF ถูกยึด) — แก้ด้วย ${method}`;

    const res = { structural:true, dim: is1D?'1d':'2d', dof:n, U, iters: sol.iters, info, equilibrium };

    if(is1D){
      const nn = mesh.nodes.length;
      res.ux = Float64Array.from(U);
      res.uy = new Float64Array(nn);
      res.elemStress = recoverStresses1D(U);
      let maxU = 0; for(let i=0;i<nn;i++) maxU = Math.max(maxU, Math.abs(U[i]));
      let maxS = 0; for(const e of res.elemStress) maxS = Math.max(maxS, Math.abs(e.sa), Math.abs(e.sb));
      res.maxU = maxU; res.maxStress = maxS;
    } else {
      const nn = mesh.nodes.length;
      const ux = new Float64Array(nn), uy = new Float64Array(nn), umag = new Float64Array(nn);
      for(let i=0;i<nn;i++){ ux[i]=U[2*i]; uy[i]=U[2*i+1]; umag[i]=Math.hypot(ux[i],uy[i]); }
      const st = recoverStresses2D(U);
      res.ux = ux; res.uy = uy;
      res.fields = { umag, ux, uy, vm:st.vm, sx:st.sx, sy:st.sy, txy:st.txy };
      res.ranges = {};
      for(const [k,arr] of Object.entries(res.fields)){
        let mn=Infinity, mx=-Infinity;
        for(const v of arr){ if(v<mn) mn=v; if(v>mx) mx=v; }
        res.ranges[k] = {min:mn, max:mx};
      }
      res.maxU = res.ranges.umag.max;
      res.maxStress = res.ranges.vm.max;
    }

    res.exact = computeStructuralExact(res);
    state.results = res;
  }
