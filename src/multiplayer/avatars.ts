import * as THREE from 'three';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { Character, PLAYER_OUTFIT } from '../actors/character';
import type { PresenceClient } from './client';
import type { PresenceClip } from './protocol';
import type { EmotePresence, Peer } from './protocol';
import { EMOTE_INFO, EMOTE_SHOW_MS, RECEIVE_GAP_MS, emoteChanged, shownHere } from './social';
import { buildVehicle } from '../actors/vehicleKit';
import { COLORS, OUTFITS, SKINS, decodeAppearance, type Appearance } from '../actors/appearance';
import type { Avatar as Identity } from '../core/types';

export const SHIRT_COLORS = [0x1a9d54, 0x2f6fb3, 0xd9482b, 0xf4c20d, 0x6b3fa0, 0xf2f2ec];
export function avatarLook(index: number): PersonLook { return { skin: 0x6b3f25, style: 'tee', top: SHIRT_COLORS[index] ?? SHIRT_COLORS[0], accent: 0xf4c20d, pattern: 'uni', bottom: 0x3d4a5c, shoes: 0xf2f2ec }; }
/**
 * Another player's studio look on the shared standard body (v4): their complexion, garment colour and print, trousers, the femme's shape, and their hairstyle
 * or headwear as near as v4 has it. Other players are not drawn with the Meshy bodies (their memory and draw cost, many at once); this is the same person, recognisable.
 */
export function appearanceLook(body: Identity, a: Appearance): PersonLook {
  const female = body === 'femme', o = OUTFITS[a.outfit], top = COLORS[a.color].hex;
  const look: PersonLook = { skin: SKINS[a.skin].hex, style: 'tee', top, accent: 0xf3ead6, pattern: o.print === 'stripe' ? 'rayure' : o.print === 'print' ? 'wax' : 'uni',
    bottom: o.bottom ?? (female ? 0x22344f : 0x1d2230), shoes: 0xf2f2ec, female, hair: female ? 'puff' : 'short', beard: female ? null : 0x16100d };
  if (a.hair === 'shaved') look.hair = 'none';
  if (a.hair === 'afro' || a.hair === 'puff') look.hair = 'puff';
  if (a.hair === 'wrap') { look.hat = 'headwrap'; look.hatColor = top; }
  if (a.hair === 'kufi') { look.hat = 'kufi'; look.hatColor = 0xeee7d6; }
  return look;
}
/** How a peer is drawn: their studio look when the server relayed it, else the shirt colour of their profile. */
export function peerLook(peer: Pick<Peer, 'look' | 'app'>): PersonLook {
  const d = decodeAppearance(peer.app);
  return d ? appearanceLook(d.body, d.look) : avatarLook(peer.look);
}
interface Glyph { sprite: THREE.Sprite; texture: THREE.CanvasTexture; until: number; clip: PresenceClip; t0: number }
interface Avatar { body: Humanoid | Character; name: THREE.Sprite; texture: THREE.CanvasTexture; look: number; app: string; label: string; rec: string; h: number; bike?: THREE.Group; glyph?: Glyph; lastEmoteAt: number }

