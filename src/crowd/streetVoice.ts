import * as THREE from 'three';
import { callTexture } from '../transport/vehicle';

/**
 * What the street shouts, as speech bubbles over the people who say it (a few at a time, each for a couple of seconds): the same bubble as the VTC passengers' and the car rapide
 * apprentice's (src/transport/vehicle.ts callTexture). A person speaking has one bubble; a new line replaces the old; past `max` the oldest goes.
 */
export class StreetVoice {
  private live: { id: string; s: THREE.Sprite; t: number }[] = [];
  constructor(private parent: THREE.Object3D, private max = 3) {}

  get count() { return this.live.length; }
  /** Lines being shown (the checks). */
  get lines() { return this.live.map(l => ({ id: l.id, text: (l.s.userData.text as string) ?? '' })); }

  say(id: string, text: string, seconds = 2.4) {
    let l = this.live.find(x => x.id === id);
    if (!l) {
      if (this.live.length >= this.max) this.drop(this.live[0]);
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: callTexture(text), depthWrite: false, transparent: true }));
      s.scale.set(1.7, 0.55, 1); s.renderOrder = 8; s.visible = false;
      this.parent.add(s); l = { id, s, t: seconds }; this.live.push(l);
    } else { (l.s.material as THREE.SpriteMaterial).map?.dispose(); (l.s.material as THREE.SpriteMaterial).map = callTexture(text); (l.s.material as THREE.SpriteMaterial).needsUpdate = true; l.t = seconds; }
    l.s.userData.text = text;
  }
  /** One frame: each bubble follows its speaker (`where` gives their head, or null when they are gone) and fades out when its time is up. */
  update(dt: number, where: (id: string) => { x: number; y: number; z: number } | null) {
    for (const l of [...this.live]) {
      l.t -= dt; const p = where(l.id);
      if (l.t <= 0 || !p) { this.drop(l); continue; }
      l.s.visible = true; l.s.position.set(p.x, p.y, p.z);
      (l.s.material as THREE.SpriteMaterial).opacity = Math.min(1, l.t / 0.4);
    }
  }
  private drop(l: { id: string; s: THREE.Sprite }) {
    l.s.removeFromParent(); const m = l.s.material as THREE.SpriteMaterial; m.map?.dispose(); m.dispose();
    this.live = this.live.filter(x => x !== l);
  }
  dispose() { for (const l of [...this.live]) this.drop(l); }
}
