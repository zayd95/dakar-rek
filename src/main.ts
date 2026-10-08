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
import { Sky } from './world/sky';
import { setGrainEnabled } from './world/grain';
import { buildInterior, disposeInterior, setInteriorDaylight, type Interior } from './world/interiors';
import { ACTIONS, HUB_NAMES, travelLeg } from './world/content';
import type { Action, Collider, HubWorld, Interactable } from './world/types';
import { Character, PLAYER_OUTFIT } from './actors/character';
import { Crowd, DecorativeTraffic } from './actors/npc';
import { MonumentLife } from './actors/life';
import { Apprentice } from './actors/apprenti';
import { FollowCamera } from './actors/camera';
import { Hud, fcfa } from './ui/hud';
import { preloadAssets } from './actors/vehicles';
import { preloadHumanoid, humanoidReady, Humanoid, lookFromOutfit, randomLook, type Clip, type PersonLook } from './actors/humanoid';
import { CAST, castById } from './social/cast';
import { Relations, PLAYER } from './social/relations';
import { BEATS, availableBeat, suggestion, applyChoice, type Beat } from './social/beats';
import { LambScene, SCENE_LABEL, type SceneKind } from './lamb/scenes';
import { LambDuel } from './lamb/duel';
import { EMOTES } from './lamb/poses';
import { ACCESSORIES, NGEMB_COLORS, NGEMB_PATTERNS, REVIEW_STATUS } from './lamb/look';
import { PresenceClient, loadProfile } from './multiplayer/client';
import { RemoteAvatars, avatarLook } from './multiplayer/avatars';
import { PresenceUi } from './multiplayer/ui';
import { isHub, MAX_ROOMS_PER_HUB, PRESENCE_CLIPS, type PresenceClip } from './multiplayer/protocol';
import { Economy } from './economy/ui';

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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
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
scene.fog = new THREE.Fog(0x9bd3f3, 60, 300);
const camera = new THREE.PerspectiveCamera(58, 1, 0.3, 700);
const sky = new Sky(); scene.add(sky.mesh);
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a60, 0.9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1); sun.castShadow = true;
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60; sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60; sun.shadow.camera.far = 220; sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);
/** Ceiling light of the interior the player is in. Only in the scene while indoors: outdoors every surface would pay for it. */
const roomLight = new THREE.PointLight(0xffd9a0, 0, 9, 1.6);

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
const presence = new PresenceClient(loadProfile(store, state.data.guestId), import.meta.env.VITE_MULTIPLAYER === 'true', import.meta.env.VITE_PRESENCE_URL);
const remoteAvatars = new RemoteAvatars(presence); scene.add(remoteAvatars.group);
const rel = new Relations(state.data);
const follow = new FollowCamera(camera);
const player = new Character(PLAYER_OUTFIT);
scene.add(player.group);
const pos = new THREE.Vector3();
const tmpV = new THREE.Vector3();
let facing = 0, speed = 0;
let world: HubWorld | null = null;
let crowd: Crowd | null = null, traffic: DecorativeTraffic | null = null, life: MonumentLife | null = null;
let apprentices: Apprentice[] = [];
/** Ambient people placed by the hub builder (dibiterie cook, customers…). */
let ambient: Humanoid[] = [];
/** Debug-only fixed camera (screenshots of landmarks). */
let freeCam: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
let castChars: { id: string; c: { group: THREE.Group; animate(dt: number, speed: number): void }; h?: Humanoid; x: number; z: number }[] = [];
/** Player's visible body: the Blender humanoid when loaded (the box Character stays as the logic stand-in). */
const PLAYER_LOOK: PersonLook = avatarLook(presence.profile.look);
let playerBody: Humanoid | null = null;
const debugPeople: Humanoid[] = [];
const dbgRand = rng(42);
const randomLookDbg = () => randomLook(dbgRand);
let lambScene: LambScene | LambDuel | null = null;
let emoteT = 0;
const extra = new THREE.Group(); scene.add(extra);
let mode: 'play' | 'menu' | 'busy' | 'scene' = 'play';
let hourOverride: number | null = null;
/** Walkable interiors of this hub, and the one the player is in. */
let interiors = new Map<string, Interior>();
let inside: { int: Interior; door: Interactable } | null = null;
/** Debug only: fixed camera offset from the player (front portraits for visual review). */
let camOverride: { dist: number; h: number; side: number } | null = null;
const invitedHub = isHub(params.get('hub')) ? params.get('hub') as HubId : null;
const roomParam = Number(params.get('room'));
const invitedRoom = Number.isInteger(roomParam) && roomParam >= 1 && roomParam <= MAX_ROOMS_PER_HUB ? roomParam : null;
const presenceUi = new PresenceUi(presence, hud, store, () => world?.id ?? null, profile => { Object.assign(PLAYER_LOOK, avatarLook(profile.look)); playerBody?.setLook(PLAYER_LOOK); }, () => { mode = 'menu'; input.enabled = false; });
presence.onChange = () => { presenceUi.update(); if (!presence.count) remoteAvatars.clear(); };
// Lot B economy (src/economy/*): Tiak Tiak deliveries, wallet history, starter-room furniture, phone hooks. Device-local.
const economy = new Economy({ state, hud, scene, menu: () => { mode = 'menu'; }, save: () => !!world && saveNow(), refreshHome: () => refreshHomeInteriors() });
function presenceSpace() { return lambScene ? 'scene' : inside ? inside.door.id.includes(':home:') ? 'home' : inside.door.id : 'street'; }

