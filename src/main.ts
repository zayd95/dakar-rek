import './ui/style.css';
import * as THREE from 'three';
import { Input } from './core/input';
import { GameState } from './core/state';
import { cityTimeAt, daylight } from './core/clock';
import { clamp, lerp, rng } from './core/rng';
import { loadSave, writeSave, clearSave, newSave } from './core/save';
import type { HubId } from './core/types';
import { HUB_IDS } from './core/types';
import { buildHub } from './world/builder';
import { ACTIONS, HUB_NAMES, travelLeg } from './world/content';
import type { Action, Collider, HubWorld, Interactable } from './world/types';
import { Character, PLAYER_OUTFIT } from './actors/character';
import { Crowd, DecorativeTraffic } from './actors/npc';
import { FollowCamera } from './actors/camera';
import { Hud, fcfa } from './ui/hud';
import { preloadAssets } from './actors/vehicles';
import { preloadWrestler, wrestlerReady, Wrestler, type Clip } from './actors/wrestler';
import { CAST, castById } from './social/cast';
import { Relations, PLAYER } from './social/relations';
import { BEATS, availableBeat, suggestion, applyChoice, type Beat } from './social/beats';
import { LambScene, SCENE_LABEL, type SceneKind } from './lamb/scenes';
import { EMOTES } from './lamb/poses';
import { ACCESSORIES, NGEMB_COLORS, NGEMB_PATTERNS, REVIEW_STATUS } from './lamb/look';

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

// ------------------------------------------------------------------ storage (guest save is device-local)
let store: Storage | null = null;
try { store = window.localStorage; store.getItem('x'); } catch { store = null; }

// ------------------------------------------------------------------ renderer and scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
} catch {
  document.getElementById('ui')!.innerHTML = '<div style="margin:30vh 20px;font:16px system-ui;color:#fff">WebGL indisponible sur cet appareil.</div>';
  throw new Error('WebGL unavailable');
}
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

type Quality = 'low' | 'medium' | 'high';
let quality: Quality = ((): Quality => { try { const q = store?.getItem('dakarrek.quality'); if (q === 'low' || q === 'medium' || q === 'high') return q; } catch { /* */ } return /Android|iPhone|iPad/i.test(navigator.userAgent) ? 'medium' : 'high'; })();
const QUAL = {
  low: { pr: 1, shadow: 0, crowd: 8, traffic: 3 },
  medium: { pr: 1.5, shadow: 1024, crowd: 12, traffic: 5 },
  high: { pr: 2, shadow: 2048, crowd: 16, traffic: 7 },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bd3f3);
scene.fog = new THREE.Fog(0x9bd3f3, 70, 340);
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 700);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true;
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60; sun.shadow.camera.far = 220; sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

function applyQuality() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUAL[quality].pr));
  renderer.shadowMap.enabled = QUAL[quality].shadow > 0; sun.castShadow = QUAL[quality].shadow > 0;
  if (QUAL[quality].shadow) { sun.shadow.mapSize.set(QUAL[quality].shadow, QUAL[quality].shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  try { store?.setItem('dakarrek.quality', quality); } catch { /* */ }
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 66 : 58; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);

// ------------------------------------------------------------------ game objects
const input = new Input(canvas);
const hud = new Hud(document.getElementById('ui')!, input);
const saved = loadSave(store);
const isNewGame = !saved;
const state = new GameState(saved ?? newSave());
const rel = new Relations(state.data);
const follow = new FollowCamera(camera);
const player = new Character(PLAYER_OUTFIT);
scene.add(player.group);
const pos = new THREE.Vector3();
let facing = 0, speed = 0;
let world: HubWorld | null = null;
let crowd: Crowd | null = null, traffic: DecorativeTraffic | null = null;
let castChars: { id: string; c: Character; x: number; z: number }[] = [];
let lambScene: LambScene | null = null;
let emoteT = 0;
const extra = new THREE.Group(); scene.add(extra);
let mode: 'play' | 'menu' | 'busy' | 'scene' = 'play';
let hourOverride: number | null = null;

const SKY: [number, number][] = [[0, 0x0a1330], [5, 0x0d1a3a], [6.2, 0xf6b27a], [8, 0x9bd3f3], [17, 0x9bd3f3], [18.8, 0xf08a5a], [20, 0x0d1a3a], [24, 0x0a1330]];
function skyAt(h: number): THREE.Color {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
    if (h >= h0 && h <= h1) return new THREE.Color(c0).lerp(new THREE.Color(c1), (h - h0) / (h1 - h0));
  }
  return new THREE.Color(SKY[0][1]);
}

