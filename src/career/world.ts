import * as THREE from 'three';
import type { GameCtx } from '../game/modules';
import type { HubWorld } from '../world/types';
import { WALL_R } from '../world/geew';
import { say } from '../i18n/wolof';
import { BILL } from '../arena/program';
import { WEEKDAY_FR, nextFightEvening } from '../arena/exteriorRules';
import type { BoutEntry, Rank } from './career';

/**
 * A fight night's result in the world (docs/CAREER.md): the arena's poster by the gate carries the player's last result
 * for the next evenings (or the gala's bill), people outside the gate talk about it once, and the rank change is said
 * when the player walks away from the arena. One plane and one small canvas texture, redrawn only when the text changes.
 */

/** City days a result stays on the poster and in people's mouths. */
export const NEWS_DAYS = 2;
const POSTER_W = 2.2, POSTER_H = 2.75, ANGLE = -0.5;

export interface PosterText { tag: string; title: string; line: string; foot: string }
/** What the poster says (pure, unit-tested): the player's recent result, else the gala's bill; the next fight evening. */
export function posterText(last: BoutEntry | null, name: string, today: number, hour: number): PosterText {
  const nx = nextFightEvening(today, hour);
  const when = nx.day === Math.floor(today) ? `ce soir, ${nx.hour} h` : `${WEEKDAY_FR[((nx.day % 7) + 7) % 7]} ${nx.hour} h`;
  const foot = `Prochain gala : ${when} · petits combats ouverts à tous`;
  if (last && last.res !== 'A' && today - last.day <= NEWS_DAYS) {
    if (last.res === 'V') return { tag: 'VAINQUEUR', title: name, line: `a battu ${last.opp} (${last.style}) · ${last.how}`, foot };
    if (last.res === 'D') return { tag: 'REVANCHE ?', title: last.opp, line: `a battu ${name} · ${last.how}`, foot };
    return { tag: 'MATCH NUL', title: `${name} – ${last.opp}`, line: 'égalité · la revanche est attendue', foot };
  }
  return { tag: 'GALA', title: `${BILL.left.name} – ${BILL.right.name}`, line: `Écuries ${BILL.left.ecurie} et ${BILL.right.ecurie}`, foot };
}

/** What someone outside the gate says about the player's recent bout (once per bout). */
export function crowdLine(last: BoutEntry): string {
  if (last.res === 'V') return `Un supporter : « ${say('Waaw kay')} ! C’est toi qui as battu ${last.opp} ? Tout Pikine en parle. »`;
  if (last.res === 'D') return `Un supporter : « ${last.opp} t’a eu cette fois. ${say('Ndank ndank')}, la revanche viendra. »`;
  return `Un supporter : « Match nul contre ${last.opp} ! Il faudra une revanche. »`;
}

function drawPoster(t: PosterText): HTMLCanvasElement {
  const cv = document.createElement('canvas'); cv.width = 400; cv.height = 500;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f2e3c2'; c.fillRect(0, 0, 400, 500);
  c.fillStyle = '#9b2a1f'; c.fillRect(0, 0, 400, 92);
  c.fillStyle = '#ffe7b0'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '900 30px system-ui, sans-serif'; c.fillText('LÀMB · ARÈNE DE PIKINE', 200, 48);
  c.fillStyle = '#1b2a7a'; c.fillRect(110, 118, 180, 40);
  c.fillStyle = '#ffe7b0'; c.font = '900 22px system-ui, sans-serif'; c.fillText(t.tag, 200, 139);
  c.fillStyle = '#1f1408';
  let size = 54; c.font = `900 ${size}px system-ui, sans-serif`;
  while (c.measureText(t.title.toUpperCase()).width > 370 && size > 26) { size -= 2; c.font = `900 ${size}px system-ui, sans-serif`; }
  c.fillText(t.title.toUpperCase(), 200, 220);
  c.font = '700 22px system-ui, sans-serif'; c.fillStyle = '#5a3a1a';
  wrap(c, t.line, 200, 290, 360, 28);
  c.fillStyle = '#9b2a1f'; c.fillRect(0, 400, 400, 100);
  c.fillStyle = '#ffe7b0'; c.font = '700 19px system-ui, sans-serif';
  wrap(c, t.foot, 200, 434, 370, 26);
  return cv;
}
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(' '); let line = '', yy = y;
  for (const w of words) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > max && line) { c.fillText(line, x, yy); line = w; yy += lh; } else line = t; }
  if (line) c.fillText(line, x, yy);
}

