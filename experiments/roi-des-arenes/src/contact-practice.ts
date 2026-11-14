import * as THREE from 'three';
import { Locomotion, type MovingStudy } from './locomotion';

// Held input has independent owners; a pointer release cannot release Space.
export class ContactHold {
  private owners = new Set<string>();
  get held() { return this.owners.size > 0; }
  press(owner: string) { this.owners.add(owner); }
  release(owner: string) { this.owners.delete(owner); }
  clear() { this.owners.clear(); }
}

// Original generic distance exercise. No sporting rule or finished grip animation.
export class ContactPractice {
  readonly player: Locomotion;
  readonly opponent: Locomotion;
  readonly enterDistance = 1.0;
  readonly breakDistance = 1.25;
  active = false;
  private awaitNeutral = false;

  constructor(player: MovingStudy, opponent: MovingStudy) {
    this.player = new Locomotion(player);
    this.opponent = new Locomotion(opponent);
    this.player.obstacle = { position: opponent.root.position, radius: .72 };
    this.reset();
  }

  get distance() {
    return this.player.study.root.position.clone().sub(this.opponent.study.root.position).setY(0).length();
  }

  reset() {
    this.active = false;
    this.awaitNeutral = true;
    this.player.place(new THREE.Vector3(0, 0, 1.15), Math.PI);
    this.opponent.place(new THREE.Vector3(0, 0, -.65), 0);
  }

  cancel() {
    this.active = false;
    this.awaitNeutral = true;
    this.player.halt();
  }

  update(dt: number, direction: THREE.Vector3, held: boolean) {
    // After release/cancel/reset require neutral movement before accepting travel.
    if (this.active && (!held || this.distance > this.breakDistance)) this.cancel();
    if (this.awaitNeutral && !held && direction.lengthSq() === 0) this.awaitNeutral = false;
    if (!this.awaitNeutral && held && this.distance <= this.enterDistance) this.active = true;
    if (this.active || this.awaitNeutral) this.player.halt();
    else this.player.setInput(direction);
    this.player.update(dt);
    // Entry is checked again after travel; suspension begins in this same update.
    if (!this.awaitNeutral && held && this.distance <= this.enterDistance) {
      this.active = true;
      this.player.halt();
    }
  }

  dispose() {
    this.cancel();
    this.player.obstacle = undefined;
    this.player.restore();
    this.opponent.restore();
  }

  inspect() {
    return { active: this.active, distance: this.distance, ready: this.distance <= this.enterDistance,
      awaitNeutral: this.awaitNeutral, enterDistance: this.enterDistance, breakDistance: this.breakDistance,
      player: this.player.inspect(), opponent: this.opponent.inspect() };
  }
}
