function polygonSignedArea2(vertices){
    let a=0;
    for(let i=0;i<vertices.length;i++){
      const p=vertices[i], q=vertices[(i+1)%vertices.length];
      a += p.x*q.y - q.x*p.y;
    }
    return a;
  }

  function segmentsIntersect(p1,p2,p3,p4){
    function cross(o,a,b){ return (a.x-o.x)*(b.y-o.y) - (a.y-o.y)*(b.x-o.x); }
    const d1=cross(p3,p4,p1), d2=cross(p3,p4,p2), d3=cross(p1,p2,p3), d4=cross(p1,p2,p4);
    if(((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))) return true;
    return false;
  }

  export function isSimplePolygon(vertices){
    const n = vertices.length;
    if(n<3) return false;
    for(let i=0;i<n;i++){
      const a1=vertices[i], a2=vertices[(i+1)%n];
      for(let j=i+1;j<n;j++){
        if(j===i || (j+1)%n===i || j===(i+1)%n) continue;
        const b1=vertices[j], b2=vertices[(j+1)%n];
        if(segmentsIntersect(a1,a2,b1,b2)) return false;
      }
    }
    return true;
  }

  function pointInTriangleStrict(P,A,B,C){
    const d1=(P.x-B.x)*(A.y-B.y)-(A.x-B.x)*(P.y-B.y);
    const d2=(P.x-C.x)*(B.y-C.y)-(B.x-C.x)*(P.y-C.y);
    const d3=(P.x-A.x)*(C.y-A.y)-(C.x-A.x)*(P.y-A.y);
    const hasNeg=(d1<0)||(d2<0)||(d3<0), hasPos=(d1>0)||(d2>0)||(d3>0);
    return !(hasNeg && hasPos);
  }

  function triangulatePolygonEarClip(vertices){
    const n = vertices.length;
    const isCCW = polygonSignedArea2(vertices) > 0;
    let remaining = vertices.map((_,i)=>i);
    const triangles = [];
    let guard = 0;
    while(remaining.length > 3 && guard < 5000){
      guard++;
      let clipped = false;
      for(let i=0;i<remaining.length;i++){
        const m = remaining.length;
        const iPrev=(i-1+m)%m, iNext=(i+1)%m;
        const aIdx=remaining[iPrev], bIdx=remaining[i], cIdx=remaining[iNext];
        const A=vertices[aIdx], B=vertices[bIdx], C=vertices[cIdx];
        const cross = (B.x-A.x)*(C.y-A.y) - (B.y-A.y)*(C.x-A.x);
        const convex = isCCW ? cross > 1e-12 : cross < -1e-12;
        if(!convex) continue;
        let containsOther = false;
        for(let k=0;k<m;k++){
          if(k===iPrev||k===i||k===iNext) continue;
          if(pointInTriangleStrict(vertices[remaining[k]], A,B,C)){ containsOther=true; break; }
        }
        if(containsOther) continue;
        triangles.push(isCCW ? [aIdx,bIdx,cIdx] : [aIdx,cIdx,bIdx]);
        remaining.splice(i,1);
        clipped = true;
          break;
        }
        if(!clipped) break;
      }
      if(remaining.length===3){
        const [a,b,c]=remaining;
        triangles.push(isCCW ? [a,b,c] : [a,c,b]);
      }
      return triangles;
  }

  export function buildPolygonMesh(vertices, maxElements){
    const n = vertices.length;
    const baseTriangles = triangulatePolygonEarClip(vertices);
    const baseCount = baseTriangles.length;
    let levels = 0;
    while(baseCount * Math.pow(4, levels+1) <= maxElements) levels++;

      let nodes = vertices.slice();
      let triangles = baseTriangles;
      const midMap = new Map();
      function key(i,j){ return i<j ? i+'_'+j : j+'_'+i; }
      function getMid(i,j){
        const k = key(i,j);
        if(midMap.has(k)) return midMap.get(k);
        const p=nodes[i], q=nodes[j];
        const idx = nodes.length;
        nodes.push({x:(p.x+q.x)/2, y:(p.y+q.y)/2});
        midMap.set(k, idx);
        return idx;
      }
      for(let lvl=0; lvl<levels; lvl++){
        const next = [];
        for(const [a,b,c] of triangles){
          const mab=getMid(a,b), mbc=getMid(b,c), mca=getMid(c,a);
          next.push([a,mab,mca],[mab,b,mbc],[mca,mbc,c],[mab,mbc,mca]);
        }
        triangles = next;
      }
      function edgeChain(a,b,level){
        if(level===0) return [a,b];
        const m = midMap.get(key(a,b));
        const left = edgeChain(a,m,level-1);
        const right = edgeChain(m,b,level-1);
        return left.concat(right.slice(1));
      }
      const boundaries = {};
      for(let i=0;i<n;i++){
        boundaries['edge'+i] = edgeChain(i, (i+1)%n, levels);
      }
      let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
      for(const v of vertices){ if(v.x<minX)minX=v.x; if(v.x>maxX)maxX=v.x; if(v.y<minY)minY=v.y; if(v.y>maxY)maxY=v.y; }
      return { nodes, elements:triangles, boundaries, bbox:{w:maxX-minX, h:maxY-minY} };
  }
