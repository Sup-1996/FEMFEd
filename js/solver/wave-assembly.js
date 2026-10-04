import { state } from '../state.js';
import { buildCSR } from './structural-assembly.js';

/**
 * Matrices for the scalar wave equation  u_tt + gamma u_t = c^2 laplace(u)
 * on the shared meshes (1D bar / 2D triangles, linear or quadratic):
 *
 *   K  (stiffness-like)  K_ij = c^2 * integral( grad N_i . grad N_j )
 *   M  (mass-like)       M_ij = integral( N_i N_j )   (consistent), or
 *                        its row-sum-style diagonal (lumped: L/2 for a 2-node
 *                        bar, A/3 for a CST, and the HRZ scaling for the
 *                        3-node bar and the 6-node triangle — same as the
 *                        heat module's mass matrix).
 *
 * Both are returned as sparse CSR matrices (the time loop needs many
 * matrix-vector products). Fixed edges (u = 0) are returned as a `fixed`
 * mask; the solver works on the free DOFs only. Free edges need no
 * action (natural BC du/dn = 0).
 *
 * The 6-node triangle uses a 6-point, degree-4 quadrature rule, which
 * integrates N_i N_j exactly.
 */

  const QP_A = 0.445948490915965, QP_B = 0.091576213509771;
  const QUAD_RULE = [
    [QP_A,QP_A,1-2*QP_A,0.223381589678011],[QP_A,1-2*QP_A,QP_A,0.223381589678011],[1-2*QP_A,QP_A,QP_A,0.223381589678011],
    [QP_B,QP_B,1-2*QP_B,0.109951743655322],[QP_B,1-2*QP_B,QP_B,0.109951743655322],[1-2*QP_B,QP_B,QP_B,0.109951743655322],
  ];

  function t6Matrices(coords){
    const [P1,P2,P3] = coords;
    const b = [P2.y-P3.y, P3.y-P1.y, P1.y-P2.y];
    const cc = [P3.x-P2.x, P1.x-P3.x, P2.x-P1.x];
    const twoA = P1.x*(P2.y-P3.y)+P2.x*(P3.y-P1.y)+P3.x*(P1.y-P2.y);
    const area = Math.abs(twoA)/2;
    const K = new Float64Array(36), M = new Float64Array(36);
    if(area<1e-14) return { K, M, area };
    const dLdx = b.map(v=>v/twoA), dLdy = cc.map(v=>v/twoA);
    for(const [L1,L2,L3,wf] of QUAD_RULE){
      const N = [L1*(2*L1-1), L2*(2*L2-1), L3*(2*L3-1), 4*L1*L2, 4*L2*L3, 4*L3*L1];
      const dNdL = [[4*L1-1,0,0],[0,4*L2-1,0],[0,0,4*L3-1],[4*L2,4*L1,0],[0,4*L3,4*L2],[4*L3,0,4*L1]];
      const dx = [], dy = [];
      for(let i=0;i<6;i++){
        dx.push(dNdL[i][0]*dLdx[0]+dNdL[i][1]*dLdx[1]+dNdL[i][2]*dLdx[2]);
        dy.push(dNdL[i][0]*dLdy[0]+dNdL[i][1]*dLdy[1]+dNdL[i][2]*dLdy[2]);
      }
      const w = wf*area;
      for(let i=0;i<6;i++) for(let j=0;j<6;j++){
        K[i*6+j] += w*(dx[i]*dx[j]+dy[i]*dy[j]);
        M[i*6+j] += w*N[i]*N[j];
      }
    }
    return { K, M, area };
  }

  export function assembleWaveSystem(){
    const mesh = state.mesh;
    const {nodes, elements, boundaries} = mesh;
    const isQuad = mesh.order==='quadratic';
    const is1D = mesh.dim==='1d';
    const n = nodes.length;
    const c2 = state.wave.c*state.wave.c;
    const lumped = state.wave.massType==='lumped';
    const KI=[], KJ=[], KV=[], MI=[], MJ=[], MV=[];
    const Mdiag = new Float64Array(n);
    let hmin = Infinity;

    function addBlock(I,J,V, ids, A){
      const m = ids.length;
      for(let a=0;a<m;a++) for(let b=0;b<m;b++){
        const v = A[a*m+b];
        if(v!==0){ I.push(ids[a]); J.push(ids[b]); V.push(v); }
      }
    }
    function addMass(ids, Mc, lumpedVals){
      if(lumped) ids.forEach((id,k)=>{ Mdiag[id] += lumpedVals[k]; });
      else addBlock(MI,MJ,MV, ids, Mc);
    }

    for(const el of elements){
      if(is1D){
        const a = el[0], b = el[el.length-1];
        const L = Math.abs(nodes[b].x-nodes[a].x);
        if(L<1e-14) continue;
        hmin = Math.min(hmin, L);
        if(!isQuad){
          const s = c2/L;
          addBlock(KI,KJ,KV, el, [s,-s,-s,s]);
          addMass(el, [L/3,L/6,L/6,L/3], [L/2,L/2]);
        } else {
          const s = c2/(3*L), m = L/30;
          addBlock(KI,KJ,KV, el, [7*s,-8*s,s, -8*s,16*s,-8*s, s,-8*s,7*s]);
          addMass(el, [4*m,2*m,-m, 2*m,16*m,2*m, -m,2*m,4*m], [L/6,2*L/3,L/6]);
        }
      } else if(!isQuad){
        const [a,b,c] = el;
        const A0=nodes[a], B0=nodes[b], C0=nodes[c];
        const area = 0.5*Math.abs((B0.x-A0.x)*(C0.y-A0.y) - (C0.x-A0.x)*(B0.y-A0.y));
        if(area<1e-14) continue;
        for(const [p,q] of [[A0,B0],[B0,C0],[C0,A0]]) hmin = Math.min(hmin, Math.hypot(p.x-q.x,p.y-q.y));
        const bc = [B0.y-C0.y, C0.y-A0.y, A0.y-B0.y], cc = [C0.x-B0.x, A0.x-C0.x, B0.x-A0.x];
        const Ke = new Float64Array(9);
        for(let i=0;i<3;i++) for(let j=0;j<3;j++) Ke[i*3+j] = (c2/(4*area))*(bc[i]*bc[j]+cc[i]*cc[j]);
        addBlock(KI,KJ,KV, el, Ke);
        const d = area/12;
        addMass(el, [2*d,d,d, d,2*d,d, d,d,2*d], [area/3,area/3,area/3]);
      } else {
        const coords = el.map(i=>nodes[i]);
        const {K, M, area} = t6Matrices(coords);
        if(area<1e-14) continue;
        for(const [p,q] of [[coords[0],coords[1]],[coords[1],coords[2]],[coords[2],coords[0]]]) hmin = Math.min(hmin, Math.hypot(p.x-q.x,p.y-q.y));
        const Ke = K.map(v=>v*c2);
        addBlock(KI,KJ,KV, el, Ke);
        addMass(el, M, [area/19,area/19,area/19, 16*area/57,16*area/57,16*area/57]);
      }
    }

    if(lumped) for(let i=0;i<n;i++){ MI.push(i); MJ.push(i); MV.push(Mdiag[i]); }

    // Fixed edges: u = 0 on every node of the edge
    const fixed = new Uint8Array(n);
    for(const edgeName of Object.keys(boundaries)){
      const bc = state.wbc[edgeName];
      if(bc && bc.type==='fixed') for(const nd of boundaries[edgeName]) fixed[nd] = 1;
    }
    return { n, K: buildCSR(n,KI,KJ,KV), M: buildCSR(n,MI,MJ,MV), fixed, hmin: Number.isFinite(hmin) ? hmin : 0 };
  }
