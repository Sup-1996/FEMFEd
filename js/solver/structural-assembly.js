import { state } from '../state.js';
import { cornerNodeIds } from '../mesh/structural-info.js';

/**
 * Global stiffness assembly for the Structural (static, linear elastic)
 * module. Everything is SI: metres, Pa, N.
 *
 * - 1D: axial bar, 1 DOF per node (u). Linear (2-node) or quadratic
 *   (3-node, ordered [end, mid, end]) elements, stiffness EA/L-based.
 * - 2D: plane stress or plane strain, 2 DOF per node (u, v) numbered
 *   [2i, 2i+1]. Linear (CST, 3-node) or quadratic (LST, 6-node)
 *   triangles, Ke = integral of B^T D B t dA.
 *
 * Unlike the heat solver's dense n x n matrices, K is assembled as a
 * sparse CSR matrix: with 2 DOF per node the dense system would be
 * four times larger for the same mesh. Dirichlet (zero-displacement)
 * constraints are NOT eliminated by editing K; instead a `fixed` mask is
 * returned and the solver works on the free DOFs only (see
 * structural-solver.js). That also lets reactions be recovered afterwards
 * as (K u - F) at the constrained DOFs.
 *
 * Exports: assembleStructuralSystem(), planeD(), effectiveThickness(),
 * lstB() (shared with the stress recovery in structural-solver.js).
 */

  export function effectiveThickness(){
    // Plane strain describes a unit-depth slice of a very long body.
    return state.structural.mode==='plane_strain' ? 1 : state.structural.thickness;
  }

  /* 3x3 constitutive matrix D (sigma = D * eps, with engineering shear strain). */
  export function planeD(E, nu, mode){
    if(mode==='plane_strain'){
      const c = E/((1+nu)*(1-2*nu));
      return [[c*(1-nu), c*nu, 0],[c*nu, c*(1-nu), 0],[0, 0, c*(1-2*nu)/2]];
    }
    const c = E/(1-nu*nu);
    return [[c, c*nu, 0],[c*nu, c, 0],[0, 0, c*(1-nu)/2]];
  }

  /* B matrix (3 x 12, row-major, DOF order [u1,v1,...,u6,v6]) of a 6-node
     triangle at barycentric point L=[L1,L2,L3]; also returns |area|. */
  export function lstB(coords, L){
    const [P1,P2,P3] = coords;
    const b = [P2.y-P3.y, P3.y-P1.y, P1.y-P2.y];
    const c = [P3.x-P2.x, P1.x-P3.x, P2.x-P1.x];
    const twoA = P1.x*(P2.y-P3.y)+P2.x*(P3.y-P1.y)+P3.x*(P1.y-P2.y);
    const [L1,L2,L3] = L;
    const dNdL = [
      [4*L1-1,0,0],[0,4*L2-1,0],[0,0,4*L3-1],
      [4*L2,4*L1,0],[0,4*L3,4*L2],[4*L3,0,4*L1],
    ];
    const B = new Float64Array(36);
    for(let i=0;i<6;i++){
      const dx = (dNdL[i][0]*b[0]+dNdL[i][1]*b[1]+dNdL[i][2]*b[2])/twoA;
      const dy = (dNdL[i][0]*c[0]+dNdL[i][1]*c[1]+dNdL[i][2]*c[2])/twoA;
      B[0*12+2*i] = dx;
      B[1*12+2*i+1] = dy;
      B[2*12+2*i] = dy; B[2*12+2*i+1] = dx;
    }
    return { B, area: Math.abs(twoA)/2, twoA };
  }

  /* B matrix (3 x 6) of a 3-node triangle (constant strain). */
  export function cstB(coords){
    const [P1,P2,P3] = coords;
    const b = [P2.y-P3.y, P3.y-P1.y, P1.y-P2.y];
    const c = [P3.x-P2.x, P1.x-P3.x, P2.x-P1.x];
    const twoA = P1.x*(P2.y-P3.y)+P2.x*(P3.y-P1.y)+P3.x*(P1.y-P2.y);
    const B = new Float64Array(18);
    for(let i=0;i<3;i++){
      B[0*6+2*i] = b[i]/twoA;
      B[1*6+2*i+1] = c[i]/twoA;
      B[2*6+2*i] = c[i]/twoA; B[2*6+2*i+1] = b[i]/twoA;
    }
    return { B, area: Math.abs(twoA)/2, twoA };
  }

  /* Ke += w * B^T D B for a (3 x m) B. */
  function addBtDB(Ke, B, m, D, w){
    const DB = new Float64Array(3*m);
    for(let r=0;r<3;r++) for(let j=0;j<m;j++){
      DB[r*m+j] = D[r][0]*B[0*m+j] + D[r][1]*B[1*m+j] + D[r][2]*B[2*m+j];
    }
    for(let i=0;i<m;i++) for(let j=0;j<m;j++){
      Ke[i*m+j] += w*(B[0*m+i]*DB[0*m+j] + B[1*m+i]*DB[1*m+j] + B[2*m+i]*DB[2*m+j]);
    }
  }

  export function buildCSR(n, I, J, V){
    const m = I.length;
    const start = new Int32Array(n+1);
    for(let k=0;k<m;k++) start[I[k]+1]++;
    for(let i=0;i<n;i++) start[i+1] += start[i];
    const pos = start.slice(0,n);
    const colTmp = new Int32Array(m), valTmp = new Float64Array(m);
    for(let k=0;k<m;k++){ const p = pos[I[k]]++; colTmp[p]=J[k]; valTmp[p]=V[k]; }
    const outC = new Int32Array(m), outV = new Float64Array(m), rowPtr = new Int32Array(n+1);
    let w = 0;
    for(let i=0;i<n;i++){
      rowPtr[i] = w;
      const s = start[i], e = start[i+1];
      const order = [];
      for(let q=s;q<e;q++) order.push(q);
      order.sort((a,b)=> colTmp[a]-colTmp[b]);
      let last = -1;
      for(const q of order){
        if(colTmp[q]===last){ outV[w-1] += valTmp[q]; }
        else { outC[w]=colTmp[q]; outV[w]=valTmp[q]; w++; last=colTmp[q]; }
      }
    }
    rowPtr[n] = w;
    return { n, rowPtr, cols: outC.slice(0,w), vals: outV.slice(0,w) };
  }

  export function csrMatVec(A, x, y){
    const {n,rowPtr,cols,vals} = A;
    for(let i=0;i<n;i++){
      let s = 0;
      for(let q=rowPtr[i]; q<rowPtr[i+1]; q++) s += vals[q]*x[cols[q]];
      y[i] = s;
    }
  }

  /* Throws a Thai error message if the supports leave the body able to move as a rigid body. */
  function checkSupports(fixed, ndpn, nodeCount){
    let count = 0; const nodesWithFixed = new Set();
    const dirs = new Array(ndpn).fill(0);
    for(let i=0;i<fixed.length;i++) if(fixed[i]){
      count++; nodesWithFixed.add(Math.floor(i/ndpn)); dirs[i%ndpn]++;
    }
    if(count===0) throw new Error('ยังไม่มีการยึดรั้ง (support) ใด ๆ — โครงสร้างจะเคลื่อนที่ได้อิสระ (rigid body motion) กรุณากำหนด Fixed หรือ Roller อย่างน้อยหนึ่งขอบ');
    if(ndpn===2){
      if(dirs[0]===0 || dirs[1]===0 || count<3 || nodesWithFixed.size<2){
        throw new Error('การยึดรั้งยังไม่พอ — ต้องกันได้ทั้งการเลื่อนในแกน x, แกน y และการหมุน (เช่น Fixed หนึ่งขอบ หรือ Roller x หนึ่งขอบ ร่วมกับ Roller y อีกหนึ่งขอบ)');
      }
    }
  }

  export function assembleStructuralSystem(){
    const mesh = state.mesh;
    const {nodes, elements, boundaries} = mesh;
    const isQuad = mesh.order==='quadratic';
    const is1D = mesh.dim==='1d';
    const ndpn = is1D ? 1 : 2;
    const n = nodes.length*ndpn;
    const E = state.structural.E, nu = state.structural.nu;
    const F = new Float64Array(n);
    const fixed = new Uint8Array(n);
    const I=[], J=[], V=[];
    function addBlock(dofs, Ke){
      const m = dofs.length;
      for(let a=0;a<m;a++) for(let b=0;b<m;b++){
        const v = Ke[a*m+b];
        if(v!==0){ I.push(dofs[a]); J.push(dofs[b]); V.push(v); }
      }
    }

    if(is1D){
      const A = state.structural.area;
      for(const el of elements){
        if(!isQuad){
          const [a,b] = el;
          const L = Math.abs(nodes[b].x-nodes[a].x);
          if(L<1e-14) continue;
          const s = E*A/L;
          addBlock([a,b], [s,-s,-s,s]);
        } else {
          const [a,m,b] = el;
          const L = Math.abs(nodes[b].x-nodes[a].x);
          if(L<1e-14) continue;
          const s = E*A/(3*L);
          addBlock([a,m,b], [7*s,-8*s,s, -8*s,16*s,-8*s, s,-8*s,7*s]);
        }
      }
      for(const edgeName of Object.keys(boundaries)){
        const bc = state.sbc[edgeName];
        if(!bc) continue;
        const node = boundaries[edgeName][0];
        if(bc.type==='fixed') fixed[node] = 1;
        else if(bc.type==='load') F[node] += bc.value;
      }
    } else {
      const mode = state.structural.mode;
      const D = planeD(E, nu, mode);
      const t = effectiveThickness();
      for(const ids of elements){
        const coords = ids.map(i=>nodes[i]);
        const dofs = [];
        ids.forEach(i=>{ dofs.push(2*i, 2*i+1); });
        if(!isQuad){
          const {B, area} = cstB(coords);
          if(area<1e-14) continue;
          const Ke = new Float64Array(36);
          addBtDB(Ke, B, 6, D, t*area);
          addBlock(dofs, Ke);
        } else {
          const {area} = lstB(coords, [1/3,1/3,1/3]);
          if(area<1e-14) continue;
          const Ke = new Float64Array(144);
          // 3-point rule (exact for the quadratic integrand B^T D B)
          const qp = [[2/3,1/6,1/6],[1/6,2/3,1/6],[1/6,1/6,2/3]];
          for(const L of qp){
            const {B} = lstB(coords, L);
            addBtDB(Ke, B, 12, D, t*area/3);
          }
          addBlock(dofs, Ke);
        }
      }

      // Edge conditions: supports (zero displacement) and uniform tractions
      for(const edgeName of Object.keys(boundaries)){
        const bc = state.sbc[edgeName];
        if(!bc || bc.type==='free') continue;
        const list = boundaries[edgeName];
        if(bc.type==='fixed' || bc.type==='roller_x' || bc.type==='roller_y'){
          for(const nd of list){
            if(bc.type!=='roller_y') fixed[2*nd] = 1;
            if(bc.type!=='roller_x') fixed[2*nd+1] = 1;
          }
        } else if(bc.type==='traction' && (bc.tx!==0 || bc.ty!==0)){
          const step = isQuad ? 2 : 1;
          for(let s=0; s+step<list.length; s+=step){
            const ids = isQuad ? [list[s], list[s+1], list[s+2]] : [list[s], list[s+1]];
            const p = nodes[ids[0]], q = nodes[ids[ids.length-1]];
            const len = Math.hypot(q.x-p.x, q.y-p.y);
            const w = isQuad ? [1/6,4/6,1/6] : [1/2,1/2];
            ids.forEach((nd,k)=>{
              F[2*nd]   += t*len*w[k]*bc.tx;
              F[2*nd+1] += t*len*w[k]*bc.ty;
            });
          }
        }
      }

      // Point loads at shape corners
      const cid = cornerNodeIds(mesh);
      for(const [key, pl] of Object.entries(state.spl)){
        const nd = cid[key];
        if(nd===undefined) continue;
        F[2*nd]   += pl.fx;
        F[2*nd+1] += pl.fy;
      }
    }

    checkSupports(fixed, ndpn, nodes.length);
    return { n, ndpn, K: buildCSR(n, I, J, V), F, fixed, is1D, isQuad };
  }
