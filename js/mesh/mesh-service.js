import { state } from '../state.js';
import { buildLineMesh, quadraticizeLine } from './line-mesh.js';
import { buildRectangleMesh, rectDivisionsForTarget } from './rectangle-mesh.js';
import { buildPolygonMesh } from './polygon-mesh.js';
import { quadraticize } from './quadratic-mesh.js';

/**
 * Builds state.mesh from the current shape/geometry/element-order
 * settings, and resets state.bc to sensible defaults for the resulting
 * edge set. This is the one function the "mesh" wizard step calls when
 * the user presses "generate mesh".
 */

  export function generateMesh(){
    const maxEl = Math.max(1, Math.min(5000, Math.round(state.maxElements)));
    let base;
    if(state.dimension==='1d'){
      base = buildLineMesh(state.geom.length, maxEl);
    } else if(state.shape==='rectangle'){
      const divisions = rectDivisionsForTarget(state.geom.width, state.geom.height, maxEl);
      base = buildRectangleMesh(state.geom.width, state.geom.height, divisions);
    } else {
      base = buildPolygonMesh(state.polygon.vertices, maxEl);
    }
    base.order = 'linear';
    if(state.elementOrder==='quadratic'){
      state.mesh = (state.dimension==='1d') ? quadraticizeLine(base) : quadraticize(base);
    } else {
      state.mesh = base;
    }
    // reset BCs to insulated default for the new edge set
    const edgeNames = Object.keys(state.mesh.boundaries);
    const newBc = {};
    edgeNames.forEach(e=>{ newBc[e] = state.bc[e] || {type:'insulated', value:0}; });
    state.bc = newBc;
  }
