export function fitTransform(bbox, canvasW, canvasH, pad){
    const availW = canvasW - 2*pad, availH = canvasH - 2*pad;
    const scale = Math.min(availW/bbox.w, availH/bbox.h);
    const offX = pad + (availW - bbox.w*scale)/2;
    const offY = pad + (availH - bbox.h*scale)/2;
    return (x,y)=> [offX + x*scale, canvasH - (offY + y*scale)];
  }

  export function getRenderTriangles(mesh){
    if(mesh.order === 'quadratic'){
      const tris = [];
      for(const [a,b,c,m1,m2,m3] of mesh.elements){
        tris.push([a,m1,m3],[m1,b,m2],[m3,m2,c],[m1,m2,m3]);
      }
      return tris;
    }
    return mesh.elements;
  }