const sunDir = new THREE.Vector3();
function updateLighting(hour: number) {
  const d = daylight(hour), night = 1 - clamp(d * 3.2, 0, 1);
  const low = 1 - clamp((d - 0.05) / 0.4, 0, 1);              // 1 near sunrise/sunset, 0 at midday
  // Sun path: rises in the east (+x), sets over the ocean (-x), leaning south (+z) so facades get raking light.
  const a = clamp((hour - 6) / 13, 0, 1) * Math.PI;
  const isNight = hour < 6 || hour >= 19;
  sunDir.set(Math.cos(a) * 0.85, Math.sin(a) * 0.95, 0.42).normalize();
  sky.update(hour, sunDir, isNight ? 0 : 1, camera.position);
  (scene.background as THREE.Color).copy(sky.horizon); (scene.fog as THREE.Fog).color.copy(sky.horizon);
  (scene.fog as THREE.Fog).near = isNight ? 40 : 60; (scene.fog as THREE.Fog).far = isNight ? 240 : 320;
  // Moonlight at night: cool, from high up, so streets still read.
  const ld = isNight ? new THREE.Vector3(-0.35, 0.85, 0.3).normalize() : new THREE.Vector3(sunDir.x, Math.max(0.22, sunDir.y), sunDir.z).normalize();
  sun.position.copy(pos).addScaledVector(ld, 90); sun.target.position.copy(pos);
  sun.intensity = isNight ? 0.55 : 0.8 + 1.5 * d;
  sun.color.set(isNight ? 0x9fb4ff : 0xfff1dc).lerp(new THREE.Color(0xffa45c), isNight ? 0 : low * 0.85);
  hemi.intensity = isNight ? 0.75 : 0.7 + 0.35 * d;
  hemi.color.copy(isNight ? new THREE.Color(0x5a6ea8) : sky.zenith.clone().lerp(new THREE.Color(0xffffff), 0.55));
  hemi.groundColor.set(isNight ? 0x2a2620 : 0x9a7a52);
  renderer.toneMappingExposure = isNight ? 1.3 : 1.0;
  if (inside) {
    // indoors: the sun only comes through the shutters; the ceiling light does the work
    sun.intensity *= 0.25; hemi.intensity = isNight ? 0.35 : 0.55; hemi.color.set(0xfff2e0); hemi.groundColor.set(0x6a5a48);
    setInteriorDaylight(sky.horizon.clone().lerp(new THREE.Color(0xffffff), isNight ? 0 : 0.5).multiplyScalar(isNight ? 0.5 : 1.1));
    roomLight.position.copy(inside.int.light); roomLight.color.set(inside.int.lightColor); roomLight.intensity = isNight ? 9 : 6;
  } else roomLight.intensity = 0;
  if (world) {
    world.facadeMat.emissiveIntensity = night * 1.25;
    world.lamps.color.setScalar(lerp(0.45, 1, night));
    world.lampGlow.visible = night > 0.3;
    for (const m of world.signs) (m.material as THREE.MeshLambertMaterial).emissiveIntensity = night * 0.45;
  }
}

