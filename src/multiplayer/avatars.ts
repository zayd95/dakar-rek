import * as THREE from 'three';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { Character, PLAYER_OUTFIT } from '../actors/character';
import type { PresenceClient } from './client';
import type { Peer } from './protocol';

export const SHIRT_COLORS = [0x1a9d54, 0x2f6fb3, 0xd9482b, 0xf4c20d, 0x6b3fa0, 0xf2f2ec];
export function avatarLook(index: number): PersonLook { return { skin: 0x6b3f25, style: 'tee', top: SHIRT_COLORS[index] ?? SHIRT_COLORS[0], accent: 0xf4c20d, pattern: 'uni', bottom: 0x3d4a5c, shoes: 0xf2f2ec }; }
interface Avatar { body: Humanoid | Character; name: THREE.Sprite; texture: THREE.CanvasTexture; look: number; label: string; rec: string; h: number }

/** Only the nearest visible players get an animated body; peers outside the view remain lightweight state. */
export class RemoteAvatars {
  readonly group = new THREE.Group();
  private avatars = new Map<string, Avatar>();
  /** Peers the local player blocked (chat module): their avatar is not drawn on this device. */
  hidden: (peer: Peer) => boolean = () => false;
  constructor(private presence: PresenceClient) { this.group.name = 'remote_players'; }
  update(dt: number, local: THREE.Vector3, space: string, maxBodies: number, camera: THREE.PerspectiveCamera, viewportHeight: number) {
    // Keep names at 28 screen pixels even when an indoor camera is close to another player.
    const labelHeight = 56 / (Math.max(1, viewportHeight) * camera.projectionMatrix.elements[5]);
    const visible = [...this.presence.peers.values()]
      .filter(p => p.space === space && space !== 'home' && space !== 'scene' && Math.hypot(p.x - local.x, p.z - local.z) < 110 && !this.hidden(p))
      .sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z)).slice(0, maxBodies);
    const keep = new Set(visible.map(p => p.id));
    for (const [id, avatar] of this.avatars) if (!keep.has(id)) { this.drop(avatar); this.avatars.delete(id); }
    for (const peer of visible) {
      let a = this.avatars.get(peer.id);
      if (a && (a.look !== peer.look || a.label !== peer.name || a.rec !== (peer.rec ?? ''))) { this.drop(a); this.avatars.delete(peer.id); a = undefined; }
      if (!a) { a = this.make(peer); this.avatars.set(peer.id, a); this.group.add(a.body.group); }
      const target = new THREE.Vector3(peer.x, peer.y, peer.z);
      if (a.body.group.position.distanceTo(target) > 12) a.body.group.position.copy(target);
      else a.body.group.position.lerp(target, 1 - Math.exp(-dt * 12));
      const yaw = a.body.group.rotation.y;
      a.body.group.rotation.y += Math.atan2(Math.sin(peer.yaw - yaw), Math.cos(peer.yaw - yaw)) * (1 - Math.exp(-dt * 12));
      if (a.body instanceof Humanoid) a.body.hold = peer.clip;
      a.body.animate(dt, peer.speed);
      a.name.visible = Math.hypot(peer.x - local.x, peer.z - local.z) < 35;
      a.name.scale.set(labelHeight * 256 / 48, labelHeight * a.h / 48, 1);
    }
  }
  /** Rendered body of a peer (chat bubbles follow it), or null when the peer is not drawn. */
  bodyOf(id: string): THREE.Object3D | null { return this.avatars.get(id)?.body.group ?? null; }
  clear() { for (const a of this.avatars.values()) this.drop(a); this.avatars.clear(); }
  get size() { return this.avatars.size; }
  /** The clip each drawn peer's body is playing (checks: a peer lying on a bed is drawn lying). */
  poses(): Record<string, string | null> { return Object.fromEntries([...this.avatars].map(([id, a]) => [id, a.body instanceof Humanoid ? a.body.clipName : null])); }
  private make(peer: Peer): Avatar {
    const body = humanoidReady() ? new Humanoid(avatarLook(peer.look)) : new Character({ ...PLAYER_OUTFIT, top: SHIRT_COLORS[peer.look] });
    body.group.name = `player:${peer.id}`; body.group.position.set(peer.x, peer.y, peer.z);
    // name, and under it the public sporting record when the player has one (« Undercards · 3-1 · Écurie Baobab »)
    const rec = peer.rec ?? '', h = rec ? 74 : 48;
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = h;
    const c = canvas.getContext('2d')!;
    c.fillStyle = 'rgba(8, 20, 32, .85)'; c.beginPath(); c.roundRect(0, 0, 256, h, 14); c.fill();
    c.fillStyle = '#6ee7b7'; c.font = '600 22px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(peer.name, 128, 24, 238);
    if (rec) { c.fillStyle = '#fde68a'; c.font = '600 16px system-ui'; c.fillText(rec, 128, 54, 240); }
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const name = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false }));
    name.position.y = rec ? 2.45 : 2.35; body.group.add(name);
    return { body, name, texture, look: peer.look, label: peer.name, rec, h };
  }
  private drop(a: Avatar) {
    a.name.removeFromParent(); a.name.material.dispose(); a.texture.dispose();
    if (a.body instanceof Humanoid) {
      // Humanoid creates Lambert materials for these plain outfits; untouched Standard materials
      // and all geometry belong to the GLTF template. Skeleton textures belong to this clone.
      const materials = new Set<THREE.Material>(), skeletons = new Set<THREE.Skeleton>();
      a.body.group.traverse(o => { const m = o as THREE.SkinnedMesh;
        if (m.isMesh) for (const mat of Array.isArray(m.material) ? m.material : [m.material]) if (mat instanceof THREE.MeshLambertMaterial) materials.add(mat);
        if (m.isSkinnedMesh) skeletons.add(m.skeleton);
      });
      for (const mat of materials) mat.dispose(); for (const skeleton of skeletons) skeleton.dispose();
      a.body.dispose();
    }
    else { a.body.group.removeFromParent(); a.body.group.traverse(o => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.geometry.dispose(); for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose(); } }); }
  }
}