function updateLighting(hour: number) {
  const d = daylight(hour), night = 1 - clamp(d * 3.2, 0, 1);
  const sky = skyAt(hour);
  (scene.background as THREE.Color).copy(sky); (scene.fog as THREE.Fog).color.copy(sky);
  hemi.intensity = 0.38 + 0.62 * d; hemi.color.set(0xdde8ff).lerp(new THREE.Color(0xfff4de), d);
  const a = clamp((hour - 6) / 13, 0, 1) * Math.PI;
  const night2 = hour < 6 || hour >= 19;
  const sd = night2 ? new THREE.Vector3(-0.3, 0.9, 0.2) : new THREE.Vector3(Math.cos(a) * 0.9, Math.max(0.25, Math.sin(a)), 0.35);
  sun.position.copy(pos).addScaledVector(sd.normalize(), 90); sun.target.position.copy(pos);
  sun.intensity = night2 ? 0.28 : 0.2 + 1.0 * d;
  sun.color.set(night2 ? 0x8aa4ff : d < 0.35 ? 0xffc48a : 0xfff6e8);
  if (world) {
    world.facadeMat.emissiveIntensity = night * 1.0;
    world.lamps.color.setScalar(lerp(0.45, 1, night));
  }
}

// ------------------------------------------------------------------ hubs
const rand = rng(Date.now() & 0xffff);

function loadHub(id: HubId, at?: { x: number; z: number; yaw: number }) {
  if (world) { scene.remove(world.group); world.dispose(); }
  extra.clear();
  world = buildHub(id);
  scene.add(world.group);
  crowd = new Crowd(world, rand, QUAL[quality].crowd); traffic = new DecorativeTraffic(world, rand, QUAL[quality].traffic);
  extra.add(crowd.group, traffic.group);
  // Recurring cast of this hub, standing at their places (PROVISIONAL cast, see src/social/cast.ts).
  castChars = [];
  for (const m of CAST.filter(c => c.hub === id)) {
    const anchor = world.interactables.find(i => i.id.includes(':' + m.anchor));
    if (!anchor) continue;
    const x = anchor.x + m.ox, z = anchor.z + m.oz;
    const c = new Character(m.outfit); c.group.position.set(x, 0.1, z); extra.add(c.group);
    castChars.push({ id: m.id, c, x, z });
    world.interactables.push({ id: 'npc:' + m.id, name: `${m.name} · ${m.title}`, kind: 'actions', x, z, radius: 3.2, actions: m.id === 'ibou' ? ACTIONS.ibou : CHAT, npc: m.id });
  }
  const p = at ?? world.spawn;
  pos.set(p.x, 0.1, p.z); facing = p.yaw; speed = 0;
  follow.snapBehind(facing);
  state.place(id, p.x, p.z, p.yaw);
  hud.setPlace(HUB_NAMES[id], '', false);
}

function pushOut(x: number, z: number, r: number, cols: Collider[]): [number, number] {
  for (const c of cols) {
    const cx = clamp(x, c.x0, c.x1), cz = clamp(z, c.z0, c.z1);
    let dx = x - cx, dz = z - cz; const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); x = cx + (dx / d) * r; z = cz + (dz / d) * r; }
    else { // centre inside the rectangle: exit by the nearest side
      const l = x - c.x0, rr = c.x1 - x, t = z - c.z0, b = c.z1 - z, m = Math.min(l, rr, t, b);
      if (m === l) x = c.x0 - r; else if (m === rr) x = c.x1 + r; else if (m === t) z = c.z0 - r; else z = c.z1 + r;
    }
  }
  return [x, z];
}

