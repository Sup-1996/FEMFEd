/**
 * Generic canvas helpers shared by every 2D drawing routine:
 *
 * - fitTransform: maps a shape's bounding box to canvas pixel space
 *   (with padding, preserving aspect ratio, y-axis flipped so +y is up).
 * - getRenderTriangles: returns the list of *drawable* triangles for a
 *   mesh - quadratic (6-node) triangles get split into 4 linear
 *   sub-triangles purely for rendering purposes.
 */

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
