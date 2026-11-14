import * as THREE from 'three';

export type MovingStudy = { root: THREE.Group; body: THREE.SkinnedMesh; rest: Map<THREE.Bone, THREE.Quaternion>; restPositions: Map<THREE.Bone, THREE.Vector3> };
type Leg = { thigh: THREE.Bone; shin: THREE.Bone; foot: THREE.Bone; lengthA: number; lengthB: number;
  offset: THREE.Vector3; planted: THREE.Vector3; from: THREE.Vector3; to: THREE.Vector3;
  footRotation: THREE.Quaternion; plantedRotation: THREE.Quaternion; fromRotation: THREE.Quaternion; toRotation: THREE.Quaternion; progress: number; soleVertices: number[] };
const up = new THREE.Vector3(0, 1, 0);

// Generic original walking study; no inherited animation or sporting stance.
export class Locomotion {
  readonly velocity = new THREE.Vector3();
  readonly radius = 2.6;
  speed = 0;
  obstacle?: { position: THREE.Vector3; radius: number };
  private legs: Leg[];
  private hips: THREE.Bone;
  private hipRest: THREE.Vector3;
  private nextLeg = 0;
  private distance = 0;
  private ankleHeight: number;
  private input = new THREE.Vector3();

  constructor(readonly study: MovingStudy) {
    study.rest.forEach((q, b) => b.quaternion.copy(q));
    study.restPositions.forEach((p, b) => b.position.copy(p));
    study.root.updateMatrixWorld(true);
    this.hips = study.root.getObjectByName('Hips') as THREE.Bone;
    this.hipRest = study.restPositions.get(this.hips)!.clone();
    const rotation = study.root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const positions = study.body.geometry.getAttribute('position');
    const joints = study.body.geometry.getAttribute('skinIndex');
    const weights = study.body.geometry.getAttribute('skinWeight');
    this.legs = ['Left', 'Right'].map(side => {
      const thigh = study.root.getObjectByName(side + 'UpLeg') as THREE.Bone;
      const shin = study.root.getObjectByName(side + 'Leg') as THREE.Bone;
      const foot = study.root.getObjectByName(side + 'Foot') as THREE.Bone;
      const p = foot.getWorldPosition(new THREE.Vector3());
      const offset = study.root.worldToLocal(p.clone()).multiplyScalar(study.root.scale.x);
      const soleVertices: number[] = [];
      for (let i = 0; i < positions.count; i++) {
        let coverage = 0;
        for (let c = 0; c < 4; c++) {
          if ([side + 'Foot', side + 'ToeBase'].includes(study.body.skeleton.bones[joints.getComponent(i, c)].name)) coverage += weights.getComponent(i, c);
        }
        if (coverage > .7 && positions.getY(i) < .026) soleVertices.push(i);
      }
      const footRotation = foot.getWorldQuaternion(new THREE.Quaternion());
      return { thigh, shin, foot, lengthA: thigh.getWorldPosition(new THREE.Vector3()).distanceTo(shin.getWorldPosition(new THREE.Vector3())),
        lengthB: shin.getWorldPosition(new THREE.Vector3()).distanceTo(p), offset, planted: p.clone(), from: p.clone(), to: p.clone(),
        footRotation: rotation.clone().multiply(footRotation), plantedRotation: footRotation.clone(), fromRotation: footRotation.clone(), toRotation: footRotation.clone(), progress: 1, soleVertices };
    });
    this.ankleHeight = this.legs[0].planted.y;
  }

  restore() {
    this.study.rest.forEach((q, b) => b.quaternion.copy(q));
    this.study.restPositions.forEach((p, b) => b.position.copy(p));
    this.study.root.position.set(0, 0, 0);
    this.study.root.rotation.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.input.set(0, 0, 0);
    this.nextLeg = 0;
    this.distance = 0;
    this.speed = 0;
    this.study.root.updateMatrixWorld(true);
    this.legs.forEach(leg => {
      leg.planted.copy(leg.foot.getWorldPosition(new THREE.Vector3()));
      leg.from.copy(leg.planted); leg.to.copy(leg.planted); leg.progress = 1;
      leg.plantedRotation.copy(leg.foot.getWorldQuaternion(new THREE.Quaternion()));
      leg.fromRotation.copy(leg.plantedRotation); leg.toRotation.copy(leg.plantedRotation);
    });
    this.study.body.skeleton.update();
  }

  reset() {
    this.restore();
    this.update(.001);
  }

  // Rigid placement of the whole walking rig, including world-space foot plans.
  place(position: THREE.Vector3, heading: number) {
    const obstacle = this.obstacle;
    this.obstacle = undefined;
    this.reset();
    this.obstacle = obstacle;
    const turn = new THREE.Quaternion().setFromAxisAngle(up, heading);
    this.study.root.position.copy(position);
    this.study.root.rotation.y = heading;
    this.legs.forEach(leg => {
      for (const p of [leg.planted, leg.from, leg.to]) p.applyQuaternion(turn).add(position);
      for (const q of [leg.plantedRotation, leg.fromRotation, leg.toRotation]) q.premultiply(turn);
    });
    this.study.root.updateMatrixWorld(true);
    this.study.body.skeleton.update();
  }