// ------------------------------------------------------------------ interactions
const CHAT: Action[] = [{ id: 'discuter', label: 'Discuter', detail: 'Prendre des nouvelles', needs: { social: 8, moral: 2 }, seconds: 2.5, counter: 'chats' }];
let nearest: Interactable | null = null;
function findNearest() {
  nearest = null; if (!world) return;
  let best = 1e9;
  for (const it of world.interactables) {
    const d = Math.hypot(it.x - pos.x, it.z - pos.z);
    if (d <= it.radius && d < best) { best = d; nearest = it; }
  }
}

function describe(a: Action): string {
  const parts: string[] = [];
  if (a.detail) parts.push(a.detail);
  return parts.join(' · ');
}

function openActions(it: Interactable) {
  mode = 'menu';
  const visible = it.actions.filter(a => !a.visible || a.visible(state));
  const items = visible.map(a => {
    const why = a.requires?.(state) ?? (a.cost && !state.canAfford(a.cost) ? 'Pas assez d’argent' : null);
    return { label: a.label, detail: why ?? describe(a), right: a.cost ? '−' + fcfa(a.cost) : a.gain ? '+' + fcfa(a.gain) : undefined, disabled: !!why, onPick: () => { hud.closeModal(); if (a.special) runSpecial(a); else runAction(a, it.npc); } };
  });
  let subtitle = 'Que veux-tu faire ?';
  if (it.npc) {
    const beat = availableBeat(it.npc, rel, state);
    if (beat) items.unshift({ label: '★ ' + beat.title, detail: 'Histoire', right: undefined, disabled: false, onPick: () => openBeat(beat) });
    const lv = rel.level(it.npc);
    subtitle = `Relation : ${Relations.label(lv)} (${lv > 0 ? '+' : ''}${Math.round(lv)})`;
  }
  hud.openMenu(it.name, subtitle, items);
}

function openBeat(beat: Beat) {
  const who = castById(beat.npc)!;
  mode = 'menu';
  hud.openMenu(`${who.name} — ${beat.title}`, beat.text, beat.choices.map(ch => ({
    label: ch.label, onPick: () => {
      const notes = applyChoice(beat, ch, rel, state);
      hud.openMenu(who.name, ch.reply, [{ label: 'Continuer', onPick: () => { hud.closeModal(); if (ch.effects.scene === 'celebration') startScene('celebration'); } }]);
      if (notes.length || ch.effects.money) hud.toast([...notes, ch.effects.money ? '+' + fcfa(ch.effects.money) : ''].filter(Boolean).join('  '));
      saveNow();
    },
  })));
}

function runSpecial(a: Action) {
  switch (a.special) {
    case 'training': startScene('training', () => { if (a.needs) state.adjust(a.needs); if (a.counter) state.count(a.counter); rel.change(PLAYER, 'ablaye', 1); hud.toast('Entraînement terminé ✓  Lutte ' + (state.data.counters.lutte ?? 0)); }); break;
    case 'entrance': startScene('entrance', () => { state.adjust({ moral: 10, social: 6 }); state.count('entrees'); }); break;
    case 'prep': startScene('prep'); break;
    case 'watch': startScene('watch', () => { if (a.needs) state.adjust(a.needs); }); break;
    case 'outfit': openOutfit(); break;
    case 'emote': openEmotes(); break;
  }
}

function startScene(kind: SceneKind, onDone?: () => void) {
  if (!world) return;
  hideProxy(); emoteT = 0; previewT = 0;
  const at = kind === 'training' || kind === 'celebration' ? world.ecurie : world.arena;
  if (!at) { hud.toast('Disponible à Pikine (arène et écurie)'); mode = 'play'; return; }
  hud.closeModal();
  mode = 'scene'; input.enabled = false;
  lambScene = new LambScene(kind, player, { x: at.cx, z: at.cz }, state.data.wrestler, quality === 'low' ? 14 : quality === 'medium' ? 20 : 26);
  lambScene.onDone = onDone;
  extra.add(lambScene.group);
  for (const n of castChars) n.c.group.visible = false; // the scene places its own cast
  hud.setScene(SCENE_LABEL[kind], 'Gestes, danse et rythmes provisoires · non validés');
}

