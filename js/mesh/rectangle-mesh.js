/**
 * 2D rectangular mesh: a regular grid of nodes, split into two
 * triangles per grid cell.
 */

  export function buildRectangleMesh(width, height, divisions){
    const elSize = Math.min(width, height) / divisions;
    const nx = Math.max(1, Math.round(width / elSize));
    const ny = Math.max(1, Math.round(height / elSize));
    const dx = width / nx, dy = height / ny;
    const nodes = [];
    for(let j=0;j<=ny;j++){
      for(let i=0;i<=nx;i++){
        nodes.push({x: i*dx, y: j*dy});
      }
    }
    const idx = (i,j)=> j*(nx+1)+i;
    const elements = [];
    for(let j=0;j<ny;j++){
      for(let i=0;i<nx;i++){
        const n0=idx(i,j), n1=idx(i+1,j), n2=idx(i,j+1), n3=idx(i+1,j+1);
        elements.push([n0,n1,n3]);
        elements.push([n0,n3,n2]);
      }
    }
    const left=[], right=[], bottom=[], top=[];
    for(let j=0;j<=ny;j++) left.push(idx(0,j));
    for(let j=0;j<=ny;j++) right.push(idx(nx,j));
    for(let i=0;i<=nx;i++) bottom.push(idx(i,0));
      for(let i=0;i<=nx;i++) top.push(idx(i,ny));
      return { nodes, elements, boundaries: { left, right, bottom, top }, bbox:{w:width,h:height} };
  }

  /* ---- Resolve "max element count" (UI control) into a rectangle grid divisions value ---- */
  export function rectDivisionsForTarget(width, height, maxEl){
    let best=1;
    for(let d=1; d<=500; d++){
      const elSize = Math.min(width,height)/d;
      const nx = Math.max(1, Math.round(width/elSize));
      const ny = Math.max(1, Math.round(height/elSize));
      if(2*nx*ny <= maxEl) best=d; else break;
    }
    return best;
  }