  halt() {
    this.input.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.speed = 0;
  }

  setInput(direction: THREE.Vector3) {
    this.input.copy(direction);
    if (this.input.lengthSq() > 1) this.input.normalize();
  }

  private neutral(leg: Leg) {
    const p = leg.offset.clone().applyAxisAngle(up, this.study.root.rotation.y).add(this.study.root.position);
    p.y = this.ankleHeight;
    return p;
  }

  private rotateTo(bone: THREE.Bone, child: THREE.Bone, target: THREE.Vector3) {
    bone.updateWorldMatrix(true, true);
    const origin = bone.getWorldPosition(new THREE.Vector3());
    const current = child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
    const desired = target.clone().sub(origin).normalize();
    const world = bone.getWorldQuaternion(new THREE.Quaternion());
    const turn = new THREE.Quaternion().setFromUnitVectors(current, desired);
    const parent = bone.parent!.getWorldQuaternion(new THREE.Quaternion()).invert();
    bone.quaternion.copy(parent.multiply(turn.multiply(world)));
    bone.updateWorldMatrix(false, true);
  }

  private solve(leg: Leg, target: THREE.Vector3) {
    const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
    const direction = target.clone().sub(hip);
    const reach = THREE.MathUtils.clamp(direction.length(), Math.abs(leg.lengthA - leg.lengthB) + .001, leg.lengthA + leg.lengthB - .001);
    direction.normalize();
    const pole = new THREE.Vector3(0, 0, 1).applyAxisAngle(up, this.study.root.rotation.y);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const along = (leg.lengthA ** 2 + reach ** 2 - leg.lengthB ** 2) / (2 * reach);
    const bend = Math.sqrt(Math.max(0, leg.lengthA ** 2 - along ** 2));
    const knee = hip.clone().addScaledVector(direction, along).addScaledVector(pole, bend);
    const ankle = hip.clone().addScaledVector(direction, reach);
    this.rotateTo(leg.thigh, leg.shin, knee);
    this.rotateTo(leg.shin, leg.foot, ankle);
    leg.foot.quaternion.copy(leg.foot.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(leg.plantedRotation));
    leg.foot.updateWorldMatrix(false, true);
  }

  update(dt: number) {
    // Fixed upper substep controls solver quality while elapsed time drives travel.
    const steps = Math.max(1, Math.ceil(dt * 120));
    for (let i = 0; i < steps; i++) this.step(dt / steps);
  }