function endScene() {
  if (!lambScene) return;
  const done = lambScene.onDone;
  extra.remove(lambScene.group); lambScene.dispose(); lambScene = null;
  hud.setScene(null); mode = 'play'; input.enabled = true;
  for (const n of castChars) n.c.group.visible = true;
  follow.snapBehind(facing);
  done?.(); saveNow();
}

function openOutfit() {
  mode = 'menu';
  const w = state.data.wrestler;
  const html = `<div class="draft">${REVIEW_STATUS} — couleurs, motifs et accessoires provisoires. Purement cosmétique : aucun effet sur les combats.</div>
    <h3>Ngemb · couleur</h3><div class="swatches" data-k="c">${NGEMB_COLORS.map(c => `<button data-v="${c.id}" class="${c.id === w.ngembColor ? 'on' : ''}"><i style="background:#${c.hex.toString(16).padStart(6, '0')}"></i>${c.label}</button>`).join('')}</div>
    <h3>Ngemb · motif</h3><div class="swatches" data-k="p">${NGEMB_PATTERNS.map(p => `<button data-v="${p.id}" class="${p.id === w.ngembPattern ? 'on' : ''}">${p.label}</button>`).join('')}</div>
    <h3>Accessoires (emplacements)</h3><div class="swatches" data-k="a">${ACCESSORIES.map(a => `<button data-v="${a.id}" class="${w.accessories.includes(a.id) ? 'on' : ''}">${a.label}</button>`).join('')}</div>`;
  hud.openMenu('Tenue de lutte', 'Aperçu sur ton personnage', [
    { label: 'Voir la tenue', detail: 'Aperçu en tenue de lutte', onPick: () => { hud.closeModal(); previewOutfit(); } },
  ], html, panel => {
    panel.querySelectorAll<HTMLElement>('.swatches').forEach(group => group.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.addEventListener('click', () => {
      const k = group.dataset.k, v = b.dataset.v!;
      if (k === 'c') w.ngembColor = v; else if (k === 'p') w.ngembPattern = v;
      else w.accessories = w.accessories.includes(v) ? w.accessories.filter(x => x !== v) : [...w.accessories, v];
      if (k === 'a') b.classList.toggle('on'); else { group.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); }
      saveNow();
    })));
  });
}

let previewT = 0;
/** Blender wrestler shown in place of the box player for outfit previews and emotes. */
let proxy: Wrestler | null = null;
function showProxy(clip: Clip) {
  if (!wrestlerReady()) { player.setWrestler(state.data.wrestler); return; }
  if (!proxy) { proxy = new Wrestler(PLAYER_OUTFIT.skin); extra.add(proxy.group); }
  const w = state.data.wrestler; proxy.setLook(w, w.ngembPattern === 'bordure' ? 'B' : 'A'); proxy.play(clip, 0.15);
  player.group.visible = false;
}
function hideProxy() { proxy?.dispose(); proxy = null; player.group.visible = true; player.setWrestler(null); }
function previewOutfit() { showProxy('Idle'); previewT = 6; hud.toast('Aperçu de la tenue (6 s)'); }
const EMOTE_CLIP: Record<string, Clip> = { pas1: 'Dance_A', pas2: 'Dance_B', fete: 'Celebrate' };

function openEmotes() {
  mode = 'menu';
  hud.openMenu('Mbakkou', 'Mouvements provisoires — les pas, noms et gestes seront validés avec des pratiquants.', EMOTES.map(e => ({
    label: e.label, detail: 'Non validé', onPick: () => { hud.closeModal(); playEmote(EMOTES.indexOf(e)); },
  })));
}

function playEmote(i: number) {
  const e = EMOTES[i]; emoteT = e.seconds;
  if (wrestlerReady()) showProxy(EMOTE_CLIP[e.id] ?? 'Idle'); else { player.setWrestler(state.data.wrestler); player.setPose(e.pose); }
}