/** The poster, the crowd's line and the rank said on the way out, for one hub (rebuilt on every hub load). */
export class FightNews {
  private mesh: THREE.Mesh | null = null;
  private tex: THREE.CanvasTexture | null = null;
  private key = '';
  private t = 0;
  private said = -1;
  /** Rank change waiting to be said when the player walks away from the arena. */
  pending: { before: Rank; after: Rank; at: number } | null = null;
  constructor(private name: () => string) {}

  get text() { return this.key; }

  hubLoaded(ctx: GameCtx, w: HubWorld) {
    this.dispose();
    if (!w.arena) return;
    const { cx, cz } = w.arena, nx = Math.sin(ANGLE), nz = -Math.cos(ANGLE), r = WALL_R + 0.12;
    const x = cx + nx * r, z = cz + nz * r;
    this.tex = new THREE.CanvasTexture(document.createElement('canvas'));
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, emissive: 0xffffff, emissiveMap: this.tex, emissiveIntensity: 0.18 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(POSTER_W, POSTER_H), mat);
    this.mesh.position.set(x, w.heightAt(x, z) + 2.05, z); this.mesh.rotation.y = Math.atan2(nx, nz);
    this.mesh.name = 'career:poster';
    ctx.extra.add(this.mesh);
    this.key = '';
  }

  /** Every frame: redraw the poster when its text changes, say the crowd's line by the gate, say the rank on the way out. */
  update(ctx: GameCtx, dt: number, last: BoutEntry | null) {
    this.t += dt;
    const w = ctx.world(); if (!w?.arena || !this.mesh || !this.tex) return;
    const day = ctx.day(), hour = ctx.hour();
    if (this.t > 1.5 || !this.key) {
      this.t = 0;
      const p = posterText(last, this.name(), day, hour);
      const key = [p.tag, p.title, p.line, p.foot].join('|');
      if (key !== this.key) { this.key = key; this.tex.image = drawPoster(p); this.tex.needsUpdate = true; }
    }
    if (ctx.inside() || ctx.mode() !== 'play') return;
    const pos = ctx.player.pos, d = Math.hypot(pos.x - w.arena.cx, pos.z - w.arena.cz);
    // people outside the gate know the result (once per bout)
    if (last && last.res !== 'A' && day - last.day <= NEWS_DAYS && last.at !== this.said && ctx.state.data.playedMs - last.at > 8000 && d > WALL_R && d < WALL_R + 14) {
      this.said = last.at; ctx.toast(crowdLine(last));
    }
    // the rank, said once the player walks away from the arena after the bout
    const pend = this.pending;
    if (pend && ctx.state.data.playedMs - pend.at > 3000 && d > WALL_R + 8) {
      this.pending = null;
      const delta = pend.after.score - pend.before.score;
      const move = pend.after.rung > pend.before.rung ? `nouveau palier : ${pend.after.label}` : pend.after.rung < pend.before.rung ? `recul : ${pend.after.label}` : pend.after.label;
      ctx.toast(`Classement · ${move} · ${pend.after.score} pts (${delta >= 0 ? '+' : '−'}${Math.abs(delta)})${pend.after.next ? `  Prochain palier : ${pend.after.next.label}` : ''}`);
    }
  }

  dispose() {
    if (this.mesh) { this.mesh.removeFromParent(); this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
    this.tex?.dispose();
    this.mesh = null; this.tex = null;
  }
}
