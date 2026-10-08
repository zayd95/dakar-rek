import * as THREE from 'three';
import { Batch } from '../world/batch';
import { campaignAt, refreshCampaigns, type AdSlot } from './campaigns';

function artwork(slot: AdSlot): THREE.CanvasTexture {
  const ad = campaignAt(slot), cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = ad?.background ?? '#123f39'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = ad?.foreground ?? '#fff1ce';
  ctx.font = 'bold 27px sans-serif'; ctx.fillText(ad ? 'PUBLICITÉ · ' + ad.sponsor : 'ANNONCES · DAKAR REK', 48, 62, 928);
  ctx.font = 'bold 64px sans-serif'; ctx.fillText(ad?.headline ?? 'Votre marque ici', 48, 174, 928);
  ctx.font = '32px sans-serif';
  const message = ad?.message ?? (slot === 'pikine-arena' ? 'Un emplacement au cœur de l’arène.' : 'Un emplacement au cœur du quartier.');
  const words = message.split(/\s+/); let line = '', y = 254;
  for (const word of words) {
    const next = line ? line + ' ' + word : word;
    if (ctx.measureText(next).width > 928 && line) { ctx.fillText(line, 48, y, 928); y += 45; line = word; }
    else line = next;
  }
  ctx.fillText(line, 48, y, 928);
  ctx.font = 'bold 25px sans-serif'; ctx.fillText(ad ? 'SPONSORISÉ · APPROCHEZ POUR EN SAVOIR PLUS' : 'EMPLACEMENT PUBLICITAIRE DISPONIBLE', 48, 462, 928);
  const texture = new THREE.CanvasTexture(cv); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One small board per neighbourhood plus an arena sponsor board. */
export function createBillboard(slot: AdSlot, x: number, z: number, yaw = 0) {
  const group = new THREE.Group(); group.position.set(x, 0, z); group.rotation.y = yaw;
  const b = new Batch();
  for (const dx of [-2, 2]) b.box(0.14, 4.6, 0.14, dx, 0, 0, 0x435552);
  b.box(5.25, 2.75, 0.16, 0, 2.35, 0, 0x435552);
  const frame = b.build(new THREE.MeshLambertMaterial({ vertexColors: true }), true, false); if (frame) group.add(frame);
  const mat = new THREE.MeshLambertMaterial({ map: artwork(slot), emissive: 0xffffff, emissiveIntensity: 0 });
  mat.emissiveMap = mat.map;
  const face = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), mat); face.position.set(0, 3.725, 0.09); group.add(face);
  let shown = campaignAt(slot), elapsed = 1;
  return {
    group, face,
    tick(dt: number) {
      elapsed += dt; if (elapsed < 1) return; elapsed = 0;
      void refreshCampaigns();
      const next = campaignAt(slot);
      if (next === shown) return;
      shown = next; mat.map?.dispose(); mat.map = artwork(slot); mat.emissiveMap = mat.map; mat.needsUpdate = true;
    },
    dispose() { mat.map?.dispose(); },
  };
}