// ------------------------------------------------------------------ hubs
const rand = rng(Date.now() & 0xffff);

function loadHub(id: HubId, at?: { x: number; z: number; yaw: number }) {
  for (const a of apprentices) a.dispose();          // detach them before the hub geometry is freed
  apprentices = [];
  for (const h of ambient) h.dispose();
  ambient = [];
  if (world) { scene.remove(world.group); world.dispose(); }
  setGrainEnabled(quality !== 'low');                     // procedural surface noise is the main per-pixel cost
  extra.clear();
  world = buildHub(id, quality === 'low');
  scene.add(world.group);
  crowd = new Crowd(world, rand, QUAL[quality].crowd); traffic = new DecorativeTraffic(world, rand, QUAL[quality].traffic);
  extra.add(crowd.group, traffic.group);
  apprentices = humanoidReady() ? world.rapides.map(car => { const a = new Apprentice(id, rand); a.attach(car); return a; }) : [];
  for (const car of traffic.rapides()) { if (!humanoidReady()) break; const a = new Apprentice(id, rand, true); a.attach(car); apprentices.push(a); }
  if (humanoidReady()) for (const p of world.people) {
    const h = new Humanoid(randomLook(rand)); h.hold = p.clip;
    h.group.position.set(p.x, 0.1 + (p.y ?? 0), p.z); h.group.rotation.y = p.yaw;
    extra.add(h.group); ambient.push(h);
  }
  life?.dispose(); life = world.monument ? new MonumentLife(world.monument, rand, QUAL[quality].crowd) : null;
  if (life) extra.add(life.group);
  // Recurring cast of this hub, standing at their places (PROVISIONAL cast, see src/social/cast.ts).
  castChars = [];
  for (const m of CAST.filter(c => c.hub === id)) {
    const anchor = world.interactables.find(i => i.id.includes(':' + m.anchor));
    if (!anchor) continue;
    const x = anchor.x + m.ox, z = anchor.z + m.oz;
    const h = humanoidReady() ? new Humanoid(lookFromOutfit(m.outfit, m.female)) : undefined;
    const c = h ?? new Character(m.outfit); c.group.position.set(x, 0.1, z); extra.add(c.group);
    castChars.push({ id: m.id, c, h, x, z });
    world.interactables.push({ id: 'npc:' + m.id, name: `${m.name} · ${m.title}`, kind: 'actions', x, z, radius: 3.2, actions: m.id === 'ibou' ? ACTIONS.ibou : CHAT, npc: m.id });
  }
  economy.decorateHub(world);
  interiors = new Map(); inside = null; follow.indoor = false; scene.remove(roomLight);
  doorSeq++; hud.fade(false);                            // cancel a door transition still fading
  let n = 0;
  for (const it of world.interactables) {
    const kind = it.id.includes(':home:') ? 'home' : it.id.includes(':gargote:') ? 'gargote' : it.id.includes(':maiga:') ? 'maiga' : null;
    if (!kind) continue;
    const int = buildInterior(kind, 1000 + n * 40, 0, it.name, id, kind === 'home' ? state.data.furniture : []); n++;
    world.group.add(int.group); int.group.visible = false; interiors.set(it.id, int);
  }
  const requested = at ?? world.spawn, bounds = world.bounds;
  const p = requested.x >= bounds.x0 && requested.x <= bounds.x1 && requested.z >= bounds.z0 && requested.z <= bounds.z1 ? requested : world.spawn;
  pos.set(p.x, 0.1, p.z); facing = p.yaw; speed = 0;
  follow.snapBehind(facing);
  state.place(id, p.x, p.z, p.yaw);
  hud.setPlace(HUB_NAMES[id], '', false);
  remoteAvatars.clear(); presence.join(id, id === invitedHub ? invitedRoom : null);
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
  for (const it of inside ? inside.int.interactables : world.interactables) {
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
    case 'combat': startDuel(); break;
    case 'outfit': openOutfit(); break;
    case 'emote': openEmotes(); break;
    case 'enter': if (nearest) enterInterior(nearest); break;
    case 'exit': exitInterior(); break;
    case 'jobs': economy.openJobs(nearest ?? undefined); break;
    case 'shop': economy.openShop(); break;
  }
}

