import * as THREE from 'three';
import type { Humanoid } from './humanoid';
import { STUDIO_LIGHT } from './studioLight';

/**
 * A still of a body (the studio's choice cards, the phone's Profile picture), drawn by a renderer that already exists — the studio's while it is open, the game's
 * otherwise — never a renderer of its own. It renders into a corner of that renderer's canvas and copies the pixels out at once, so the caller must run it just
 * before that renderer draws its own frame (which clears the canvas): nothing of it is ever shown. The picture has the same tone mapping as the game.
 */
export type PortraitFocus = 'face' | 'hair' | 'body';
export interface PortraitOpts { width: number; height: number; focus: PortraitFocus; yaw: number; /** Background colour, or null for transparent (a renderer with alpha). */ bg: number | null }
const FRAME: Record<PortraitFocus, { y: number; h: number }> = { face: { y: 1.66, h: 0.56 }, hair: { y: 1.71, h: 0.62 }, body: { y: 0.96, h: 2.12 } };
let scene: THREE.Scene | null = null;
const cam = new THREE.PerspectiveCamera(24, 1, 0.05, 30);

export function renderPortrait(r: THREE.WebGLRenderer, body: Humanoid, o: PortraitOpts): HTMLCanvasElement {
  if (!scene) { scene = new THREE.Scene(); for (const l of STUDIO_LIGHT()) scene.add(l); }
  const g = body.group, parent = g.parent, rot = g.rotation.y, at = g.position.clone();
  scene.add(g); g.position.set(0, 0, 0); g.rotation.y = o.yaw; g.updateMatrixWorld(true);
  const sc = g.scale.x, f = FRAME[o.focus], t = Math.tan((cam.fov * Math.PI) / 360);
  cam.aspect = o.width / o.height; cam.updateProjectionMatrix();
  const d = Math.max((f.h * sc) / (2 * t), (f.h * sc * 0.55) / (2 * t * cam.aspect));
  cam.position.set(0, f.y * sc + 0.02, d); cam.lookAt(0, f.y * sc, 0);
  scene.background = o.bg === null ? null : new THREE.Color(o.bg);
  // into the bottom-left corner of the canvas, then copied out
  const prevVp = new THREE.Vector4(), prevSc = new THREE.Vector4(), prevTest = r.getScissorTest(), prevClear = new THREE.Color(), prevAlpha = r.getClearAlpha(), prevTarget = r.getRenderTarget();
  r.getViewport(prevVp); r.getScissor(prevSc); r.getClearColor(prevClear);
  r.setRenderTarget(null); r.setViewport(0, 0, o.width, o.height); r.setScissor(0, 0, o.width, o.height); r.setScissorTest(true); r.setClearColor(0x000000, 0);
  r.clear(); r.render(scene, cam);
  const pr = r.getPixelRatio(), src = r.domElement, out = document.createElement('canvas');
  out.width = Math.round(o.width * pr); out.height = Math.round(o.height * pr);
  out.getContext('2d')!.drawImage(src, 0, src.height - out.height, out.width, out.height, 0, 0, out.width, out.height);
  r.setViewport(prevVp); r.setScissor(prevSc); r.setScissorTest(prevTest); r.setClearColor(prevClear, prevAlpha); r.setRenderTarget(prevTarget);
  g.rotation.y = rot; g.position.copy(at);
  if (parent) parent.add(g); else g.removeFromParent();
  return out;
}
