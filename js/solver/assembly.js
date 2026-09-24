import { state } from '../state.js';

/**
 * Builds the global [K]{T} = {F} system for the current mesh, material
 * and boundary conditions, and applies Dirichlet (fixed-temperature)
 * elimination.
 *
 * assembleRawSystem() / eliminateDirichlet() are exported too since the
 * transient solver (solver/transient-solver.js) needs the *raw*
 * (pre-elimination) system plus the mass matrix, and applies elimination
 * itself at every time step.
 */

  function quadElementMatrices(coords, k, Q){
    // coords: [P1,P2,P3, Pmid12,Pmid23,Pmid31] for a 6-node (T6) quadratic triangle
    const [P1,P2,P3] = coords;
    const b1=P2.y-P3.y, b2=P3.y-P1.y, b3=P1.y-P2.y;
    const c1=P3.x-P2.x, c2=P1.x-P3.x, c3=P2.x-P1.x;
    const twoA = P1.x*(P2.y-P3.y)+P2.x*(P3.y-P1.y)+P3.x*(P1.y-P2.y);
    const area = Math.abs(twoA)/2;
    const Ke = new Array(36).fill(0);
    const Fe = new Array(6).fill(0);
    if(area < 1e-14) return {Ke, Fe};
    const inv2A = 1/twoA;
    const dLdx = [b1*inv2A, b2*inv2A, b3*inv2A];
    const dLdy = [c1*inv2A, c2*inv2A, c3*inv2A];
    // 3-point quadrature, exact for degree-2 polynomials (barycentric coords)
    const qp = [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]];
    const w = area/3;
    for(const [L1,L2,L3] of qp){
      const N = [ L1*(2*L1-1), L2*(2*L2-1), L3*(2*L3-1), 4*L1*L2, 4*L2*L3, 4*L3*L1 ];
        const dNdL = [
           [4*L1-1, 0, 0], [0, 4*L2-1, 0], [0, 0, 4*L3-1],
           [4*L2, 4*L1, 0], [0, 4*L3, 4*L2], [4*L3, 0, 4*L1],
        ];
        const dNdx = new Array(6), dNdy = new Array(6);
        for(let i=0;i<6;i++){
           dNdx[i] = dNdL[i][0]*dLdx[0] + dNdL[i][1]*dLdx[1] + dNdL[i][2]*dLdx[2];
           dNdy[i] = dNdL[i][0]*dLdy[0] + dNdL[i][1]*dLdy[1] + dNdL[i][2]*dLdy[2];
        }
        for(let i=0;i<6;i++){
           for(let j=0;j<6;j++) Ke[i*6+j] += w*k*(dNdx[i]*dNdx[j] + dNdy[i]*dNdy[j]);
           if(Q!==0) Fe[i] += w*Q*N[i];
        }
      }
      return {Ke, Fe};
  }

  /* ---- Assemble global [K]{T}={F} for the current mesh/material/BCs ---- */
  /* ---- Raw assembly (no Dirichlet elimination applied yet) — shared by steady & transient solves ---- */
  export function assembleRawSystem(){
    const {nodes, elements, boundaries} = state.mesh;
    const isQuadratic = state.mesh.order === 'quadratic';
    const is1D = state.mesh.dim === '1d';
    const n = nodes.length;
    const K = new Float64Array(n*n);
    const F = new Float64Array(n);
    const k = state.material.k;
    const Q = state.material.Q;

      function Kadd(i,j,v){ K[i*n+j]+=v; }

      if(is1D){
        if(!isQuadratic){
          for(const [a,b] of elements){
            const Le = Math.abs(nodes[b].x - nodes[a].x);
            if(Le < 1e-14) continue;
            const ke = k/Le;
            Kadd(a,a, ke); Kadd(a,b,-ke); Kadd(b,a,-ke); Kadd(b,b, ke);
            if(Q!==0){ const load=Q*Le/2; F[a]+=load; F[b]+=load; }
          }
        } else {
          for(const [a,m,b] of elements){
            const Le = Math.abs(nodes[b].x - nodes[a].x);
            if(Le < 1e-14) continue;
            const s = k/(3*Le);
            const KL = [[7*s,-8*s,1*s],[-8*s,16*s,-8*s],[1*s,-8*s,7*s]];
            const ids=[a,m,b];
            for(let i=0;i<3;i++) for(let j=0;j<3;j++) Kadd(ids[i],ids[j],KL[i][j]);
            if(Q!==0){ F[a]+=Q*Le/6; F[m]+=Q*Le*4/6; F[b]+=Q*Le/6; }
          }
        }
        // Point flux/convective BCs at the two ends (positive flux = entering the domain)
        for(const edgeName of Object.keys(boundaries)){
          const bc = state.bc[edgeName];
          if(!bc) continue;
          const node = boundaries[edgeName][0];
          if(bc.type === 'flux' && bc.value !== 0){
            F[node] += bc.value;
          } else if(bc.type === 'convective'){
            Kadd(node, node, bc.h);
            F[node] += bc.h * bc.Tinf;
          }
        }
      } else if(!isQuadratic){
        for(const [a,b,c] of elements){
          const A0=nodes[a], B0=nodes[b], C0=nodes[c];
          const area = 0.5*Math.abs((B0.x-A0.x)*(C0.y-A0.y) - (C0.x-A0.x)*(B0.y-A0.y));
          if(area < 1e-14) continue;
          const bcoef = [B0.y-C0.y, C0.y-A0.y, A0.y-B0.y];
          const ccoef = [C0.x-B0.x, A0.x-C0.x, B0.x-A0.x];
          const ids=[a,b,c];
          for(let i=0;i<3;i++){
        for(let j=0;j<3;j++){
          const val = (k/(4*area)) * (bcoef[i]*bcoef[j] + ccoef[i]*ccoef[j]);
          Kadd(ids[i], ids[j], val);
        }
      }
      if(Q !== 0){
        const load = Q*area/3;
        F[a]+=load; F[b]+=load; F[c]+=load;
      }
    }
  } else {
    for(const ids of elements){
      const coords = ids.map(i=>nodes[i]);
      const {Ke, Fe} = quadElementMatrices(coords, k, Q);
      for(let i=0;i<6;i++){
        for(let j=0;j<6;j++) Kadd(ids[i], ids[j], Ke[i*6+j]);
        F[ids[i]] += Fe[i];
      }
    }
  }

  // Neumann (flux) and Robin/convective boundary contributions — 2D edges only (1D handled above as point terms)
  if(!is1D){
    for(const edgeName of Object.keys(boundaries)){
      const bc = state.bc[edgeName];
      if(!bc || (bc.type !== 'flux' && bc.type !== 'convective')) continue;
      if(bc.type==='flux' && bc.value===0) continue;
      const list = boundaries[edgeName];
      const step = isQuadratic ? 2 : 1;
      for(let s=0;s+step<list.length;s+=step){
        if(isQuadratic){
          const p=list[s], m=list[s+1], q=list[s+2];
          const dx=nodes[q].x-nodes[p].x, dy=nodes[q].y-nodes[p].y;
          const len = Math.sqrt(dx*dx+dy*dy);
          if(bc.type==='flux'){
             F[p] += bc.value*len/6;
             F[m] += bc.value*len*4/6;
             F[q] += bc.value*len/6;
          } else {
             // Robin term: contributes to K (h*Ni*Nj integrated along the edge) and to F (h*Tinf*Ni)
             const sK = bc.h*len/30;
             const KL = [[4*sK,2*sK,-1*sK],[2*sK,16*sK,2*sK],[-1*sK,2*sK,4*sK]];
             const ids=[p,m,q];
             for(let i=0;i<3;i++) for(let j=0;j<3;j++) Kadd(ids[i],ids[j],KL[i][j]);
             F[p] += bc.h*bc.Tinf*len/6;
             F[m] += bc.h*bc.Tinf*len*4/6;
             F[q] += bc.h*bc.Tinf*len/6;
          }
        } else {
          const p=list[s], q=list[s+1];
          const dx=nodes[q].x-nodes[p].x, dy=nodes[q].y-nodes[p].y;
          const len = Math.sqrt(dx*dx+dy*dy);
          if(bc.type==='flux'){
             const contrib = bc.value*len/2;
             F[p]+=contrib; F[q]+=contrib;
          } else {
             const sK = bc.h*len/6;
             Kadd(p,p,2*sK); Kadd(p,q,1*sK); Kadd(q,p,1*sK); Kadd(q,q,2*sK);
             F[p] += bc.h*bc.Tinf*len/2;
             F[q] += bc.h*bc.Tinf*len/2;
          }
        }
      }
    }
  }

  const fixed = new Map();
  let hasConvective = false;
  for(const edgeName of Object.keys(boundaries)){
    const bc = state.bc[edgeName];
    if(!bc) continue;
          if(bc.type === 'fixed'){
            for(const nd of boundaries[edgeName]) fixed.set(nd, bc.value);
          } else if(bc.type === 'convective'){
            hasConvective = true;
          }
      }
      if(fixed.size === 0 && !hasConvective){
        throw new Error('ต้องกำหนดอุณหภูมิคงที่ (Fixed Temperature) หรือเงื่อนไขการพาความร้อน (Convective) อย่างน้อย 1 จุด/ขอบ เพื่อให้ระบบสมการแก้ได้');
      }

      return {K, F, n, fixed};
  }

  /* ---- Apply Dirichlet elimination to a (matrix, vector) pair in place ---- */
  export function eliminateDirichlet(A, b, n, fixed){
    for(const [i, Ti] of fixed.entries()){
      for(let j=0;j<n;j++){
        if(j===i) continue;
        b[j] -= A[j*n+i]*Ti;
        A[j*n+i]=0;
        A[i*n+j]=0;
      }
      b[i]=Ti;
      A[i*n+i]=1;
    }
  }

  export function assembleSystem(){
    const {K, F, n, fixed} = assembleRawSystem();
    eliminateDirichlet(K, F, n, fixed);
    return {K, F, n};
  }