/** Hide the street (and its crowd) while indoors: nothing outside is visible and it saves draw calls. */
function showStreet(on: boolean) {
  if (!world) return;
  const rooms = new Set<THREE.Object3D>([...interiors.values()].map(i => i.group));
  for (const c of world.group.children) c.visible = on || rooms.has(c);
  for (const int of interiors.values()) int.group.visible = !on && inside?.int === int;
  extra.visible = on;
}

/** Bumped on every door transition and hub load: a fade that finishes late never applies to a newer state. */
let doorSeq = 0;
function enterInterior(door: Interactable) {
  const int = interiors.get(door.id); if (!int) return;
  const seq = ++doorSeq;
  hud.fade(true, door.name);
  setTimeout(() => {
    if (seq !== doorSeq) return;
    inside = { int, door }; follow.indoor = true; showStreet(false); scene.add(roomLight);
    pos.set(int.spawn.x, 0.1, int.spawn.z); facing = int.spawn.yaw; speed = 0; follow.snapBehind(facing);
    hud.fade(false); mode = 'play'; input.enabled = true;
  }, 350);
}
/** Rebuild the starter room after a furniture purchase; the player stays where they stand. */
function refreshHomeInteriors() {
  if (!world) return;
  for (const [doorId, int] of interiors) {
    if (int.kind !== 'home') continue;
    const fresh = buildInterior('home', (int.bounds.x0 + int.bounds.x1) / 2, (int.bounds.z0 + int.bounds.z1) / 2, int.name, world.id, state.data.furniture);
    fresh.group.visible = int.group.visible;
    world.group.remove(int.group); disposeInterior(int); world.group.add(fresh.group); interiors.set(doorId, fresh);
    if (inside?.int === int) inside.int = fresh;
  }
}
function exitInterior() {
  if (!inside) return;
  const d = inside.door;
  const seq = ++doorSeq;
  hud.fade(true, HUB_NAMES[world!.id]);
  setTimeout(() => {
    if (seq !== doorSeq) return;
    inside = null; follow.indoor = false; showStreet(true); scene.remove(roomLight);
    pos.set(d.x, 0.1, d.z); speed = 0; follow.snapBehind(facing);
    hud.fade(false); mode = 'play'; input.enabled = true; saveNow();
  }, 350);
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

/** Controlled bout in the arena against a local opponent (provisional rules, no strikes). */
function startDuel() {
  if (!world?.arena) { hud.toast('Les combats ont lieu à l’arène de Pikine'); mode = 'play'; return; }
  hideProxy(); emoteT = 0; previewT = 0;
  hud.closeModal();
  mode = 'scene';
  const wins = state.data.counters.victoires ?? 0;
  const duel = new LambDuel({ x: world.arena.cx, z: world.arena.cz }, state.data.wrestler, input, quality === 'low' ? 12 : quality === 'medium' ? 18 : 24, Math.min(1.35, 0.85 + wins * 0.08));
  duel.onDone = () => {
    state.adjust({ energie: -22, hygiene: -12, faim: -8 });
    state.count('combats');
    if (duel.winner === 'player') { state.count('victoires'); state.adjust({ moral: 14, social: 6 }); rel.change(PLAYER, 'ablaye', 2); hud.toast(`Victoire ! (${(state.data.counters.victoires ?? 0)} au total)`); }
    else { state.adjust({ moral: -4 }); hud.toast('Défaite. Coach Ablaye : « On retourne à l’entraînement. »'); }
  };
  lambScene = duel;
  extra.add(duel.group);
  for (const n of castChars) n.c.group.visible = false;
  hud.setScene('Combat · làmb', 'Lutte sans frappe · règles provisoires, à valider par des lutteurs');
}

function endScene() {
  if (!lambScene) return;
  const done = lambScene.onDone;
  extra.remove(lambScene.group); lambScene.dispose(); lambScene = null;
  hud.setScene(null); mode = 'play'; input.enabled = true;
  for (const n of castChars) n.c.group.visible = true;
  if (playerBody) player.group.visible = false;
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
/** Wrestling attire and emotes shown on the player's Blender body (box character fallback). */
let proxy = false;
function showProxy(clip: Clip) {
  if (!playerBody) { player.setWrestler(state.data.wrestler); return; }
  const w = state.data.wrestler; playerBody.setWrestler(w, w.ngembPattern === 'bordure' ? 'B' : 'A'); playerBody.hold = clip; proxy = true;
}
function hideProxy() {
  if (playerBody && proxy) { playerBody.setLook(PLAYER_LOOK); playerBody.hold = null; }
  proxy = false; player.setWrestler(null);
}
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
  if (playerBody) showProxy(EMOTE_CLIP[e.id] ?? 'Idle'); else { player.setWrestler(state.data.wrestler); player.setPose(e.pose); }
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
    if (a.cost) state.addMoney(-a.cost, a.label);
    if (a.gain) state.addMoney(a.gain, a.label);
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
    state.addMoney(-leg.cost, 'Car rapide → ' + HUB_NAMES[dest]); state.tick(leg.minutes * 60000 * 0.15); state.count('trips');
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
    { label: 'Argent et maison', detail: 'Portefeuille, livraisons Tiak Tiak, meubles', onPick: () => economy.openWallet() },
    { label: 'Sauvegarder maintenant', onPick: () => { hud.toast(saveNow() ? 'Partie sauvegardée' : 'Sauvegarde impossible sur ce navigateur'); hud.closeModal(); } },
    { label: 'Nouvelle partie', detail: 'Efface la sauvegarde de cet appareil', onPick: () => { clearSave(store); location.reload(); } },
  ], kv, panel => {
    panel.querySelectorAll<HTMLButtonElement>('button[data-q]').forEach(b => b.addEventListener('click', () => {
      const roomId = inside?.door.id, roomPosition = inside ? pos.clone() : null;
      const at = { x: inside ? inside.door.x : pos.x, z: inside ? inside.door.z : pos.z, yaw: facing };
      quality = b.dataset.q as Quality; applyQuality();
      if (world) {
        loadHub(world.id, at);
        // Rebuild at the street doorway, then restore the room without leaking its off-map coordinates.
        const door = roomId ? world.interactables.find(i => i.id === roomId) : undefined;
        const int = door ? interiors.get(door.id) : undefined;
        if (door && int && roomPosition) {
          inside = { door, int }; follow.indoor = true; showStreet(false); scene.add(roomLight);
          pos.copy(roomPosition); follow.snapBehind(facing);
        }
      }
      hud.closeModal();
    }));
  });
}