function openJournal() {
  mode = 'menu';
  const met = CAST.filter(c => rel.level(c.id) !== 0 || BEATS.some(b => b.npc === c.id && rel.beatDone(b.id)));
  const next = suggestion(rel, state);
  const esc = (t: string) => t.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]!));
  const html = `<h3>Prochaine piste</h3><div class="kv">${next ? esc(next.hint) : 'Aucune pour l’instant.'}</div>
    <h3>Tes relations</h3><div class="rel">${met.length ? met.map(c => `<span>${esc(c.name)} · ${esc(c.title)}</span><em>${Relations.label(rel.level(c.id))}</em>`).join('') : '<span>Personne encore.</span><em></em>'}</div>
    <h3>Le quartier se connaît</h3><div class="rel">${rel.links().map(l => `<span>${esc(l.a)} ↔ ${esc(l.b)}</span><em>${esc(l.note)}</em>`).join('')}</div>
    <div class="draft">Personnages et histoires : brouillon à valider par Habib.</div>`;
  hud.openMenu('Carnet', `${Object.keys(state.data.beats).length} histoire(s) vécue(s)`, [], html);
}

function runAction(a: Action, npc?: string) {
  mode = 'busy'; input.enabled = false;
  const t0 = performance.now(), dur = a.seconds * 1000;
  hud.progress(true, 0, a.label);
  const tick = () => {
    const p = clamp((performance.now() - t0) / dur, 0, 1);
    hud.progress(true, p, a.label);
    if (p < 1) { requestAnimationFrame(tick); return; }
    hud.progress(false);
    if (a.cost) state.addMoney(-a.cost);
    if (a.gain) state.addMoney(a.gain);
    if (a.needs) state.adjust(a.needs);
    if (a.counter) state.count(a.counter);
    if (npc) rel.change(PLAYER, npc, 1);
    state.count('actions');
    const bits = [a.label + ' ✓'];
    if (a.gain) bits.push('+' + fcfa(a.gain)); if (a.cost) bits.push('−' + fcfa(a.cost));
    hud.toast(bits.join('  '));
    mode = 'play'; input.enabled = true; saveNow();
  };
  requestAnimationFrame(tick);
}

function openTravel() {
  if (!world) return;
  mode = 'menu';
  const here = world.id;
  const items = HUB_IDS.filter(h => h !== here).map(h => {
    const leg = travelLeg(here, h);
    const poor = !state.canAfford(leg.cost);
    return { label: HUB_NAMES[h], detail: poor ? 'Pas assez d’argent' : `≈ ${leg.minutes} min de route`, right: fcfa(leg.cost), disabled: poor, onPick: () => { hud.closeModal(); doTravel(h); } };
  });
  hud.openMenu('Car rapide', 'Où va-t-on ? Le trajet coûte de l’argent et un peu de fatigue.', items);
}

function doTravel(dest: HubId) {
  if (!world) return;
  const leg = travelLeg(world.id, dest);
  mode = 'busy'; input.enabled = false;
  hud.fade(true, '🚌 ' + HUB_NAMES[dest]);
  setTimeout(() => {
    state.addMoney(-leg.cost); state.tick(leg.minutes * 60000 * 0.15); state.count('trips');
    loadHub(dest);
    hud.fade(false);
    hud.toast('Arrivée : ' + HUB_NAMES[dest]);
    mode = 'play'; input.enabled = true; saveNow();
  }, 900);
}

function openSystem() {
  mode = 'menu';
  const c = state.data.counters;
  const kv = `<div class="kv">Temps de jeu : ${Math.floor(state.data.playedMs / 60000)} min · Repas : ${c.meals ?? 0} · Services : ${c.shifts ?? 0} · Forme : ${c.forme ?? 0} · Trajets : ${c.trips ?? 0}<br>Sauvegarde invité : sur cet appareil seulement (pas de compte).</div>
    <div class="seg" data-q>${(['low', 'medium', 'high'] as Quality[]).map(q => `<button data-q="${q}" class="${q === quality ? 'on' : ''}">${{ low: 'Qualité basse', medium: 'Moyenne', high: 'Haute' }[q]}</button>`).join('')}</div>`;
  hud.openMenu('Dakar Rek', 'Version de développement 0.1', [
    { label: 'Reprendre', onPick: () => hud.closeModal() },
    { label: 'Carnet', detail: 'Relations et prochaine piste', onPick: () => openJournal() },
    { label: 'Sauvegarder maintenant', onPick: () => { hud.toast(saveNow() ? 'Partie sauvegardée' : 'Sauvegarde impossible sur ce navigateur'); hud.closeModal(); } },
    { label: 'Nouvelle partie', detail: 'Efface la sauvegarde de cet appareil', onPick: () => { clearSave(store); location.reload(); } },
  ], kv, panel => {
    panel.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach(b => b.addEventListener('click', () => {
      quality = b.dataset.q as Quality; applyQuality(); if (world) loadHub(world.id, { x: pos.x, z: pos.z, yaw: facing }); hud.closeModal();
    }));
  });
}

