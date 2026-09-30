/**
 * Triangle-mesh quality numbers for the mesh step's summary box.
 * Uses each element's three corner nodes (the first three entries, which
 * is also right for quadratic 6-node elements), so linear and quadratic
 * meshes of the same shape report the same figures. Returns null for 1D
 * meshes, which have no triangles.
 *
 *   minAngle      - smallest interior angle anywhere in the mesh (degrees)
 *   meanMinAngle  - average over elements of each element's smallest angle
 *                   (an equilateral triangle scores 60)
 */
function triangleAngles(A, B, C){
  const at = (P, Q, R)=>{
    const ux=Q.x-P.x, uy=Q.y-P.y, vx=R.x-P.x, vy=R.y-P.y;
    const d = Math.hypot(ux,uy)*Math.hypot(vx,vy);
    if(d === 0) return 0;
    return Math.acos(Math.max(-1, Math.min(1, (ux*vx+uy*vy)/d)))*180/Math.PI;
  };
  return [at(A,B,C), at(B,C,A), at(C,A,B)];
}

export function meshQuality(mesh){
  if(!mesh || mesh.dim === '1d' || !mesh.elements.length) return null;
  let minAngle = 180, sum = 0;
  for(const el of mesh.elements){
    const m = Math.min(...triangleAngles(mesh.nodes[el[0]], mesh.nodes[el[1]], mesh.nodes[el[2]]));
    if(m < minAngle) minAngle = m;
    sum += m;
  }
  return { minAngle, meanMinAngle: sum/mesh.elements.length };
}
