import { state } from '../state.js';

/**
 * Lumped (diagonal) mass matrix [M] for transient analysis, via HRZ
 * lumping (see the long comment inline below for *why* HRZ lumping
 * specifically, rather than the full consistent mass matrix or naive
 * row-sum lumping).
 */

  /* ---- Consistent mass matrix (for transient analysis): [C]{dT/dt} + [K]{T} = {F} ---- */
  /* ---- Lumped (diagonal) mass matrix via HRZ lumping.
     Why lumped rather than the full "consistent" mass matrix: the consistent mass matrix is
     more accurate for smooth transients, but it is only *stable*, not *monotone* — right after a
     sudden Dirichlet jump it can produce small unphysical undershoots/overshoots that violate the
     maximum principle (temperature dipping below both the initial condition and every boundary
     value). Lumping trades a little accuracy for a scheme that respects physical bounds, which
     matters more for an educational tool. HRZ lumping (diagonal-scaling) is used instead of naive
     row-sum lumping because row sums of the quadratic-element consistent mass matrix are zero (or
     even change sign) at corner nodes — a known property of quadratic Lagrange shape functions —
     which would make a naive lumped matrix singular. HRZ keeps the (always positive) diagonal
     entries of the consistent matrix and rescales them so the element's total mass is preserved
     exactly; for linear elements this reduces to the standard textbook lumped mass. ---- */
  export function assembleMassMatrix(){
    const {nodes, elements} = state.mesh;
    const isQuadratic = state.mesh.order === 'quadratic';
    const is1D = state.mesh.dim === '1d';
    const n = nodes.length;
    const M = new Float64Array(n*n);
    const rhoC = state.material.rho * state.material.cp;
    function Madd(i,v){ M[i*n+i]+=v; }

      if(is1D){
        if(!isQuadratic){
          for(const [a,b] of elements){
            const Le = Math.abs(nodes[b].x-nodes[a].x);
            const total = rhoC*Le;
            Madd(a, total/2); Madd(b, total/2);
          }
        } else {
          for(const [a,m,b] of elements){
            const Le = Math.abs(nodes[b].x-nodes[a].x);
            const total = rhoC*Le;
            Madd(a, total/6); Madd(m, total*2/3); Madd(b, total/6);
          }
        }
      } else if(!isQuadratic){
        for(const [a,b,c] of elements){
          const A0=nodes[a], B0=nodes[b], C0=nodes[c];
          const area = 0.5*Math.abs((B0.x-A0.x)*(C0.y-A0.y) - (C0.x-A0.x)*(B0.y-A0.y));
          const total = rhoC*area;
          Madd(a, total/3); Madd(b, total/3); Madd(c, total/3);
        }
      } else {
        for(const ids of elements){
          const [P1,P2,P3] = ids.map(i=>nodes[i]);
          const area = 0.5*Math.abs((P2.x-P1.x)*(P3.y-P1.y) - (P3.x-P1.x)*(P2.y-P1.y));
          const total = rhoC*area;
          // HRZ fractions from the consistent T6 matrix's diagonal [6,6,6,32,32,32]/114
          const cornerFrac = 1/19, midFrac = 16/57;
          Madd(ids[0], total*cornerFrac); Madd(ids[1], total*cornerFrac); Madd(ids[2], total*cornerFrac);
          Madd(ids[3], total*midFrac);    Madd(ids[4], total*midFrac);    Madd(ids[5], total*midFrac);
        }
      }
      return M;
  }