function saveNow(): boolean { state.place(world!.id, pos.x, pos.z, facing); return writeSave(store, state.data); }

hud.onAction = () => { if (mode === 'play' && nearest) { if (nearest.kind === 'travel') openTravel(); else openActions(nearest); } };
hud.onMenu = () => { if (mode === 'play') openSystem(); };
new MutationObserver(() => { if (!hud.modalOpen && mode === 'menu') { mode = 'play'; input.enabled = true; } }).observe(document.getElementById('modal')!, { attributes: true });
addEventListener('visibilitychange', () => { if (document.hidden && world) saveNow(); });
addEventListener('pagehide', () => { if (world) saveNow(); });
setInterval(() => { if (world && mode === 'play') saveNow(); }, 8000);

// ------------------------------------------------------------------ main loop
let last = performance.now(), statsT = 0;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden || !world) return;

  if (input.takeMenu()) { if (hud.modalOpen) hud.closeModal(); else if (mode === 'play') openSystem(); }
  if (input.takeAction() && mode === 'play' && nearest) hud.onAction();

  const drag = input.takeDrag();
  drag.yaw += input.rotateKey() * dt * 1.8;
  if (lambScene) {
    const f = lambScene.update(dt);
    if (lambScene.snap) { camera.position.copy(f.cam); lambScene.snap = false; } else camera.position.lerp(f.cam, Math.min(1, dt * 3));
    camera.lookAt(f.look);
    if (lambScene.done) endScene();
  } else if (mode === 'play') {
    const m = input.move();
    const fx = Math.sin(follow.yaw), fz = Math.cos(follow.yaw), rx = -Math.cos(follow.yaw), rz = Math.sin(follow.yaw);
    const dx = fx * m.y + rx * m.x, dz = fz * m.y + rz * m.x;
    const mag = Math.min(1, Math.hypot(m.x, m.y));
    const target = 5.6 * mag;
    speed += (target - speed) * Math.min(1, dt * 12);
    if (mag > 0.05) {
      const want = Math.atan2(dx, dz);
      facing += Math.atan2(Math.sin(want - facing), Math.cos(want - facing)) * Math.min(1, dt * 14);
      let nx = pos.x + (dx / (Math.hypot(dx, dz) || 1)) * speed * dt, nz = pos.z + (dz / (Math.hypot(dx, dz) || 1)) * speed * dt;
      [nx, nz] = pushOut(nx, nz, 0.5, world.colliders);
      const b = world.bounds; nx = clamp(nx, b.x0, b.x1); nz = clamp(nz, b.z0, b.z1);
      pos.x = nx; pos.z = nz;
    } else speed *= 0.8;
    state.tick(dt * 1000);
  } else if (mode === 'busy') { state.tick(dt * 1000); speed = 0; }
  if (!lambScene) {
    if ((player.pose || proxy) && speed > 0.5) { player.setPose(null); emoteT = 0; previewT = 0; hideProxy(); }
    if (emoteT > 0) { emoteT -= dt; if (emoteT <= 0) { player.setPose(null); hideProxy(); } }
    if (previewT > 0) { previewT -= dt; if (previewT <= 0 && emoteT <= 0) hideProxy(); }
    if (proxy) { proxy.group.position.copy(pos); proxy.group.rotation.y = facing; proxy.update(dt); }
    player.group.position.copy(pos); player.group.rotation.y = facing; player.animate(dt, speed);
  } else player.animate(0, 0);
  for (const n of castChars) {
    const d = Math.hypot(pos.x - n.x, pos.z - n.z);
    if (d < 9) n.c.group.rotation.y = Math.atan2(pos.x - n.x, pos.z - n.z);
    n.c.animate(dt, 0);
  }
  crowd?.update(dt); traffic?.update(dt);
  findNearest();
  const beatHere = nearest?.npc ? availableBeat(nearest.npc, rel, state) : null;
  hud.setPrompt(mode === 'play' && nearest ? nearest.name : null, nearest?.kind === 'travel' ? 'Voyager' : beatHere ? '★ Histoire · Appuyer / E' : undefined);

  if (!lambScene) follow.update(dt, pos, facing, drag, world.colliders, innerHeight > innerWidth, speed > 0.5);
  const ct = cityTimeAt(Date.now()); const hour = hourOverride ?? ct.hourFloat;
  updateLighting(hour);
  statsT -= dt;
  if (statsT <= 0) { statsT = 0.25; hud.setStats(state.wallet, state.data.needs, state.mood()); const sg = suggestion(rel, state); hud.setGoal(mode === 'play' && sg ? sg.hint : null); hud.setPlace(HUB_NAMES[world.id], hourOverride === null ? ct.label : `Jour ${ct.day} · ${String(Math.floor(hour)).padStart(2, '0')}:00`, hour < 6 || hour >= 19); }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ start
