import * as THREE from 'three';
import type { GameCtx, GameModule } from '../game/modules';
import type { TargetKind } from '../interact/types';
import { JOB, jobBadge, jobOf, markGoal, type JobKind } from './jobMarks';

/**
 * World-space UI (docs/UI.md, « the world is the interface »):
 * - a sun-coloured ring on the ground under the focused target (person, seat, counter, door…), so what the action button
 *   will act on is recognisable in the scene itself; grey when nothing can be done there now (another tier's place on
 *   the arena's stands, a closed counter: every affordance disabled), the bubble above saying why;
 * - a way-finding pin (beam + bobbing marker) over the next-step place (`ctx.guide()`), with the goal hint's compass
 *   (direction and distance) on the HUD.
 * Four meshes, one material each, no textures; hidden whenever the player is not free to walk (menus, activities, scenes).
 */
const SUN = 0xffc83d;
/** The ring under a target where nothing can be done now (its reason is in the bubble and on the action button). */
const GREY = 0x8e8e93;
/** Ring radius (m) by target kind. */
const SIZE: Partial<Record<TargetKind, number>> = { person: 0.62, seat: 0.62, vehicle: 1.9, door: 0.95, counter: 0.9, shop: 1.0, place: 1.1, land: 1.6, billboard: 1.4, furniture: 0.75, spot: 0.8 };

export function worldMarkers(): GameModule {
  const ringMat = new THREE.MeshBasicMaterial({ color: SUN, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const discMat = new THREE.MeshBasicMaterial({ color: SUN, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const pinMat = new THREE.MeshBasicMaterial({ color: SUN, fog: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: SUN, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const focus = new THREE.Group(), pin = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.84, 1, 48), ringMat); ring.rotation.x = -Math.PI / 2;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.84, 40), discMat); disc.rotation.x = -Math.PI / 2;
  focus.add(disc, ring); focus.renderOrder = 2; focus.visible = false;
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 4), pinMat); head.rotation.x = Math.PI;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 10, 8, 1, true), beamMat); beam.position.y = 5;
  pin.add(beam, head); pin.renderOrder = 2; pin.visible = false;
  // a job's target (src/ui/jobMarks.ts): the pin in its colour with its badge over it; a VTC ride's kerb bay outlined on the road, where the car stops
  const badges: Record<JobKind, THREE.Sprite> = { vtc: jobBadge('vtc'), delivery: jobBadge('delivery') };
  for (const b of Object.values(badges)) { b.visible = false; pin.add(b); }
  const bayMat = new THREE.MeshBasicMaterial({ color: JOB.vtc.hex, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const bayShape = new THREE.Shape(), hole = new THREE.Path(), bw = 1.35, bl = 2.9, t2 = 0.22;
  bayShape.moveTo(-bw, -bl); bayShape.lineTo(bw, -bl); bayShape.lineTo(bw, bl); bayShape.lineTo(-bw, bl); bayShape.closePath();
  hole.moveTo(-bw + t2, -bl + t2); hole.lineTo(-bw + t2, bl - t2); hole.lineTo(bw - t2, bl - t2); hole.lineTo(bw - t2, -bl + t2); hole.closePath(); bayShape.holes.push(hole);
  const bay = new THREE.Mesh(new THREE.ShapeGeometry(bayShape), bayMat); bay.rotation.x = -Math.PI / 2; bay.renderOrder = 2;
  const bayGroup = new THREE.Group(); bayGroup.add(bay); bayGroup.visible = false; bayGroup.name = 'vtc_bay';
  let pinJob: JobKind | null = null;
  let t = 0, focusId = '', grow = 1, grey = false, greyT = 0;
  const ground = (ctx: GameCtx, x: number, z: number) => (ctx.inside() ? 0.1 : (ctx.world()?.heightAt(x, z) ?? 0) + 0.06);

  return {
    name: 'ui-world',
    init(ctx) { ctx.scene.add(focus, pin, bayGroup); },
    update(ctx, dt) {
      t += dt;
      const free = ctx.mode() === 'play' && !ctx.activities.running && !document.body.classList.contains('inscene');
      // focused target
      const f = free ? ctx.interactions.focus : null;
      if (f && f.kind !== 'self') {
        if (f.id !== focusId) { focusId = f.id; grow = 0.55; greyT = 0; }
        // grey when its primary affordance is disabled (affordances are rebuilt on call: four times a second is enough)
        if ((greyT -= dt) <= 0) {
          greyT = 0.25;
          const off = !!ctx.interactions.primary(f)?.disabled;
          if (off !== grey) { grey = off; ringMat.color.setHex(grey ? GREY : SUN); discMat.color.setHex(grey ? GREY : SUN); }
        }
        grow += (1 - grow) * Math.min(1, dt * 14);
        const r = (SIZE[f.kind] ?? 0.8) * grow * (1 + Math.sin(t * 4.2) * 0.035);
        focus.position.set(f.x, ground(ctx, f.x, f.z), f.z); focus.scale.setScalar(r);
        ringMat.opacity = 0.8 + Math.sin(t * 4.2) * 0.15;
        focus.visible = true;
      } else { focus.visible = false; focusId = ''; }
      // next-step place
      const g = ctx.guide();
      const p = ctx.player.pos;
      const job = jobOf(g); markGoal(job);
      if (job !== pinJob) {
        pinJob = job; const col = job ? JOB[job].hex : SUN;
        pinMat.color.setHex(col); beamMat.color.setHex(col);
        for (const [k, b] of Object.entries(badges)) b.visible = k === job;
      }
      bayGroup.visible = !!g && job === 'vtc' && !ctx.inside() && free;
      if (bayGroup.visible && g) { bayGroup.position.set(g.x, ground(ctx, g.x, g.z) + 0.01, g.z); bayGroup.rotation.y = (g as { yaw?: number }).yaw ?? 0; bayMat.opacity = 0.75 + Math.sin(t * 4) * 0.2; }
      if (!g || ctx.inside()) { pin.visible = false; ctx.hud.setGuide(null); return; }
      const dx = g.x - p.x, dz = g.z - p.z, dist = Math.hypot(dx, dz);
      let a = Math.atan2(dx, dz) - ctx.follow.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      ctx.hud.setGuide(free || ctx.mode() === 'play' ? { angle: a, dist } : null);
      // the delivery lane draws its own marker on the same place while a parcel run is on
      const delivery = document.getElementById('delivery')?.classList.contains('on');
      pin.visible = free && dist > 3.5 && !delivery;
      if (pin.visible) {
        pin.position.set(g.x, ground(ctx, g.x, g.z), g.z);
        head.position.y = 3.1 + Math.sin(t * 3) * 0.22; head.rotation.y = t * 1.4;
        if (pinJob) badges[pinJob].position.y = head.position.y + 0.95;
      }
    },
    debug: ctx => ({
      uiToast: (m: string, kind: 'info' | 'warn' = 'info') => ctx.hud.toast(m, kind),
      /** A moment card (the checks: one at a time, at the side). */
      uiMoment: (title: string, lines: string[] = []) => { ctx.hud.moment({ icon: '⭐', title, lines }); },
      uiMarkers: () => ({ job: pinJob, bay: bayGroup.visible ? { x: bayGroup.position.x, z: bayGroup.position.z, yaw: bayGroup.rotation.y } : null, pinColor: '#' + pinMat.color.getHexString(), focus: focus.visible, focusAt: focus.visible ? { x: focus.position.x, z: focus.position.z } : null, grey: focus.visible && grey, pin: pin.visible, pinAt: pin.visible ? { x: pin.position.x, z: pin.position.z } : null }),
    }),
  };
}