  private step(dt: number) {
    const root = this.study.root;
    this.velocity.lerp(this.input.clone().multiplyScalar(1.1), 1 - Math.exp(-8 * dt));
    if (this.velocity.length() < .006 && this.input.lengthSq() === 0) this.velocity.set(0, 0, 0);
    const before = root.position.clone();
    const beforeHeading = root.rotation.y;
    root.position.addScaledVector(this.velocity, dt);
    root.position.x = THREE.MathUtils.clamp(root.position.x, -this.radius, this.radius);
    root.position.z = THREE.MathUtils.clamp(root.position.z, -this.radius, this.radius);
    if (this.obstacle) {
      const away = root.position.clone().sub(this.obstacle.position).setY(0);
      if (away.length() < this.obstacle.radius) {
        if (away.lengthSq() < 1e-10) away.copy(before).sub(this.obstacle.position).setY(0);
        if (away.lengthSq() < 1e-10) away.set(0, 0, 1);
        away.normalize();
        root.position.copy(this.obstacle.position).addScaledVector(away, this.obstacle.radius).setY(before.y);
        const inward = this.velocity.dot(away);
        if (inward < 0) this.velocity.addScaledVector(away, -inward);
      }
    }
    if (this.velocity.length() > .025) {
      const angle = Math.atan2(this.velocity.x, this.velocity.z);
      const difference = Math.atan2(Math.sin(angle - root.rotation.y), Math.cos(angle - root.rotation.y));
      root.rotation.y += THREE.MathUtils.clamp(difference, -5 * dt, 5 * dt);
    }
    this.study.rest.forEach((q, b) => b.quaternion.copy(q));
    this.hips.position.copy(this.hipRest);
    this.hips.position.y -= .09;
    root.updateMatrixWorld(true);
    // Stay within the planted support leg's reach while a turn/step completes.
    // Restrict root travel instead of silently substituting a floating ankle.
    for (let pass = 0; pass < 3; pass++) {
      this.legs.forEach(leg => {
        if (leg.progress < 1) return;
        const hip = leg.thigh.getWorldPosition(new THREE.Vector3());
        const vertical = hip.y - leg.planted.y;
        const radius = Math.sqrt(Math.max(0, (leg.lengthA + leg.lengthB - .006) ** 2 - vertical ** 2));
        const delta = hip.sub(leg.planted).setY(0);
        const length = delta.length();
        if (length > radius) {
          root.position.addScaledVector(delta.normalize(), radius - length);
          root.position.x = THREE.MathUtils.clamp(root.position.x, -this.radius, this.radius);
          root.position.z = THREE.MathUtils.clamp(root.position.z, -this.radius, this.radius);
          root.updateMatrixWorld(true);
        }
      });
    }
    // Support correction can conflict with the obstacle on a reversing turn.
    // Reject that proposed root transform BEFORE planning/solving feet, retaining
    // the last accepted stance rather than moving solved feet after the fact.
    if (this.obstacle && root.position.clone().sub(this.obstacle.position).setY(0).length() < this.obstacle.radius - 1e-9) {
      root.position.copy(before);
      root.rotation.y = beforeHeading;
      this.velocity.set(0, 0, 0);
      root.updateMatrixWorld(true);
    }
    const moved = root.position.distanceTo(before);
    const speed = moved / dt;
    this.speed = speed;
    this.distance += moved;
    const swinging = this.legs.some(leg => leg.progress < 1);
    if (!swinging) {
      const restError = (l: Leg) => this.neutral(l).distanceTo(l.planted);
      if (restError(this.legs[1 - this.nextLeg]) > restError(this.legs[this.nextLeg]) + .04) this.nextLeg = 1 - this.nextLeg;
      const leg = this.legs[this.nextLeg];
      const other = this.legs[1 - this.nextLeg];
      // At rest, settle each foot under the hips; at a boundary, no endless gait.
      if (restError(leg) > .12 || (speed > .08 && restError(leg) > .02)) {
        leg.from.copy(leg.planted);
        leg.to.copy(this.neutral(leg));
        if (speed > .08) {
          const predicted = root.position.clone().addScaledVector(this.velocity, .38);
          predicted.x = THREE.MathUtils.clamp(predicted.x, -this.radius, this.radius);
          predicted.z = THREE.MathUtils.clamp(predicted.z, -this.radius, this.radius);
          leg.to.add(predicted.sub(root.position));
        }
        leg.to.y = this.ankleHeight;
        const separation = leg.to.clone().sub(other.planted).setY(0);
        if (separation.length() > .6) {
          leg.to.copy(other.planted).add(separation.setLength(.6));
          leg.to.y = this.ankleHeight;
        }
        leg.progress = 0;
        leg.fromRotation.copy(leg.plantedRotation);
        leg.toRotation.copy(root.getWorldQuaternion(new THREE.Quaternion())).multiply(leg.footRotation);
        this.nextLeg = 1 - this.nextLeg;
      } else if (restError(other) > .12) this.nextLeg = 1 - this.nextLeg;
    }
    this.legs.forEach(leg => {
      if (leg.progress < 1) {
        leg.progress = Math.min(1, leg.progress + dt / .28);
        const t = leg.progress;
        leg.planted.copy(leg.from).lerp(leg.to, t * t * (3 - 2 * t));
        leg.planted.y += Math.sin(Math.PI * t) * .07;
        leg.plantedRotation.copy(leg.fromRotation).slerp(leg.toRotation, t * t * (3 - 2 * t));
      }
      this.solve(leg, leg.planted);
    });
    // Opposing restrained arm swing, based on actual distance rather than time.
    const swing = Math.sin(this.distance * Math.PI / .6) * Math.min(speed, 1) * .22;
    for (const [side, sign] of [['Left', 1], ['Right', -1]] as const) {
      const arm = root.getObjectByName(side + 'Arm') as THREE.Bone;
      const fore = root.getObjectByName(side + 'ForeArm') as THREE.Bone;
      const hand = root.getObjectByName(side + 'Hand') as THREE.Bone;
      const origin = arm.getWorldPosition(new THREE.Vector3());
      const direction = new THREE.Vector3(sign * .23, -1, sign * swing).applyAxisAngle(up, root.rotation.y);
      this.rotateTo(arm, fore, origin.add(direction));
      const elbow = fore.getWorldPosition(new THREE.Vector3());
      this.rotateTo(fore, hand, elbow.add(new THREE.Vector3(sign * .10, -1, .12).applyAxisAngle(up, root.rotation.y)));
    }
    root.updateMatrixWorld(true);
    this.study.body.skeleton.update();
  }

  inspect() {
    const body = this.study.body;
    const point = new THREE.Vector3();
    return { position: this.study.root.position.toArray(), speed: this.speed, velocitySpeed: this.velocity.length(), heading: this.study.root.rotation.y,
      input: this.input.toArray(), distance: this.distance, boundary: this.radius,
      feet: this.legs.map(leg => {
        const sole = new THREE.Vector3(); let minY = Infinity;
        leg.soleVertices.forEach(i => {
          body.getVertexPosition(i, point); body.localToWorld(point);
          sole.add(point); minY = Math.min(minY, point.y);
        });
        sole.divideScalar(leg.soleVertices.length);
        return { swinging: leg.progress < 1, ankleTarget: leg.planted.toArray(), actualAnkle: leg.foot.getWorldPosition(new THREE.Vector3()).toArray(),
          reachError: leg.foot.getWorldPosition(new THREE.Vector3()).distanceTo(leg.planted), actualSoleCentre: sole.toArray(), actualSoleMinY: minY, sampledVertices: leg.soleVertices.length };
      }) };
  }
}