function saveNow(): boolean {
  // indoors, save the street position at the door: interiors are rebuilt on load
  if (inside) state.place(world!.id, inside.door.x, inside.door.z, facing); else state.place(world!.id, pos.x, pos.z, facing);
  return writeSave(store, state.data);
}

hud.onAction = () => {
  if (mode !== 'play' || !nearest) return;
  if (nearest.kind === 'travel') openTravel();
  else if (nearest.actions.length === 1 && nearest.actions[0].special === 'exit') exitInterior();
  else openActions(nearest);
};
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
      [nx, nz] = pushOut(nx, nz, inside ? 0.3 : 0.5, inside ? inside.int.colliders : world.colliders);
      const b = inside ? inside.int.bounds : world.bounds; nx = clamp(nx, b.x0, b.x1); nz = clamp(nz, b.z0, b.z1);
      pos.x = nx; pos.z = nz;
    } else speed *= 0.8;
    { const gy = 0.1 + (inside ? 0 : world.heightAt(pos.x, pos.z)); pos.y += (gy - pos.y) * Math.min(1, dt * 14); } // climb stairs smoothly
    state.tick(dt * 1000);
  } else if (mode === 'busy') { state.tick(dt * 1000); speed = 0; }
  if (!lambScene) {
    if ((player.pose || proxy) && speed > 0.5) { player.setPose(null); emoteT = 0; previewT = 0; hideProxy(); }
    if (emoteT > 0) { emoteT -= dt; if (emoteT <= 0) { player.setPose(null); hideProxy(); } }
    if (previewT > 0) { previewT -= dt; if (previewT <= 0 && emoteT <= 0) hideProxy(); }

    player.group.position.copy(pos); player.group.rotation.y = facing; player.animate(dt, speed);
    if (playerBody) { playerBody.group.visible = true; playerBody.group.position.copy(pos); playerBody.group.rotation.y = facing; playerBody.animate(dt, speed); }
  } else { player.animate(0, 0); if (playerBody) playerBody.group.visible = false; }
  for (const n of castChars) {
    const d = Math.hypot(pos.x - n.x, pos.z - n.z);
    if (d < 9) n.c.group.rotation.y = Math.atan2(pos.x - n.x, pos.z - n.z);
    if (n.h) n.h.hold = d < 3.4 ? 'Talk' : null;
    n.c.animate(dt, 0);
  }
  crowd?.update(dt); traffic?.update(dt); life?.update(dt); world.tick(dt);
  for (const h of ambient) h.animate(dt, 0);
  for (const a of apprentices) { const wp = a.h.group.getWorldPosition(tmpV); a.update(dt, !inside && Math.hypot(wp.x - pos.x, wp.z - pos.z) < 22); }
  for (const h of debugPeople) h.animate(dt, 0);
  const space = presenceSpace();
  const clip = mode === 'play' && playerBody?.clipName && PRESENCE_CLIPS.includes(playerBody.clipName as PresenceClip) ? playerBody.clipName as PresenceClip : 'Idle';
  presence.publish({ type: 'move', x: pos.x, y: pos.y, z: pos.z, yaw: facing, speed: mode === 'play' ? speed : 0, space, clip }, now);
  remoteAvatars.update(dt, pos, space, quality === 'low' ? 6 : quality === 'medium' ? 10 : 14, camera, innerHeight);
  findNearest();
  economy.update(dt, pos, !!inside, mode === 'play' && !lambScene);
  const beatHere = nearest?.npc ? availableBeat(nearest.npc, rel, state) : null;
  hud.setPrompt(mode === 'play' && nearest ? nearest.name : null, nearest?.kind === 'travel' ? 'Voyager' : beatHere ? '★ Histoire · Appuyer / E' : undefined);

  if (!lambScene) follow.update(dt, pos, facing, drag, inside ? inside.int.colliders : world.colliders, innerHeight > innerWidth, speed > 0.5, inside ? inside.int.cameraBox : undefined, inside ? undefined : (x, z) => world!.heightAt(x, z));
  if (camOverride && !lambScene) {
    const a = facing + camOverride.side;
    camera.position.set(pos.x + Math.sin(a) * camOverride.dist, camOverride.h, pos.z + Math.cos(a) * camOverride.dist);
    camera.lookAt(pos.x, camOverride.h - 0.1, pos.z);
  }
  const ct = cityTimeAt(presence.serverNow()); const hour = hourOverride ?? ct.hourFloat;
  updateLighting(hour);
  statsT -= dt;
  if (statsT <= 0) { statsT = 0.25; hud.setStats(state.wallet, state.data.needs, state.mood()); const sg = suggestion(rel, state); hud.setGoal(mode === 'play' && sg ? sg.hint : null); hud.setPlace(HUB_NAMES[world.id], hourOverride === null ? ct.label : `Jour ${ct.day} · ${String(Math.floor(hour)).padStart(2, '0')}:00`, hour < 6 || hour >= 19); }
  if (freeCam) { camera.position.copy(freeCam.p); camera.lookAt(freeCam.t); }
  renderer.render(scene, camera);
}

