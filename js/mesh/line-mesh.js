/**
 * 1D "bar" mesh: a straight line of nodes from x=0 to x=length.
 */

  export function buildLineMesh(length, divisions){
    const n = Math.max(1, Math.round(divisions));
    const dx = length/n;
    const nodes = [];
    for(let i=0;i<=n;i++) nodes.push({x:i*dx, y:0});
    const elements = [];
    for(let i=0;i<n;i++) elements.push([i,i+1]);
    return { nodes, elements, boundaries:{left:[0], right:[n]}, bbox:{w:length,h:length}, dim:'1d' };
  }

  export function quadraticizeLine(mesh){
    const nodes = mesh.nodes.slice();
    const elements = mesh.elements.map(([a,b])=>{
      const p=mesh.nodes[a], q=mesh.nodes[b];
      const idx = nodes.length;
      nodes.push({x:(p.x+q.x)/2, y:0});
      return [a, idx, b]; // order (endA, mid, endB) to match quadratic bar stiffness matrix
    });
    return { nodes, elements, boundaries: mesh.boundaries, bbox: mesh.bbox, order:'quadratic', dim:'1d' };
  }