resize(); applyQuality();
async function start() {
  await Promise.all([preloadAssets(), preloadWrestler()]);
  const startHub = state.data.hub;
  if (isNewGame || (state.data.x === 0 && state.data.z === 0)) loadHub(startHub);
  else loadHub(startHub, { x: state.data.x, z: state.data.z, yaw: state.data.yaw });
  if (isNewGame) hud.toast('Bienvenue à Pikine ! Tonton Ibou t’attend devant ta chambre.');
  requestAnimationFrame(frame);
}
void start();

if (DEBUG) {
  (window as unknown as Record<string, unknown>).__dakar = {
    state, hubs: HUB_IDS,
    teleport(hub: HubId, x?: number, z?: number, yaw = 0) { loadHub(hub, x === undefined ? undefined : { x, z: z ?? 0, yaw }); },
    setHour(h: number | null) { hourOverride = h; },
    pos: () => ({ x: pos.x, z: pos.z, hub: world?.id, mode, near: nearest?.name ?? null }),
    interactables: () => world?.interactables.map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z })) ?? [],
    lookYaw(y: number) { follow.yaw = y; },
    act() { hud.onAction(); },
    drawCalls: () => renderer.info.render.calls,
    tris: () => renderer.info.render.triangles,
    nearestInteractable: () => nearest?.name ?? null,
    travelTo: (h: HubId) => doTravel(h),
    rel, beats: () => ({ ...state.data.beats }), flags: () => [...state.data.flags],
    suggestion: () => suggestion(rel, state)?.id ?? null,
    playBeat(id: string, choice: string) { const b = BEATS.find(x => x.id === id)!; const c = b.choices.find(x => x.id === choice)!; return applyChoice(b, c, rel, state); },
    openNpc(id: string) { const it = world?.interactables.find(i => i.npc === id); if (it) openActions(it); },
    scene(kind: SceneKind) { const a = [...ACTIONS.arena, ...ACTIONS.ecurie].find(x => x.special === kind); if (a) runSpecial(a); else startScene(kind); },
    wrestlerReady: () => wrestlerReady(),
    faceCamera() { follow.yaw = facing + Math.PI; },
    sceneInfo: () => (lambScene ? { kind: lambScene.kind, t: lambScene.t } : null),
    scenePeek(t: number) { if (lambScene) { lambScene.t = t; lambScene.snap = true; } },
    outfit: () => openOutfit(), journal: () => openJournal(),
    emote(i = 0) { playEmote(i); },
    setLook(c: string, p: string, acc: string[]) { Object.assign(state.data.wrestler, { ngembColor: c, ngembPattern: p, accessories: acc }); },
    lookAtPlayer(dist = 4, yawOff = Math.PI) { follow.yaw = facing + yawOff; void dist; },
  };
}