/** Only the nearest visible players get an animated body; peers outside the view remain lightweight state. */
export class RemoteAvatars {
  readonly group = new THREE.Group();
  private avatars = new Map<string, Avatar>();
  /** Peers the local player blocked (chat module): their avatar is not drawn on this device. */
  hidden: (peer: Peer) => boolean = () => false;
  /** Dresses a drawn peer's body from their presence fields every frame (the écurie colours: src/arena/supporterGear.ts). */
  dress: (body: Humanoid, peer: Peer) => void = () => {};
  /** A greeting or reaction from a player nearby was just shown (src/multiplayer/social.ts): main tells the player it was meant for them. */
  onEmote: (peer: Peer, emo: EmotePresence) => void = () => {};
  /** The last emote counter seen per peer: only a change is a new emote, never the first value met (no replay for someone arriving). */
  private emoSeen = new Map<string, number>();
  constructor(private presence: PresenceClient) { this.group.name = 'remote_players'; }
  update(dt: number, local: THREE.Vector3, space: string, maxBodies: number, camera: THREE.PerspectiveCamera, viewportHeight: number) {
    // Keep names at 28 screen pixels even when an indoor camera is close to another player.
    const labelHeight = 56 / (Math.max(1, viewportHeight) * camera.projectionMatrix.elements[5]);
    const visible = [...this.presence.peers.values()]
      .filter(p => p.space === space && space !== 'home' && space !== 'scene' && Math.hypot(p.x - local.x, p.z - local.z) < 110 && !this.hidden(p))
      .sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z)).slice(0, maxBodies);
    const keep = new Set(visible.map(p => p.id));
    for (const id of this.emoSeen.keys()) if (!this.presence.peers.has(id)) this.emoSeen.delete(id);
    for (const [id, avatar] of this.avatars) if (!keep.has(id)) { this.drop(avatar); this.avatars.delete(id); }
    for (const peer of visible) {
      let a = this.avatars.get(peer.id);
      if (a && (a.look !== peer.look || a.app !== (peer.app ?? '') || a.label !== peer.name || a.rec !== (peer.rec ?? ''))) { this.drop(a); this.avatars.delete(peer.id); a = undefined; }
      if (!a) { a = this.make(peer); this.avatars.set(peer.id, a); this.group.add(a.body.group); }
      const target = new THREE.Vector3(peer.x, peer.y, peer.z);
      if (a.body.group.position.distanceTo(target) > 12) a.body.group.position.copy(target);
      else a.body.group.position.lerp(target, 1 - Math.exp(-dt * 12));
      const yaw = a.body.group.rotation.y;
      a.body.group.rotation.y += Math.atan2(Math.sin(peer.yaw - yaw), Math.cos(peer.yaw - yaw)) * (1 - Math.exp(-dt * 12));
      this.emote(a, peer, local, space);
      const now = performance.now(), gesture = a.glyph && a.glyph.until > now && (peer.clip === 'Idle' || peer.clip === 'Talk') ? a.glyph.clip : null;   // a seated, lying or riding player keeps their pose
      if (a.body instanceof Humanoid) a.body.hold = gesture ?? peer.clip;
      if (a.glyph) this.glyphFrame(a, now, labelHeight);
      // astride a motorbike: others see the bike under the rider (the Ride pose alone would show someone floating)
      if (peer.clip === 'Ride' && !a.bike) { a.bike = buildVehicle('moto', { seed: 7, driver: false, passengers: false }).group; this.group.add(a.bike); }
      else if (peer.clip !== 'Ride' && a.bike) { this.disposeBike(a); }
      if (a.bike) { a.bike.position.set(a.body.group.position.x, 0.12, a.body.group.position.z); a.bike.rotation.y = a.body.group.rotation.y; }
      a.body.animate(dt, peer.speed);
      if (a.body instanceof Humanoid) this.dress(a.body, peer);
      a.name.visible = Math.hypot(peer.x - local.x, peer.z - local.z) < 35;
      a.name.scale.set(labelHeight * 256 / 48, labelHeight * a.h / 48, 1);
    }
  }
  /** Shows a new emote of this peer (a glyph over the head, a short gesture) when it is close enough to be seen and not too soon after the last. */
  private emote(a: Avatar, peer: Peer, local: THREE.Vector3, space: string) {
    const emo = peer.emo;
    if (!emoteChanged(this.emoSeen, peer.id, emo) || !emo) return;          // no new emote (nor one already there when the peer was first seen)
    const now = performance.now();
    if (now - a.lastEmoteAt < RECEIVE_GAP_MS || !shownHere(peer, { x: local.x, z: local.z, space })) return;
    a.lastEmoteAt = now;
    const info = EMOTE_INFO[emo.k];
    if (a.glyph) this.dropGlyph(a);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 96;
    const c = canvas.getContext('2d')!;
    c.fillStyle = 'rgba(8, 20, 32, .85)'; c.beginPath(); c.arc(48, 48, 44, 0, Math.PI * 2); c.fill();
    c.font = '54px system-ui, "Apple Color Emoji", "Noto Color Emoji", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(info.glyph, 48, 52);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, sizeAttenuation: false }));
    sprite.position.y = 2.95; sprite.renderOrder = 6; a.body.group.add(sprite);
    a.glyph = { sprite, texture, until: now + EMOTE_SHOW_MS, clip: info.clip, t0: now };
    this.onEmote(peer, emo);
  }
  private glyphFrame(a: Avatar, now: number, labelHeight: number) {
    const g = a.glyph!; if (now >= g.until) { this.dropGlyph(a); return; }
    const k = (now - g.t0) / 1000, pop = Math.min(1, k * 6), fade = Math.min(1, (g.until - now) / 400);
    g.sprite.scale.set(labelHeight * 1.3 * pop, labelHeight * 1.3 * pop, 1); g.sprite.position.y = 2.95 + 0.06 * Math.sin(k * 5);
    g.sprite.material.opacity = fade;
  }
  private dropGlyph(a: Avatar) {
    if (!a.glyph) return;
    a.glyph.sprite.removeFromParent(); a.glyph.sprite.material.dispose(); a.glyph.texture.dispose(); a.glyph = undefined;
  }
  /** Rendered body of a peer (chat bubbles follow it), or null when the peer is not drawn. */
  bodyOf(id: string): THREE.Object3D | null { return this.avatars.get(id)?.body.group ?? null; }
  clear() { for (const a of this.avatars.values()) this.drop(a); this.avatars.clear(); this.emoSeen.clear(); }
  get size() { return this.avatars.size; }
  /** Peers drawn on a bike (checks). */
  get bikes() { return [...this.avatars.values()].filter(a => a.bike).length; }
  /** The clip each drawn peer's body is playing (checks: a peer lying on a bed is drawn lying). */
  poses(): Record<string, string | null> { return Object.fromEntries([...this.avatars].map(([id, a]) => [id, a.body instanceof Humanoid ? a.body.clipName : null])); }
  /** The emote glyph each drawn peer shows now (checks): its kind of glyph, or null. */
  glyphs(): Record<string, string | null> { return Object.fromEntries([...this.avatars].map(([id, a]) => [id, a.glyph ? 'on' : null])); }
  /** What each drawn peer's body wears in an écurie's colours ('baobab:scarf'…; null: nothing), for the checks. */
  gear(): Record<string, string | null> { return Object.fromEntries([...this.avatars].map(([id, a]) => [id, (a.body.group.userData.fan as string | null | undefined) ?? null])); }
  private make(peer: Peer): Avatar {
    const body = humanoidReady() ? new Humanoid(peerLook(peer)) : new Character({ ...PLAYER_OUTFIT, top: SHIRT_COLORS[peer.look] });
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
    return { body, name, texture, look: peer.look, app: peer.app ?? '', label: peer.name, rec, h, lastEmoteAt: -Infinity };
  }
  private disposeBike(a: Avatar) {
    if (!a.bike) return;
    a.bike.removeFromParent();
    a.bike.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); for (const mat of Array.isArray(m.material) ? m.material : [m.material]) mat.dispose(); } });
    a.bike = undefined;
  }
  private drop(a: Avatar) {
    this.dropGlyph(a);
    this.disposeBike(a);
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
