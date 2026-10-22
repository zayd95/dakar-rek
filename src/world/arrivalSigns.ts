import * as THREE from 'three';
import type { GameModule } from '../game/modules';
import type { HubId } from '../core/types';
import { ROADS } from '../road/routes';
import { LINKS } from '../transport/hubLink';
import { say } from '../i18n/wolof';

/**
 * The welcome at each way into a district (§ 8): where a road between districts (src/road/routes.ts) or a border street (src/transport/hubLink.ts) comes
 * in, a board on the right of the arriving traffic, facing it: the district's name and a word of welcome. Pure placement (`arrivals`, unit-tested);
 * one canvas texture per district, one mesh per board, built when the district loads.
 */
export const HUB_TITLE: Record<HubId, { name: string; line: string }> = {
  pikine: { name: 'PIKINE', line: 'Bienvenue · la banlieue qui bouge' },
  plateau: { name: 'PLATEAU', line: 'Bienvenue · le centre-ville' },
  corniche: { name: 'CORNICHE', line: 'Bienvenue · route de la côte' },
  almadies: { name: 'ALMADIES', line: 'Bienvenue · la pointe de Dakar' },
};
/** Where the boards of a district stand (hub-local): a few metres in from each way in, on the right of the arriving traffic, and the way they face. */
export function arrivals(hub: HubId): { x: number; z: number; yaw: number; from: string }[] {
  const out: { x: number; z: number; yaw: number; from: string }[] = [];
  const put = (mx: number, mz: number, enterYaw: number, from: string) => {
    const fx = Math.sin(enterYaw), fz = Math.cos(enterYaw), rx = -Math.cos(enterYaw), rz = Math.sin(enterYaw);    // forward, and the driver's right (+x is the left)
    out.push({ x: mx + fx * 18 + rx * 6.4, z: mz + fz * 18 + rz * 6.4, yaw: enterYaw + Math.PI, from });     // past the perimeter street's junction, on the pavement
  };
  for (const r of ROADS) {
    if (r.def.a === hub) put(r.def.aMouth.x, r.def.aMouth.z, r.def.aMouth.yaw + Math.PI, r.def.b);
    if (r.def.b === hub) put(r.def.bMouth.x, r.def.bMouth.z, r.def.bMouth.yaw, r.def.a);                 // a mouth's heading is the road's, a → b
  }
  for (const l of LINKS) if (l.to === hub) put(l.x, l.arrive, l.dir > 0 ? 0 : Math.PI, l.from);
  return out;
}

let built: { group: THREE.Group; dispose(): void } | null = null;
function build(hub: HubId) {
  const group = new THREE.Group(); group.name = 'arrival_signs';
  const own: { dispose(): void }[] = [];
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256;
  const c = cv.getContext('2d')!, T = HUB_TITLE[hub];
  c.fillStyle = '#0f6b3a'; c.fillRect(0, 0, 512, 256); c.strokeStyle = '#ffffff'; c.lineWidth = 8; c.strokeRect(8, 8, 496, 240);
  c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '800 96px system-ui, sans-serif'; c.fillText(T.name, 256, 104, 470);
  c.font = '600 32px system-ui, sans-serif'; c.fillText(T.line, 256, 182, 470);
  c.font = '600 24px system-ui, sans-serif'; c.fillStyle = '#f4c20d'; c.fillText(say('Dalal ak jàmm'), 256, 222, 470);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const face = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x0b3d22, emissiveMap: tex, emissiveIntensity: 0.25 }), post = new THREE.MeshLambertMaterial({ color: 0x555a60 });
  const pg = new THREE.PlaneGeometry(4.2, 2.1), cg = new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8), bg = new THREE.BoxGeometry(4.3, 2.2, 0.06);
  own.push(tex, face, post, pg, cg, bg);
  for (const a of arrivals(hub)) {
    const g = new THREE.Group(); g.position.set(a.x, 0, a.z); g.rotation.y = a.yaw;
    for (const s of [-1.6, 1.6]) { const p = new THREE.Mesh(cg, post); p.position.set(s, 2.3, -0.05); g.add(p); }
    const back = new THREE.Mesh(bg, post); back.position.set(0, 3.5, -0.04); g.add(back);
    const m = new THREE.Mesh(pg, face); m.position.set(0, 3.5, 0); g.add(m);
    group.add(g);
  }
  return { group, dispose() { for (const o of own) o.dispose(); group.removeFromParent(); } };
}

export const arrivalSignsModule: GameModule = {
  name: 'arrivalSigns',
  hubLoaded(ctx, hub) {
    built?.dispose(); built = null;
    if (typeof document === 'undefined') return;
    built = build(hub.id); ctx.extra.add(built.group);
  },
};
