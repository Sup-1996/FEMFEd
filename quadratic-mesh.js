export function quadraticize(mesh){
    // Adds mid-side nodes to turn a 3-node linear mesh into a 6-node quadratic mesh.
    const nodes = mesh.nodes.slice();
      const edgeMap = new Map();
      function edgeKey(i,j){ return i<j ? i+'_'+j : j+'_'+i; }
      function getMid(i,j){
        const key = edgeKey(i,j);
        if(edgeMap.has(key)) return edgeMap.get(key);
        const p=mesh.nodes[i], q=mesh.nodes[j];
        const idx = nodes.length;
        nodes.push({x:(p.x+q.x)/2, y:(p.y+q.y)/2});
        edgeMap.set(key, idx);
        return idx;
      }
      const elements = mesh.elements.map(([a,b,c])=>{
        const m1=getMid(a,b), m2=getMid(b,c), m3=getMid(c,a);
        return [a,b,c,m1,m2,m3];
      });
      const boundaries = {};
      for(const key of Object.keys(mesh.boundaries)){
        const corners = mesh.boundaries[key];
        const list=[corners[0]];
        for(let s=0;s<corners.length-1;s++){
          const mid = getMid(corners[s], corners[s+1]);
          list.push(mid, corners[s+1]);
        }
        boundaries[key]=list;
      }
      return { nodes, elements, boundaries, bbox: mesh.bbox, order:'quadratic' };
  }
