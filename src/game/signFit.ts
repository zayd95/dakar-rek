import * as THREE from 'three';
import type { GameModule } from './modules';
import { refitSign } from '../world/batch';

/**
 * Every painted board (builder, economy, arena, interiors) is drawn by `signTexture` at a canvas size its caller chose, and some of those
 * canvases do not have their plane's proportions: the lettering stretches. After each hub is built, any sign whose canvas and plane
 * differ is repainted at the plane's own proportions (src/world/batch.ts `refitSign`): one place, no caller touched.
 */
export const signFitModule: GameModule = {
  name: 'signFit',
  hubLoaded(ctx, hub) {
    for (const root of [hub.group, ctx.extra]) root.traverse(o => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.geometry.type !== 'PlaneGeometry') return;
      const map = (m.material as THREE.MeshLambertMaterial).map, g = m.geometry as THREE.PlaneGeometry;
      if (!map) return;
      refitSign(map, g.parameters.width * m.scale.x, g.parameters.height * m.scale.y);
      // a small board (a ticket window, a parking notice) whose letters came out below 0.2 m is made up to 1.6 × larger: still the same sign, readable from the phone's camera
      const info = map.userData.sign as { size: number; h: number } | undefined, ph = g.parameters.height * m.scale.y, pw = g.parameters.width * m.scale.x;
      if (!info || pw > 2.4) return;
      const em = info.size * ph / info.h;
      if (em < 0.2) m.scale.multiplyScalar(Math.min(1.6, 0.2 / em));
    });
  },
};