// ------------------------------------------------------------------ start
resize(); applyQuality();
async function start() {
  await Promise.all([preloadAssets(), preloadHumanoid()]);
  if (humanoidReady()) { playerBody = new Humanoid(PLAYER_LOOK); scene.add(playerBody.group); player.group.visible = false; }
  const startHub = invitedHub ?? state.data.hub;
  if (invitedHub || isNewGame || (state.data.x === 0 && state.data.z === 0)) loadHub(startHub);
  else loadHub(startHub, { x: state.data.x, z: state.data.z, yaw: state.data.yaw });
  if (isNewGame) hud.toast('Bienvenue à Pikine ! Tonton Ibou t’attend devant ta chambre.');
  requestAnimationFrame(frame);
}
void start();

if (DEBUG) {
  (window as unknown as Record<string, unknown>).__dakar = {
    state, hubs: HUB_IDS, three: { scene, renderer, sky: sky.mesh },
    presence: () => ({ status: presence.status, id: presence.id, room: presence.room, count: presence.count, peers: [...presence.peers.values()], visible: remoteAvatars.size }),
    teleport(hub: HubId, x?: number, z?: number, yaw = 0) { loadHub(hub, x === undefined ? undefined : { x, z: z ?? 0, yaw }); },
    setHour(h: number | null) { hourOverride = h; },
    pos: () => ({ x: pos.x, y: pos.y, z: pos.z, hub: world?.id, mode, near: nearest?.name ?? null }),
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
    wrestlerReady: () => humanoidReady(),
    body: () => playerBody,
    faceCamera() { follow.yaw = facing + Math.PI; },
    portrait(dist = 2.2, h = 1.5, side = 0.35) { camOverride = dist > 0 ? { dist, h, side } : null; },
    addPeople(n = 6) { if (!world) return; for (let k = 0; k < n; k++) { const h = new Humanoid(randomLookDbg()); h.group.position.set(pos.x + Math.sin(facing + 0.6 + k * 0.45) * (2.6 + (k % 2) * 1.2), 0.1, pos.z + Math.cos(facing + 0.6 + k * 0.45) * (2.6 + (k % 2) * 1.2)); h.group.rotation.y = facing + Math.PI; h.hold = k % 3 === 0 ? 'Talk' : 'Idle'; extra.add(h.group); debugPeople.push(h); } },
    sceneInfo: () => (lambScene ? { kind: lambScene.kind, t: lambScene.t } : null),
    duel() { startDuel(); },
    duelInfo: () => (lambScene instanceof LambDuel ? { phase: lambScene.phase, winner: lambScene.winner } : null),
    duelGrab() { if (lambScene instanceof LambDuel) lambScene.pressGrab(); },
    duelGuard(on: boolean) { if (lambScene instanceof LambDuel) lambScene.setGuard(on); },
    scenePeek(t: number) { if (lambScene) { lambScene.t = t; lambScene.snap = true; } },
    outfit: () => openOutfit(), journal: () => openJournal(),
    emote(i = 0) { playEmote(i); },
    setLook(c: string, p: string, acc: string[]) { Object.assign(state.data.wrestler, { ngembColor: c, ngembPattern: p, accessories: acc }); },
    enter(kind: 'home' | 'gargote') { const it = world?.interactables.find(i => i.id.includes(`:${kind}:`)); if (it) enterInterior(it); },
    exit() { exitInterior(); },
    look(yaw: number, pitch?: number) { follow.yaw = yaw; if (pitch !== undefined) follow.pitch = pitch; },
    place(x: number, z: number, yaw: number) { pos.set(x, 0.1 + (world?.heightAt(x, z) ?? 0), z); facing = yaw; follow.snapBehind(yaw); },
    cam(p: [number, number, number] | null, t?: [number, number, number]) { freeCam = p && t ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t) } : null; },
    meshStats() {
      const rows: { name: string; tris: number; visible: boolean }[] = [];
      world?.group.children.forEach((o, i) => { let t = 0; o.traverse(m => { const g = (m as THREE.Mesh).geometry; if (g) t += (g.index ? g.index.count : g.attributes.position.count) / 3; }); rows.push({ name: `${i}:${o.type}:${((o as THREE.Mesh).material as THREE.Material | undefined)?.type ?? ''}`, tris: Math.round(t), visible: o.visible }); });
      return rows.sort((a, b) => b.tris - a.tris).slice(0, 12);
    },
    lookAtPlayer(dist = 4, yawOff = Math.PI) { follow.yaw = facing + yawOff; void dist; },
    ...economy.debug(),
  };
}
