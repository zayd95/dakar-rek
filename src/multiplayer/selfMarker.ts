import * as THREE from 'three';

/**
 * 1.0.1 — « which one is me? ». A small gold crown over the LOCAL player's own character while other players are drawn around: one sprite, drawn at a
 * constant size on screen, on this device only (nothing is sent: the others never see it). Hidden when the player is alone, so a solo street stays clean.
 */
export class SelfMarker {
  readonly sprite: THREE.Sprite;
  private texture: THREE.CanvasTexture;
  constructor() {
    const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 48;
    const c = canvas.getContext('2d');
    if (c) {
      c.lineJoin = 'round'; c.lineWidth = 5; c.strokeStyle = 'rgba(60, 36, 0, .9)'; c.fillStyle = '#fbbf24';
      c.beginPath(); c.moveTo(8, 40); c.lineTo(5, 13); c.lineTo(20, 25); c.lineTo(32, 6); c.lineTo(44, 25); c.lineTo(59, 13); c.lineTo(56, 40); c.closePath(); c.stroke(); c.fill();
      c.fillStyle = '#fff7d6'; for (const [x, y] of [[5, 12], [32, 6], [59, 12]]) { c.beginPath(); c.arc(x, y, 3.2, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#b45309'; c.fillRect(10, 33, 44, 4);
    }
    this.texture = new THREE.CanvasTexture(canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true, sizeAttenuation: false }));
    this.sprite.name = 'self_marker'; this.sprite.renderOrder = 7; this.sprite.center.set(0.5, 0); this.sprite.visible = false;
  }
  /** Per frame: over the player's head (`top`: the height of the head above `pos`), 20 px high whatever the camera's distance; `show` false hides it. */
  update(pos: THREE.Vector3, top: number, show: boolean, camera: THREE.PerspectiveCamera, viewportHeight: number) {
    this.sprite.visible = show;
    if (!show) return;
    this.sprite.position.set(pos.x, pos.y + top, pos.z);
    const h = 40 / (Math.max(1, viewportHeight) * camera.projectionMatrix.elements[5]);
    this.sprite.scale.set(h * 64 / 48, h, 1);
  }
}
