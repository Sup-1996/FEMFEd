import { state } from '../state.js';

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
          const cornerFrac = 1/19, midFrac = 16/57;
          Madd(ids[0], total*cornerFrac); Madd(ids[1], total*cornerFrac); Madd(ids[2], total*cornerFrac);
          Madd(ids[3], total*midFrac);    Madd(ids[4], total*midFrac);    Madd(ids[5], total*midFrac);
        }
      }
      return M;
  }
