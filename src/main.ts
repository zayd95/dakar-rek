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
import { PlacedPeople } from './actors/placedPeople';
import { Apprentice } from './actors/apprenti';
import { FollowCamera } from './actors/camera';
import { Hud, fcfa, type MenuItem } from './ui/hud';
import { preloadAssets } from './actors/vehicles';
import { preloadHumanoid, humanoidReady, Humanoid, randomLook, type Clip, type PersonLook } from './actors/humanoid';
import { castById } from './social/cast';
import { NpcLife } from './social/npcLife';
import { Relations, PLAYER } from './social/relations';
import { BEATS, availableBeat, suggestion, applyChoice, type Beat } from './social/beats';
import { LambScene, SCENE_LABEL, type SceneKind } from './lamb/scenes';
import { LambDuel } from './lamb/duel';
import { fighterAttributes } from './career/career';
import { FRIENDLY_MORE, STYLE_MAP, rosterOpponent } from './lamb/opponents';
import { lamb2On } from './lamb/flag';
import { PARTNER, RULES, RULES_STATUS, STYLES, STYLE_IDS, arenaProfileRows, opponentLevel, rankedStyle, record, recordIncrements, type BoutMode, type Discipline, type StyleId } from './lamb/rules';
import { phoneHooks } from './ui/phoneHooks';
import { EMOTES } from './lamb/poses';
import { ACCESSORIES, NGEMB_COLORS, NGEMB_PATTERNS, REVIEW_STATUS } from './lamb/look';
import { PresenceClient, loadProfile } from './multiplayer/client';
import { RemoteAvatars, avatarLook } from './multiplayer/avatars';
import { PresenceUi } from './multiplayer/ui';
import { Phone } from './ui/phone';
import { ChatUi } from './multiplayer/chat';
import { isHub, MAX_ROOMS_PER_HUB, PRESENCE_CLIPS, type PresenceClip, type PresenceExtras } from './multiplayer/protocol';
import { Economy } from './economy/ui';
import { pickupFrags } from './economy/jobs';
import { Interactions } from './interact/system';
import { Seats, seatClip, sitOriginY, standSpots, type Seat } from './interact/seats';
import { LegacySource } from './interact/legacy';
import type { Target } from './interact/types';
import { ActivityRunner } from './activity/runner';
import { Places } from './activity/places';
import { Inventory } from './activity/inventory';
import { actionVerb } from './interact/legacy';
import { People } from './interact/people';
import type { ActivitySpec } from './activity/types';
import { MODULES, type GameCtx } from './game/modules';
import { arenaShow } from './arena/module';
import { eveningLine, placeClock, welcomeFirst } from './arena/eveningCall';
import { GALA_DONE_COUNTER } from './arena/program';
import { weatherNow } from './city/weather';
import { GesturePlayer } from './ui/gesture';
import { Stride } from './game/stride';
import { StrideUi } from './ui/stride';

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
  // traffic: the most cars on the road at rush hour (src/social/ambientLife.ts thins them by hour, the weather by rain)
  low: { pr: 1, shadow: 0, crowd: 8, traffic: 4 },
  medium: { pr: 1.5, shadow: 1024, crowd: 12, traffic: 7 },
  high: { pr: 2, shadow: 2048, crowd: 16, traffic: 10 },
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
let destination: { id: string; hub: HubId } | null = null;
let crowd: Crowd | null = null, traffic: DecorativeTraffic | null = null, life: MonumentLife | null = null;
let apprentices: Apprentice[] = [];
/** Ambient people placed by the hub builder (dibiterie cook, customers…). */
let ambient: PlacedPeople | null = null;
/** Debug-only fixed camera (screenshots of landmarks). */
let freeCam: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
/** Recurring cast: routines, memory, situations (src/social/npcLife.ts). */
const npcLife = new NpcLife({ hud, rel, state, clock: () => { const ct = cityTimeAt(presence.serverNow()); return { hour: hourOverride ?? ct.hourFloat, day: ct.day }; }, menuMode: () => { mode = 'menu'; }, save: () => { saveNow(); }, openBeat: b => openBeat(b) });
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
/** Set once the module context (`ctx`, below) exists. */
let ctxReady = false;
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
const chat = new ChatUi({ presence, avatars: remoteAvatars, scene, storage: store, enabled: import.meta.env.VITE_MULTIPLAYER === 'true', local: () => pos, space: presenceSpace,
  suspend: on => { if (on) { input.enabled = false; input.reset(); } else if (mode === 'play') input.enabled = true; } });
presence.onChange = () => { presenceUi.update(); chat.refresh(); if (!presence.count) remoteAvatars.clear(); };
// Lot B economy (src/economy/*): Tiak Tiak deliveries, wallet history, starter-room furniture, phone hooks. Device-local.
const economy = new Economy({ state, hud, scene, menu: () => { mode = 'menu'; }, save: () => !!world && saveNow(), walkTo: id => setDestination(id) });
/** The one walking marker of the city (see openPlaces): a place of the current hub, or nothing. */
function setDestination(id: string | null) { destination = id && world ? { id, hub: world.id } : null; }
function presenceSpace() { return lambScene ? 'scene' : modulePresence() ?? moduleSpace() ?? (inside ? inside.door.id.includes(':home:') ? 'home' : inside.door.id : 'street'); }
/** A module's presence space when it differs from its interaction space (one's own motorbike: still in the street). */
function modulePresence(): string | null { if (!ctxReady) return null; for (const m of MODULES) { const s = m.presenceSpace?.(ctx); if (s) return s; } return null; }
/** A module's own space the player is in (a vehicle while riding: src/transport), or null. */
/** Module-owned space (a vehicle…). Presence can ask before the module context exists (online start-up): no module space yet. */
function moduleSpace(): string | null { if (!ctxReady) return null; for (const m of MODULES) { const s = m.space?.(ctx); if (s) return s; } return null; }

const sunDir = new THREE.Vector3();
function updateLighting(hour: number) {
  const d = daylight(hour), night = 1 - clamp(d * 3.2, 0, 1);
  const low = 1 - clamp((d - 0.05) / 0.4, 0, 1);              // 1 near sunrise/sunset, 0 at midday
  // Sun path: rises in the east (+x), sets over the ocean (-x), leaning south (+z) so facades get raking light.
  const a = clamp((hour - 6) / 13, 0, 1) * Math.PI;
  const isNight = hour < 6 || hour >= 19;
  sunDir.set(Math.cos(a) * 0.85, Math.sin(a) * 0.95, 0.42).normalize();
  sky.update(hour, sunDir, isNight ? 0 : 1, camera.position);
  sky.overcast(weatherNow.cloud, isNight);                               // the day's weather (src/city/weather.ts)
  (scene.background as THREE.Color).copy(sky.horizon); (scene.fog as THREE.Fog).color.copy(sky.horizon);
  (scene.fog as THREE.Fog).near = (isNight ? 40 : 60) * (1 - 0.5 * weatherNow.rain); (scene.fog as THREE.Fog).far = (isNight ? 240 : 320) * (1 - 0.45 * weatherNow.rain);
  // Moonlight at night: cool, from high up, so streets still read.
  const ld = isNight ? new THREE.Vector3(-0.35, 0.85, 0.3).normalize() : new THREE.Vector3(sunDir.x, Math.max(0.22, sunDir.y), sunDir.z).normalize();
  sun.position.copy(pos).addScaledVector(ld, 90); sun.target.position.copy(pos);
  sun.intensity = (isNight ? 0.55 : 0.8 + 1.5 * d) * (1 - 0.72 * weatherNow.cloud);
  sun.color.set(isNight ? 0x9fb4ff : 0xfff1dc).lerp(new THREE.Color(0xffa45c), isNight ? 0 : low * 0.85);
  hemi.intensity = isNight ? 0.75 : 0.7 + 0.35 * d;
  hemi.color.copy(isNight ? new THREE.Color(0x5a6ea8) : sky.zenith.clone().lerp(new THREE.Color(0xffffff), 0.55 - 0.25 * weatherNow.cloud));
  hemi.groundColor.set(isNight ? 0x2a2620 : 0x9a7a52).multiplyScalar(1 - 0.35 * weatherNow.wet);
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
  activities.cancel(); standUp(true);
  for (const a of apprentices) a.dispose();          // detach them before the hub geometry is freed
  apprentices = [];
  ambient?.dispose(); ambient = null;
  if (world) { scene.remove(world.group); world.dispose(); }
  setGrainEnabled(quality !== 'low');                     // procedural surface noise is the main per-pixel cost
  extra.clear();
  world = buildHub(id, quality === 'low', quality);
  scene.add(world.group);
  crowd = new Crowd(world, rand, QUAL[quality].crowd); traffic = new DecorativeTraffic(world, rand, QUAL[quality].traffic);
  extra.add(crowd.group, traffic.group);
  apprentices = humanoidReady() ? world.rapides.map(car => { const a = new Apprentice(id, rand); a.attach(car); return a; }) : [];
  for (const car of traffic.rapides()) { if (!humanoidReady()) break; const a = new Apprentice(id, rand, true); a.attach(car); apprentices.push(a); }
  ambient = new PlacedPeople(world, rand, h => extra.add(h.group));
  life?.dispose(); life = world.monument ? new MonumentLife(world.monument, rand, QUAL[quality].crowd) : null;
  if (life) extra.add(life.group);
  npcLife.load(world, extra);                            // recurring cast on their daily routines
  economy.decorateHub(world);
  interiors = new Map(); inside = null; follow.indoor = false; scene.remove(roomLight);
  doorSeq++; hud.fade(false);                            // cancel a door transition still fading
  let n = 0;
  for (const it of world.interactables) {
    // homes (the starter room included) are built by the ownership module through ctx.addInterior (src/economy/estate.ts)
    const kind = it.id.includes(':gargote:') ? 'gargote' : it.id.includes(':maiga:') ? 'maiga' : null;
    if (!kind) continue;
    const int = buildInterior(kind, 1000 + n * 40, 0, it.name, id); n++;
    world.group.add(int.group); int.group.visible = false; interiors.set(it.id, int);
  }
  registerSeats();
  places.clear(); people.clear();
  for (const m of MODULES) m.hubLoaded?.(ctx, world);
  const requested = at ?? world.spawn, bounds = world.bounds;
  const p = requested.x >= bounds.x0 && requested.x <= bounds.x1 && requested.z >= bounds.z0 && requested.z <= bounds.z1 ? requested : world.spawn;
  pos.set(p.x, 0.1, p.z); facing = p.yaw; speed = 0;
  follow.snapBehind(facing);
  state.place(id, p.x, p.z, p.yaw);
  hud.setPlace(HUB_NAMES[id], '', false);
  remoteAvatars.clear(); presence.join(id, id === invitedHub ? invitedRoom : null);
  phone.remember();
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
/** One contextual interaction system (src/interact): legacy content, seats, and the modules' own targets. */
const interactions = new Interactions();
const seats = new Seats();
let seated: Seat | null = null;
/** Seconds left standing up on a place in the stands, arms up (« Encourager »), before sitting back down. */
let cheerT = 0;
/** Space key shared by seats, targets and presence: 'street', 'home' (own room) or the interior's door id. */
const spaceOf = (door: Interactable) => door.id.includes(':home:') ? 'home' : door.id;
const interactSpace = () => moduleSpace() ?? (inside ? spaceOf(inside.door) : 'street');
interactions.add(new LegacySource({
  list: space => !world ? [] : inside ? inside.int.interactables : space === 'street' ? world.interactables : [],
  run: it => legacyAction(it),
  runAction: (it, a) => { nearest = it; hud.closeModal(); if (a.special) runSpecial(a); else runAction(a, it.npc, it); },
  talkLabel: it => { const b = it.npc ? availableBeat(it.npc, rel, state) : null; return b ? '★ ' + b.title : null; },
  canAfford: c => state.canAfford(c),
  visible: a => !a.visible || a.visible(state),
  requires: a => a.requires?.(state) ?? null,
}));
interactions.add(seats);
interactions.add({ name: 'self', collect(space, x, z, out) {           // while seated: « Se lever » (not on a locked seat)
  if (!seated || seated.locked) return;
  out.push({ id: 'self', name: 'Assis', kind: 'self', space, x, z, radius: 1, bias: -1, affordances: () => [{ id: 'stand', verb: 'stand', label: 'Se lever', icon: '🧍', run: () => standUp() },
    ...(seated?.kind === 'stand' ? [{ id: 'cheer', verb: 'dance' as const, label: 'Encourager', icon: '🙌', detail: 'Debout un instant, les bras en l’air', run: () => { cheer(); } }] : [])] });
} });
seats.onSit = s => sitOn(s);

/** Universal activities (src/activity): one runner plays every composed activity; places compose the primitives. */
const inventory = new Inventory(state);
/** Gestures of the trades: the hands-on part of a shift (serve, pass the tool, tighten, pull). */
const gestures = new GesturePlayer(document.getElementById('ui')!);
/** On foot, always free: walk, brisk walk, run while stamina lasts (fitness = « forme »). */
const stride = new Stride(state);
const strideUi = new StrideUi(document.getElementById('ui')!, stride);
const activities = new ActivityRunner({
  state, seats, space: () => interactSpace(), player: () => ({ x: pos.x, z: pos.z }), seated: () => seated,
  sit: s => { if (seated && seated.id !== s.id) standUp(true); sitOn(s, true); return seated?.id === s.id; },
  clip: c => { if (playerBody) playerBody.hold = seated && (c === 'Sit' || !c) ? seatClip(seated) : c ?? null; },   // a step's Sit means « the seat's own pose » (lying on a bed…)
  stand: () => standUp(),                                  // out of bed after sleeping (runner: a sleep step ends the seat)
  busy: on => { if (on) { mode = 'busy'; input.enabled = false; } else if (mode === 'busy') { mode = 'play'; input.enabled = true; } },
  progress: (on, pct = 0, label = '') => hud.progress(on, pct, label, progressMeta()),
  toast: m => hud.toast(m), save: () => { if (world) saveNow(); },
  rel: (npc, d) => rel.change(PLAYER, npc, d), flag: f => { if (!state.data.flags.includes(f)) state.data.flags.push(f); },
  item: (id, d) => inventory.add(id, d), hasItem: (id, n) => inventory.has(id, n),
  // polyvalence: the category of each activity is practised, and work pay is scaled by the variety (src/economy)
  category: c => economy.practiseCategory(c), pay: (m, c) => economy.scalePay(m, c), payPreview: (m, c) => economy.previewPay(m, c),
  gesture: (g, label, done) => gestures.play(g, label, done),
});
const places = new Places(activities, () => hourOverride ?? cityTimeAt(presence.serverNow()).hourFloat);
interactions.add(places);
/** Everyone in the street can be greeted (placed people and walkers). */
const people = interactions.add(new People(() => [
  ...(ambient?.bodies() ?? []).map(b => ({ id: b.id, obj: b.h.group, h: b.h, seated: b.seated, female: b.female })),
  ...(crowd?.bodies() ?? []).map(b => ({ id: b.id, obj: b.obj, h: b.h })),
], activities, line => hud.toast(line), () => ({ x: pos.x, z: pos.z }))) as People;
/** What gameplay modules (src/game/modules.ts) may use: the shared systems, the player and the hub. */
const ctx: GameCtx = {
  scene, camera, follow, extra, state, hud, input, interactions, seats, people, places, activities, inventory,
  quality: () => quality, world: () => world, inside: () => inside, space: () => interactSpace(),
  hour: () => hourOverride ?? cityTimeAt(presence.serverNow()).hourFloat, day: () => cityTimeAt(presence.serverNow()).day, now: () => presence.serverNow(),
  player: {
    pos, facing: () => facing, body: () => playerBody, seated: () => seated,
    sit: s => sitOn(s, true), standUp: inPlace => standUp(inPlace),
    place(x, z, yaw) { pos.set(x, 0.1 + (inside || !world ? 0 : world.heightAt(x, z)), z); facing = yaw; follow.snapBehind(yaw); },
    cheer: s => cheer(s),
  },
  peers: () => [...presence.peers.values()],
  mode: () => mode,
  setMode(m) { mode = m; input.enabled = m === 'play'; if (m !== 'play') input.reset(); },
  menu(title, subtitle, items, extraHtml) { mode = 'menu'; input.enabled = false; hud.openMenu(title, subtitle, items, extraHtml); },
  guide: () => guideTarget(),
  toast: m => hud.toast(m), save: () => { if (world) saveNow(); },
  addInterior(door, int) {
    if (!world) return;
    const old = interiors.get(door.id);
    if (old) {                                                        // a rebuilt room (upgrade…) replaces the one behind the door
      if (seated && old.seats.some(s => s.id === seated!.id)) standUp(true);
      for (const s of old.seats) seats.remove(s.id);
      world.group.remove(old.group); disposeInterior(old);
      if (inside?.int === old) inside.int = int;
    }
    world.group.add(int.group); int.group.visible = inside?.int === int; interiors.set(door.id, int);
    seats.addAll(int.seats.map(s => ({ ...s, space: spaceOf(door) })));
  },
  enter(doorId) { const it = world?.interactables.find(i => i.id === doorId); if (it) enterInterior(it); },
  exit: () => exitInterior(),
  walkTo: id => setDestination(id),
  setPublicRecord: rec => presence.setRecord(rec),
  // the fighter's evening (src/arena/fighter.ts) plays avec frappe when Làmb 2.0 is on (?lamb2); otherwise as before
  startBout(m, style, after) { if (lambScene || !world?.arena) return false; startDuel(m, style as StyleId | undefined, after, LAMB2 ? 'avec_frappe' : 'sans_frappe'); return !!lambScene; },
  travel(dest, at, label) {
    if (!world) return;
    mode = 'busy'; input.enabled = false; input.reset();
    hud.fade(true, label ?? HUB_NAMES[dest]);
    setTimeout(() => {
      loadHub(dest, at);
      hud.fade(false);
      mode = 'play'; input.enabled = true; saveNow();
    }, 700);
  },
};
ctxReady = true;
/** A legacy action that declares steps runs through the universal runner (Maïga meals, …). */
function actionSpec(a: Action): ActivitySpec {
  return { id: a.id, primitive: actionVerb(a)[0], label: a.label, detail: a.detail, price: a.cost, steps: a.steps!, requires: a.requires ? () => a.requires!(state) : undefined, quiet: a.quiet };
}

function sitOn(seat: Seat, force = false) {
  if ((!force && mode !== 'play') || seated || !seats.occupy(seat.id, 'player')) return;
  seated = seat; speed = 0; hideProxy(); emoteT = 0; previewT = 0; cheerT = 0;
  pos.set(seat.x, sitOriginY(seat) + (inside ? 0 : 0), seat.z); facing = seat.yaw;
  if (playerBody) playerBody.hold = seatClip(seat);
}
/** On a place in the stands: up on the tier for a moment, arms up (others see Celebrate), then back on the seat. */
function cheer(seconds = 2.5) {
  if (!seated || seated.kind !== 'stand' || mode !== 'play') return false;
  cheerT = Math.max(0.5, Math.min(6, seconds)); return true;
}
/** Stand up in front of the seat (`inPlace`: just clear the state, e.g. before a door or a trip). */
function standUp(inPlace = false) {
  if (!seated) return;
  const s = seated, cheering = cheerT > 0; seats.release(s.id, 'player'); seated = null; cheerT = 0;
  if (playerBody && (playerBody.hold === seatClip(s) || (cheering && playerBody.hold === 'Celebrate'))) playerBody.hold = null;
  if (inPlace || !world) return;
  // the first free spot: in front of a chair; out of a bed by a side (or past its foot), never inside furniture or a wall
  const cols = inside ? inside.int.colliders : world.colliders, r = inside ? 0.3 : 0.5;
  let nx = s.x, nz = s.z, best = Infinity;
  for (const p of standSpots(s)) {
    const [x, z] = pushOut(p.x, p.z, r, cols);
    const blocked = cols.some(c => x > c.x0 - r * 0.9 && x < c.x1 + r * 0.9 && z > c.z0 - r * 0.9 && z < c.z1 + r * 0.9);
    const cost = Math.hypot(x - p.x, z - p.z) + (blocked ? 10 : 0);
    if (cost < best - 1e-6) { best = cost; nx = x; nz = z; }
  }
  if (s.clip === 'Lie') facing = Math.atan2(nx - s.x, nz - s.z);                // out of bed, facing away from it
  pos.set(nx, 0.1 + (inside ? 0 : world.heightAt(nx, nz)), nz);
}
/** Registers the seats of the hub, its interiors and marks those already used by the ambient people. */
function registerSeats() {
  seats.clear(); if (!world) return;
  seats.addAll(world.seats);
  for (const [doorId, int] of interiors) seats.addAll(int.seats.map(s => ({ ...s, space: doorId.includes(':home:') ? 'home' : doorId })));
  for (const p of world.people) if (p.clip === 'Sit') seats.occupyNear('street', p.x, p.z, 'npc');
}
/** What the action button did before the contextual system (kept for places, people and stations). */
function legacyAction(it: Interactable) {
  nearest = it;
  if (it.kind === 'travel') openTravel();
  else if (it.actions.length === 1 && it.actions[0].special === 'exit') exitInterior();
  else openActions(it);
}
function openMore() {
  const t = interactions.focus; if (!t || mode !== 'play') return;
  const list = interactions.all(t); if (!list.length) return;
  mode = 'menu';
  hud.openQuick(t.name, list.map(a => ({
    icon: a.icon, label: a.label, detail: a.disabled ?? a.detail, disabled: !!a.disabled,
    right: a.cost ? '−' + fcfa(a.cost) : a.gain ? '+' + fcfa(a.gain) : undefined,
    onPick: () => { hud.closeModal(); mode = 'play'; a.run(); },
  })));
}

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
  const items: MenuItem[] = visible.map(a => {
    const why = a.requires?.(state) ?? (a.cost && !state.canAfford(a.cost) ? 'Pas assez d’argent' : null);
    return { icon: actionVerb(a)[1], label: a.label, detail: why ?? describe(a), right: a.cost ? '−' + fcfa(a.cost) : a.gain ? '+' + fcfa(economy.workPreview(a, it)) : undefined, disabled: !!why, onPick: () => { hud.closeModal(); if (a.special) runSpecial(a); else runAction(a, it.npc, it); } };
  });
  let subtitle = it.description ?? 'Que veux-tu faire ?';
  if (it.npc) {
    items.unshift(...npcLife.menuItems(it.npc));            // situation, favour, introduction (after the beat)
    const beat = availableBeat(it.npc, rel, state);
    if (beat) items.unshift({ label: '★ ' + beat.title, detail: 'Histoire', right: undefined, disabled: false, onPick: () => openBeat(beat) });
    const lv = rel.level(it.npc);
    subtitle = `« ${npcLife.greet(it.npc)} » · Relation : ${Relations.label(lv)} (${lv > 0 ? '+' : ''}${Math.round(lv)})`;
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
    case 'training': startScene('training', () => {
      if (a.needs) state.adjust(a.needs); if (a.counter) state.count(a.counter); rel.change(PLAYER, 'ablaye', 1);
      const notes = MODULES.flatMap(m => m.lamb?.(ctx, { kind: 'training', scene: 'training' }) ?? []);
      hud.toast(['Entraînement terminé ✓  Lutte ' + (state.data.counters.lutte ?? 0), ...notes].join('  '));
    }); break;
    case 'entrance': startScene('entrance', () => { state.adjust({ moral: 10, social: 6 }); state.count('entrees'); }); break;
    case 'prep': startScene('prep'); break;
    case 'watch': startScene('watch', () => { if (a.needs) state.adjust(a.needs); }); break;
    case 'combat': openFriendly(); break;
    case 'combat_classe': openRanked(); break;
    // with ?lamb2, Coach Ablaye's session is the guided lesson avec frappe (src/lamb/lesson.ts); otherwise as before
    case 'combat_entrainement': startDuel('entrainement', undefined, undefined, LAMB2 ? 'avec_frappe' : 'sans_frappe'); break;
    case 'outfit': openOutfit(); break;
    case 'emote': openEmotes(); break;
    case 'enter': if (nearest) enterInterior(nearest); break;
    case 'exit': exitInterior(); break;
    case 'jobs': economy.openJobs(nearest ?? undefined); break;
    case 'shop': economy.openShop(false, nearest?.name ?? ''); break;
    case 'business': economy.openBusiness(); break;
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
  activities.cancel(); standUp(true);
  const seq = ++doorSeq;
  hud.fade(true, door.name);
  setTimeout(() => {
    if (seq !== doorSeq) return;
    inside = { int, door }; follow.indoor = true; showStreet(false); scene.add(roomLight);
    for (const m of MODULES) m.spaceChanged?.(ctx, interactSpace());
    pos.set(int.spawn.x, 0.1, int.spawn.z); facing = int.spawn.yaw; speed = 0; follow.snapBehind(facing);
    hud.fade(false); mode = 'play'; input.enabled = true;
  }, 350);
}
function exitInterior() {
  if (!inside) return;
  activities.cancel(); standUp(true);
  const d = inside.door;
  const seq = ++doorSeq;
  hud.fade(true, HUB_NAMES[world!.id]);
  setTimeout(() => {
    if (seq !== doorSeq) return;
    inside = null; follow.indoor = false; showStreet(true); scene.remove(roomLight);
    for (const m of MODULES) m.spaceChanged?.(ctx, 'street');
    pos.set(d.x, 0.1, d.z); speed = 0; follow.snapBehind(facing);
    hud.fade(false); mode = 'play'; input.enabled = true; saveNow();
  }, 350);
}

function startScene(kind: SceneKind, onDone?: () => void) {
  if (!world) return;
  activities.cancel(); standUp(true);
  hideProxy(); emoteT = 0; previewT = 0;
  const at = kind === 'training' || kind === 'celebration' ? world.ecurie : world.arena;
  if (!at) { hud.toast('Disponible à Pikine (arène et écurie)'); mode = 'play'; return; }
  hud.closeModal();
  mode = 'scene'; input.enabled = false;
  lambScene = new LambScene(kind, player, { x: at.cx, z: at.cz }, state.data.wrestler, quality === 'low' ? 14 : quality === 'medium' ? 20 : 26);
  lambScene.onDone = onDone;
  extra.add(lambScene.group);
  npcLife.setVisible(false);                              // the scene places its own cast
  hud.setScene(SCENE_LABEL[kind], 'Làmb · Dakar Rek', true);
}

// ------------------------------------------------------------------ làmb bouts (provisional rules, no strikes; see src/lamb/rules.ts)
/**
 * Làmb 2.0 (« lutte avec frappe », src/lamb/stand.ts) is built step by step behind this flag: `?lamb2` in the address,
 * or `localStorage['dakarrek.lamb2'] = '1'`. Without it the arena offers the sans-frappe bouts only, as before.
 */
const LAMB2 = lamb2On();
/** Friendly bout: the player picks the opponent's style; the level follows the friendly record. */
function openFriendly() {
  mode = 'menu';
  const r = record(state.data.counters, 'amical'), level = opponentLevel(r.v, r.d);
  const items = STYLE_IDS.map(id => {
    const st = STYLES[id];
    return { label: `${st.name} · ${st.label} · niveau ${level}`, detail: st.hint, onPick: () => startDuel('amical', id) };
  });
  if (LAMB2) for (const id of STYLE_IDS) {
    const st = STYLES[id];
    items.push({ label: `Avec frappe · ${st.name} · ${st.label}`, detail: 'Làmb 2.0, en construction : frappes, équilibre, empoignade. Bilan à part.', onPick: () => startDuel('amical', id, undefined, 'avec_frappe') });
  }
  // avec frappe, the three other styles of the six each have their wrestler (src/lamb/opponents.ts)
  if (LAMB2) for (const f of FRIENDLY_MORE) {
    const o = rosterOpponent(f.name, ctx.day());
    if (!o) continue;
    const word = STYLE_MAP[o.style].word;
    items.push({ label: `Avec frappe · ${o.wrestler.name} · ${word[0].toUpperCase()}${word.slice(1)}`, detail: `${f.hint} Bilan à part.`, onPick: () => startDuel('amical', o.wrestler.style, undefined, 'avec_frappe', o.wrestler.name) });
  }
  hud.openMenu('Combat amical', `Non classé · niveau ${level} · ${RULES_STATUS}`, items,
    `<div class="draft">${LAMB2 ? 'Lutte sans frappe, ou avec frappe (essai)' : 'Lutte sans frappe'}. Adversaires fictifs. La tenue, les danses et les accessoires n’ont aucun effet sur le combat ; l’argent non plus.</div>`);
}
/** The opponent a module (the career's roster) names for a bout of this mode, if any. */
function opponentPick(m: 'amical' | 'classe') { for (const x of MODULES) { const p = x.opponent?.(ctx, m); if (p) return p; } return null; }
/** Ranked bout: the career's roster names the opponent (else the ranked record's style rotation and level). */
function openRanked() {
  mode = 'menu';
  const r = record(state.data.counters, 'classe'), pick = opponentPick('classe');
  const st = STYLES[(pick?.style as StyleId | undefined) ?? rankedStyle(r.v + r.d + r.n)] ?? STYLES.costaud, level = pick?.level ?? opponentLevel(r.v, r.d);
  hud.openMenu('Combat classé', `Classement local (cet appareil) · ${r.v} V · ${r.d} D · ${r.n} N`, [
    { label: `Affronter ${pick?.name ?? st.name} · ${st.label} · niveau ${level}`, detail: st.hint, onPick: () => startDuel('classe', st.id) },
  ], `<div class="draft">Lutte sans frappe · ${RULES_STATUS}. Un abandon est compté à part : ce n’est ni une victoire ni une défaite.</div>`);
}

/** Controlled bout against a local opponent: guided training at the écurie, friendly or ranked at the arena. */
function startDuel(boutMode: BoutMode = 'amical', styleId?: StyleId, after?: () => void, discipline: Discipline = 'sans_frappe', named?: string) {
  if (lambScene) return;                                                       // one bout or scene at a time
  const at = boutMode === 'entrainement' ? world?.ecurie : world?.arena;
  if (!at) { hud.toast(boutMode === 'entrainement' ? 'L’entraînement a lieu à l’écurie de Pikine' : 'Les combats ont lieu à l’arène de Pikine'); mode = 'play'; return; }
  hideProxy(); emoteT = 0; previewT = 0;
  hud.closeModal();
  mode = 'scene';
  const rec = boutMode === 'entrainement' ? null : record(state.data.counters, boutMode);
  let style = boutMode === 'entrainement' ? PARTNER : STYLES[styleId ?? (boutMode === 'classe' ? rankedStyle(rec!.v + rec!.d + rec!.n) : 'costaud')];
  const crowd = boutMode === 'entrainement' ? 0 : quality === 'low' ? 12 : quality === 'medium' ? 18 : 24;
  let level = rec ? opponentLevel(rec.v, rec.d) : 1;
  // the career's roster names the opponent (a wrestler of the city's ladder, with their style and level)
  const pick = boutMode === 'entrainement' ? null : opponentPick(boutMode);
  if (pick) { style = { ...(STYLES[pick.style as StyleId] ?? style), name: pick.name }; level = pick.level; }
  else if (named) style = { ...style, name: named };                          // a friendly avec frappe against a named wrestler
  // avec frappe, the player's attributes come from what he trained (src/career, data only); they shape numbers by ±20 % at most
  const attrs = discipline === 'avec_frappe' ? fighterAttributes(state.data.counters) : undefined;
  // avec frappe, a wrestler of the city's roster fights as himself: his style, his level, his season record (src/lamb/opponents.ts)
  const who = discipline === 'avec_frappe' && boutMode !== 'entrainement' ? rosterOpponent(style.name, ctx.day(), (state.data as { career?: Parameters<typeof rosterOpponent>[2] }).career) : null;
  if (who) { style = { ...(STYLES[who.wrestler.style as StyleId] ?? style), name: who.wrestler.name }; level = who.level; }
  const opponent = who ? { attrs: who.attrs, stand: who.stand, clinch: who.clinch, line: who.line } : undefined;
  const duel = new LambDuel({ origin: { x: at.cx, z: at.cz }, look: state.data.wrestler, input, crowdSize: crowd, mode: boutMode, style, level, ring: boutMode === 'entrainement' ? 5 : 7.6, discipline, attrs, opponent });
  duel.onDone = () => {
    // only a finished bout counts; a bout cut short without a result (e.g. leaving the hub) records nothing
    const r = duel.result; if (!r) return;
    state.adjust(r.rewards.needs);
    // each discipline keeps its own record (avec frappe: `lamb_af_*`); the global combats/victoires count both
    for (const [k, v] of Object.entries(recordIncrements(r, discipline))) state.count(k, v);
    if (r.rewards.coach) rel.change(PLAYER, 'ablaye', r.rewards.coach);
    const n = state.data.counters;
    // the career (src/career) keeps the record, pays the purse and moves the rank: its lines join the result toast
    const notes = MODULES.flatMap(m => m.lamb?.(ctx, { kind: 'bout', mode: r.mode, outcome: r.outcome, winner: r.winner, opponent: { name: style.name, style: style.id, label: style.label }, level, discipline }) ?? []);
    if (discipline === 'avec_frappe') notes.unshift('Lutte avec frappe');
    hud.toast([r.mode === 'entrainement' ? (r.outcome === 'abandon' ? 'Entraînement interrompu' : `Entraînement terminé ✓  Compétence ${n.lamb_skill ?? 0}`)
      : r.outcome === 'abandon' ? 'Abandon enregistré (à part des défaites)'
      : r.winner === 'player' ? `Victoire ! (${n.victoires ?? 0} au total)` : r.winner === 'opponent' ? 'Défaite. Coach Ablaye : « On retourne à l’entraînement. »' : 'Match nul', ...notes].join('  '));
  };
  if (after) { const recorded = duel.onDone; duel.onDone = () => { recorded?.(); after(); }; }   // a module's next step (ctx.startBout)
  // avec frappe: the bout's moments go to the modules as they happen (the arena's stands react to the fall and the result)
  duel.onMoment = (m, w) => { for (const mod of MODULES) mod.lamb?.(ctx, { kind: 'moment', moment: m, winner: w, outcome: duel.outcome ?? 'decision' }); };
  lambScene = duel;
  extra.add(duel.group);
  npcLife.setVisible(false);
  hud.setScene(boutMode === 'entrainement' ? 'Entraînement · combat' : 'Combat · làmb', `${RULES[discipline].label} · ${RULES_STATUS}`);
}
phoneHooks.arenaProfile = () => arenaProfileRows(state.data.counters, state.data.flags.includes('ecurie_baobab') ? 'Baobab (fictive)' : null);

/** Leave a làmb scene early (« Arrêter », Escape, the menu key): no reward, controls back. */
function stopScene() {
  if (!(lambScene instanceof LambScene)) return;
  lambScene.onDone = undefined; endScene(); hud.toast('Arrêté');
}

function endScene() {
  if (!lambScene) return;
  const done = lambScene.onDone;
  extra.remove(lambScene.group); lambScene.dispose(); lambScene = null;
  hud.setScene(null); mode = 'play'; input.enabled = true;
  npcLife.setVisible(true);
  if (playerBody) player.group.visible = false;
  follow.snapBehind(facing);
  done?.(); saveNow();
}

function openOutfit() {
  mode = 'menu';
  const w = state.data.wrestler;
  const html = `<div class="draft">${REVIEW_STATUS} — purement cosmétique : aucun effet sur les combats.</div>
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
  hud.openMenu('Mbakkou', 'Danses de lutteur : choisis un pas.', EMOTES.map(e => ({
    label: e.label, detail: 'Non validé', onPick: () => { hud.closeModal(); playEmote(EMOTES.indexOf(e)); },
  })));
}

function playEmote(i: number) {
  const e = EMOTES[i]; emoteT = e.seconds;
  if (playerBody) showProxy(EMOTE_CLIP[e.id] ?? 'Idle'); else { player.setWrestler(state.data.wrestler); player.setPose(e.pose); }
}

/** The journal lives in the phone (Carnet app). */
function openJournal() { hud.closeModal(); phone.open('carnet'); }

/** A plain timed action in progress (content without steps): « Arrêter », Escape or the menu key stop it, without effects. */
let legacyRun: { label: string; stop(): void } | null = null;

function runAction(a: Action, npc?: string, it?: Interactable) {
  const where = it?.name;
  if (a.steps) {                                         // composed activity: pay → wait → sit → eat…
    activities.onEnd = (_s, done) => {                    // once: later activities (places, venues) must not replay this action's hooks
      activities.onEnd = () => {};
      if (done) { if (npc) rel.change(PLAYER, npc, 1); state.count('actions'); npcLife.afterAction(a, it ?? null); }   // counters belong to the steps
    };
    activities.start(actionSpec(a), { place: where });
    return;
  }
  mode = 'busy'; input.enabled = false;
  const t0 = performance.now(), dur = a.seconds * 1000;
  let stopped = false;
  legacyRun = { label: a.label, stop: () => { stopped = true; legacyRun = null; hud.progress(false); mode = 'play'; input.enabled = true; hud.toast('Arrêté'); } };
  hud.progress(true, 0, a.label);
  const tick = () => {
    if (stopped) return;
    const p = clamp((performance.now() - t0) / dur, 0, 1);
    hud.progress(true, p, a.label);
    if (p < 1) { requestAnimationFrame(tick); return; }
    legacyRun = null;
    hud.progress(false);
    const entry = where && !where.startsWith(a.label) ? `${a.label} · ${where}` : a.label;   // wallet history line
    const gain = economy.work(a, it);                       // records the activity (polyvalence) and scales the pay
    if (a.cost) state.addMoney(-a.cost, entry);
    if (gain) state.addMoney(gain, entry);
    if (a.needs) state.adjust(a.needs);
    if (a.counter) state.count(a.counter);
    if (npc) rel.change(PLAYER, npc, 1);
    state.count('actions');
    npcLife.afterAction(a, it ?? null);
    const bits = [a.label + ' ✓'];
    if (gain) bits.push('+' + fcfa(gain)); if (a.cost) bits.push('−' + fcfa(a.cost));
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

function openPlaces() {
  if (!world) return;
  mode = 'menu';
  const places = world.interactables.filter(i => i.id.includes(':city:')).sort((a, b) => Math.hypot(a.x - pos.x, a.z - pos.z) - Math.hypot(b.x - pos.x, b.z - pos.z));
  hud.openMenu('Les coins du quartier', HUB_NAMES[world.id], [
    ...(destination ? [{ label: 'Retirer le repère', onPick: () => { destination = null; hud.closeModal(); } }] : []),
    ...places.map(it => ({ label: it.name, detail: `${Math.round(Math.hypot(it.x - (inside?.door.x ?? pos.x), it.z - (inside?.door.z ?? pos.z)))} m à pied · ${it.actions.some(a => a.gain) ? 'petits services rémunérés' : 'se retrouver'}`, onPick: () => {
      destination = { id: it.id, hub: world!.id }; hud.closeModal(); hud.toast('Repère : ' + it.name);
    } })),
  ]);
}
phoneHooks.openPlaces = openPlaces;

/** Person of the suggested story beat, or « first delivery » (refreshed with the HUD, 4 times a second). */
let guideNpc: string | null = null, guideJob = false;
/** Tonight's arena (or what to do after the bout): the goal line's target while it leads (src/arena/eveningCall.ts). */
let eveningTarget: { name: string; x: number; z: number } | null = null;
/** Way-finding: the walking destination, else the suggested person (or the nearest Tiak Tiak pick-up for the first job) in this hub. */
function guideTarget(): { name: string; x: number; z: number } | null {
  if (!world) return null;
  if (destination?.hub === world.id) { const it = world.interactables.find(i => i.id === destination!.id); if (it) return { name: it.name, x: it.x, z: it.z }; }
  if (eveningTarget) return eveningTarget;
  if (guideJob) {
    const w = world, here = inside ? inside.door : pos;
    const ends = pickupFrags(w.id).map(f => w.interactables.find(i => i.id.startsWith(w.id + ':') && i.id.includes(f))).filter((i): i is Interactable => !!i);
    ends.sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z));
    if (ends[0]) return { name: ends[0].name, x: ends[0].x, z: ends[0].z };
  }
  const w = guideNpc ? npcLife.where(guideNpc) : null;
  return w?.here && w.x !== undefined && w.z !== undefined ? { name: castById(guideNpc!)?.name ?? '', x: w.x, z: w.z } : null;
}

/** « ↗ text · 72 m » toward a target (the same arrow as the walking marker), or the text alone. */
function withBearing(text: string, t: { x: number; z: number } | null): string {
  if (!t || inside) return text;
  const dx = t.x - pos.x, dz = t.z - pos.z, angle = Math.atan2(dx, dz) - follow.yaw;
  return `${['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8]} ${text} · ${Math.round(Math.hypot(dx, dz))} m`;
}

function walkingHint(): string | null {
  if (!destination || destination.hub !== world?.id) { destination = null; return null; }
  const target = world.interactables.find(i => i.id === destination!.id);
  if (!target) { destination = null; return null; }
  if (inside) return 'Sors dans la rue pour rejoindre ' + target.name;
  const dx = target.x - pos.x, dz = target.z - pos.z, distance = Math.hypot(dx, dz);
  if (distance < 2.3) { destination = null; hud.toast('Te voilà : ' + target.name); return null; }
  const angle = Math.atan2(dx, dz) - follow.yaw;
  const arrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8];
  return `${arrow} ${target.name} · ${Math.round(distance)} m`;
}

/** Quality change (phone › Réglages): rebuilds the hub and keeps the player in the room they were in. */
function setQuality(q: Quality) {
  const roomId = inside?.door.id, roomPosition = inside ? pos.clone() : null;
  const at = { x: inside ? inside.door.x : pos.x, z: inside ? inside.door.z : pos.z, yaw: facing };
  quality = q; applyQuality();
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
}

// ------------------------------------------------------------------ phone (settings and services; replaces the old system menu)
const phone = new Phone({
  state, rel, input, hub: () => world?.id ?? null, now: () => presence.serverNow(),
  places: () => world?.interactables.filter(i => !i.npc).map(i => i.name) ?? [],
  quality: () => quality, setQuality, save: saveNow, toast: m => hud.toast(m),
  newGame: () => { clearSave(store); world = null; location.reload(); },   // world = null: no save on the way out
  lock: on => {
    if (on) { if (mode === 'play') mode = 'menu'; if (mode === 'menu') { input.enabled = false; hud.resetControls(); } }
    else if (mode === 'menu' && !hud.modalOpen) { mode = 'play'; input.enabled = true; }
    else if (hud.modalOpen && mode === 'play') { mode = 'menu'; input.enabled = false; }   // an app opened a menu
  },
});

function saveNow(): boolean {
  // indoors, save the street position at the door: interiors are rebuilt on load
  // a module may hold the player somewhere they cannot resume (a moving vehicle): it gives a safe spot instead
  const safe = inside || !ctxReady ? null : MODULES.reduce<{ x: number; z: number; yaw: number } | null>((p, m) => p ?? m.safePlace?.(ctx) ?? null, null);
  if (inside) state.place(world!.id, inside.door.x, inside.door.z, facing); else if (safe) state.place(world!.id, safe.x, safe.z, safe.yaw); else state.place(world!.id, pos.x, pos.z, facing);
  return writeSave(store, state.data);
}

hud.onAction = () => {
  if (activities.running) { activities.cancel('Arrêté'); return; }
  if (legacyRun) { legacyRun.stop(); return; }
  if (mode !== 'play') return;
  const a = interactions.primary();
  if (a && !a.disabled) a.run(); else if (a?.disabled) hud.deny(a.disabled);
};
hud.onMore = () => openMore();
hud.onSceneStop = () => stopScene();
hud.onMenu = () => { if (phone.isOpen) phone.close(); else if (mode === 'play') phone.open(); };
new MutationObserver(() => { if (!hud.modalOpen && !phone.isOpen && mode === 'menu') { mode = 'play'; input.enabled = true; } }).observe(document.getElementById('modal')!, { attributes: true });
addEventListener('visibilitychange', () => { if (document.hidden && world) saveNow(); });
addEventListener('pagehide', () => { if (world) saveNow(); });
setInterval(() => { if (world && mode === 'play') saveNow(); }, 8000);

/** Action button + diegetic prompt for the focused target. */
const promptV = new THREE.Vector3();
function showPrompt(t: Target | null) {
  const run = activities.current;
  if (run || legacyRun) { hud.setPrompt('Arrêter', run ? run.step.label : legacyRun!.label, false, { icon: '✋', stop: true }); hud.setWorldPrompt(null); return; }
  const a = t ? interactions.primary(t) : null;
  if (!t || !a) { hud.setPrompt(null); hud.setWorldPrompt(null); return; }
  const all = interactions.all(t), opt = { icon: a.icon, cost: a.cost, gain: a.gain, disabled: a.disabled };
  hud.setPrompt(a.label, a.disabled ?? (a.label === t.name ? '' : t.name), all.length > 1, opt);
  if (t.kind === 'self' || !world) { hud.setWorldPrompt(null); return; }
  camera.updateMatrixWorld();
  promptV.set(t.x, (t.y ?? 1.9) + (inside ? 0 : world.heightAt(t.x, t.z)), t.z).project(camera);
  if (promptV.z > 1 || Math.abs(promptV.x) > 1.1 || Math.abs(promptV.y) > 1.1) { hud.setWorldPrompt(null); return; }
  hud.setWorldPrompt({ x: (promptV.x * 0.5 + 0.5) * innerWidth, y: (-promptV.y * 0.5 + 0.5) * innerHeight }, a.icon, a.label, opt);
}
/** Title, icon and « step n/m » (timed steps) of the running activity, for the progress pill. */
function progressMeta() {
  const c = activities.current; if (!c) return undefined;
  const timed = c.spec.steps.filter(s => (s.seconds ?? 0) > 0);
  return { title: c.spec.label, icon: c.spec.icon, step: timed.indexOf(c.step) + 1, steps: timed.length };
}

// ------------------------------------------------------------------ main loop
let last = performance.now(), statsT = 0;
/**
 * Debug profiler (?debug: `__dakar.perfOn(true)`, then `__dakar.perf()`): milliseconds per system and per module of the
 * frame loop, smoothed, for the evening performance budget (scripts/check-perf-evening.mjs). Off: one boolean test.
 */
let profOn = false;
const prof = new Map<string, number>();
const profMark = (name: string, t0: number) => { const v = performance.now() - t0; const o = prof.get(name); prof.set(name, o === undefined ? v : o * 0.92 + v * 0.08); };
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (document.hidden || !world) return;
  const tFrame = profOn ? performance.now() : 0;

  if (input.takeMenu()) { if (activities.running) activities.cancel('Arrêté'); else if (legacyRun) legacyRun.stop(); else if (lambScene instanceof LambScene) stopScene(); else if (hud.modalOpen) hud.closeModal(); else if (phone.isOpen) phone.close(); else if (mode === 'play') phone.open(); }
  if (phone.isOpen && mode === 'play') { mode = 'menu'; input.enabled = false; }   // a door or trip that finished behind the phone: keep movement off
  if (input.takeAction() && ((mode === 'play' && interactions.focus) || activities.running || legacyRun)) hud.onAction();
  activities.update(dt);
  { const mv = input.move(); strideUi.update(dt, Math.hypot(mv.x, mv.y) > 0.05, mode === 'play' && !seated && !lambScene); }
  if (profOn) for (const m of MODULES) { const t = performance.now(); m.update?.(ctx, dt); profMark('module:' + m.name, t); }
  else for (const m of MODULES) m.update?.(ctx, dt);

  const drag = input.takeDrag();
  drag.yaw += input.rotateKey() * dt * 1.8;
  if (lambScene) {
    const f = lambScene.update(dt);
    if (lambScene.snap) { camera.position.copy(f.cam); lambScene.snap = false; } else camera.position.lerp(f.cam, Math.min(1, dt * 3));
    camera.lookAt(f.look);
    if (lambScene.done) endScene();
  } else if (seated && (mode === 'play' || mode === 'busy' || seated.locked)) {
    // the body follows its seat every frame (seats in vehicles move); the stick stands up, except on a locked seat
    const m = input.move();
    speed = 0;
    if (mode === 'play' && !seated.locked && Math.hypot(m.x, m.y) > 0.35) standUp();      // moving the stick stands up (not in a moving vehicle)
    else if (cheerT > 0) { cheerT -= dt; pos.set(seated.x, seated.top + 0.1, seated.z); facing = seated.yaw; if (playerBody) playerBody.hold = 'Celebrate'; }   // up on the tier, arms up
    else { pos.set(seated.x, sitOriginY(seated), seated.z); facing = seated.yaw; if (playerBody && mode === 'play') playerBody.hold = seatClip(seated); }
    if (mode !== 'menu') state.tick(dt * 1000);
  } else if (mode === 'play') {
    const m = input.move();
    const fx = Math.sin(follow.yaw), fz = Math.cos(follow.yaw), rx = -Math.cos(follow.yaw), rz = Math.sin(follow.yaw);
    const dx = fx * m.y + rx * m.x, dz = fz * m.y + rz * m.x;
    const mag = Math.min(1, Math.hypot(m.x, m.y));
    const wantRun = input.keys.has('ShiftLeft') || input.keys.has('ShiftRight') || strideUi.runToggle;
    const target = stride.target(mag, wantRun, dt);
    speed += (target - speed) * Math.min(1, dt * (target > speed ? 6 : 12));
    if (mag > 0.05) {
      const want = Math.atan2(dx, dz);
      facing += Math.atan2(Math.sin(want - facing), Math.cos(want - facing)) * Math.min(1, dt * 14);
      let nx = pos.x + (dx / (Math.hypot(dx, dz) || 1)) * speed * dt, nz = pos.z + (dz / (Math.hypot(dx, dz) || 1)) * speed * dt;
      [nx, nz] = pushOut(nx, nz, inside ? 0.3 : 0.5, inside ? inside.int.colliders : world.colliders);
      const b = inside ? inside.int.bounds : world.bounds; nx = clamp(nx, b.x0, b.x1); nz = clamp(nz, b.z0, b.z1);
      stride.moved(Math.hypot(nx - pos.x, nz - pos.z));
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
  let tSys = profOn ? performance.now() : 0;
  npcLife.update(dt, pos, freeCam?.p ?? camera.position);
  if (profOn) { profMark('npcLife', tSys); tSys = performance.now(); }
  crowd?.update(dt); traffic?.update(dt); life?.update(dt); world.tick(dt);
  if (profOn) { profMark('walkers+traffic+life+world', tSys); tSys = performance.now(); }
  ambient?.update(dt, freeCam?.p ?? camera.position, quality === 'low' ? 55 : 90);
  if (profOn) { profMark('ambient(npc.ts)', tSys); tSys = performance.now(); }
  for (const a of apprentices) { const wp = a.h.group.getWorldPosition(tmpV); a.update(dt, !inside && Math.hypot(wp.x - pos.x, wp.z - pos.z) < 22); }
  for (const h of debugPeople) h.animate(dt, 0);
  const space = presenceSpace();
  // the body's own pose, also while an activity runs (asleep in bed, praying, dancing): a narrow list, anything else is Idle
  const clip = mode !== 'scene' && playerBody?.clipName && PRESENCE_CLIPS.includes(playerBody.clipName as PresenceClip) ? playerBody.clipName as PresenceClip : 'Idle';
  // the modules' optional fields (the arena show friends share: src/arena/together.ts), validated by the protocol
  const extras: Partial<PresenceExtras> = {}; for (const m of MODULES) Object.assign(extras, m.presence?.(ctx) ?? {});
  presence.publish({ type: 'move', x: pos.x, y: pos.y, z: pos.z, yaw: facing, speed: mode === 'play' ? speed : 0, space, clip, ...extras }, now);
  remoteAvatars.update(dt, pos, space, quality === 'low' ? 6 : quality === 'medium' ? 10 : 14, camera, innerHeight);
  chat.update(dt, camera, innerHeight);
  findNearest();
  const focus = mode === 'play' && !lambScene ? interactions.update(interactSpace(), pos.x, pos.z, facing) : (interactions.focus = null);
  economy.update(dt, pos, !!inside, mode === 'play' && !lambScene, inside ? inside.door : pos);

  if (!lambScene && !MODULES.some(m => m.camera?.(ctx, dt, drag))) follow.update(dt, pos, facing, drag, inside ? inside.int.colliders : world.colliders, innerHeight > innerWidth, speed > 0.5, inside ? inside.int.cameraBox : undefined, inside ? undefined : (x, z) => world!.heightAt(x, z), inside ? undefined : world.canopies);
  if (camOverride && !lambScene) {
    const a = facing + camOverride.side;
    camera.position.set(pos.x + Math.sin(a) * camOverride.dist, camOverride.h, pos.z + Math.cos(a) * camOverride.dist);
    camera.lookAt(pos.x, camOverride.h - 0.1, pos.z);
  }
  const ct = cityTimeAt(presence.serverNow()); const hour = hourOverride ?? ct.hourFloat;
  updateLighting(hour);
  statsT -= dt;
  if (statsT <= 0) { statsT = 0.25; hud.setStats(state.wallet, state.data.needs, state.mood()); const sg = suggestion(rel, state), ev = eveningLine(ctx, welcomeFirst(sg?.id === 'ibou_welcome', state.data)); eveningTarget = ev?.target ?? null; guideNpc = !ev && sg && 'npc' in sg ? sg.npc : null; guideJob = !ev && sg?.id === 'goal_tiak'; hud.setGoal(mode === 'play' && !arenaShow.watching() ? walkingHint() ?? (ev ? withBearing(ev.text, ev.target) : null) ?? sg?.hint ?? null : null); const pc = placeClock(ct.day, hourOverride === null ? hour : Math.floor(hour), state.data.counters[GALA_DONE_COUNTER] === ct.day); hud.setPlace(HUB_NAMES[world.id], pc.clock, hour < 6 || hour >= 19, pc.tag); }
  if (freeCam) { camera.position.copy(freeCam.p); camera.lookAt(freeCam.t); }
  showPrompt(focus);                                       // after the camera moved: the bubble sticks to its target
  if (profOn) { profMark('rest of update', tSys); tSys = performance.now(); }
  renderer.render(scene, camera);
  if (profOn) { profMark('render (CPU)', tSys); profMark('frame (JS)', tFrame); }
}

// ------------------------------------------------------------------ start
resize(); applyQuality();
async function start() {
  await Promise.all([preloadAssets(), preloadHumanoid()]);
  for (const m of MODULES) m.init?.(ctx);
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
    presence: () => ({ status: presence.status, id: presence.id, room: presence.room, count: presence.count, peers: [...presence.peers.values()], visible: remoteAvatars.size, poses: remoteAvatars.poses() }),
    teleport(hub: HubId, x?: number, z?: number, yaw = 0) { loadHub(hub, x === undefined ? undefined : { x, z: z ?? 0, yaw }); },
    setHour(h: number | null) { hourOverride = h; },
    pos: () => ({ x: pos.x, y: pos.y, z: pos.z, hub: world?.id, mode, near: nearest?.name ?? null }),
    interactables: () => world?.interactables.map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z })) ?? [],
    cityPlaces: () => world?.interactables.filter(i => i.id.includes(':city:')).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z, radius: i.radius, actions: i.actions.map(a => ({ id: a.id, label: a.label, gain: a.gain, cost: a.cost })) })) ?? [],
    cityGeometry: () => world ? { bounds: world.bounds, colliders: world.colliders, people: world.people } : null,
    places: openPlaces,
    destination: () => destination?.id ?? null,
    lookYaw(y: number) { follow.pin(); follow.yaw = y; },
    act() { hud.onAction(); },
    drawCalls: () => renderer.info.render.calls,
    tris: () => renderer.info.render.triangles,
    /** Debug profiler: on/off, and the smoothed milliseconds per system and module (see the main loop). */
    perfOn(on = true) { profOn = on; if (on) prof.clear(); },
    perf: () => Object.fromEntries([...prof].map(([k, v]) => [k, Math.round(v * 1000) / 1000])),
    /**
     * Draw calls and triangles of this view, and each top-level group's share (the frame rendered again with that group
     * hidden; shadows included). For the evening performance budget.
     */
    renderBreakdown() {
      const measure = () => { renderer.render(scene, camera); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
      const base = measure(), by: Record<string, { calls: number; tris: number }> = {};
      const groups = [...extra.children, ...scene.children.filter(c => c !== extra)];
      for (const g of groups) {
        if (!g.visible) continue;
        g.visible = false; const m = measure(); g.visible = true;
        const key = g.name || g.type, o = by[key] ?? (by[key] = { calls: 0, tris: 0 });
        o.calls += base.calls - m.calls; o.tris += base.tris - m.tris;
      }
      measure();
      return { base, by };
    },
    nearestInteractable: () => nearest?.name ?? null,
    focus: () => { const t = interactions.focus; return t ? { id: t.id, name: t.name, kind: t.kind, space: t.space, primary: interactions.primary(t)?.label ?? null, all: interactions.all(t).map(a => a.label) } : null; },
    seated: () => seated?.id ?? null,
    seatsHere: () => seats.inSpace(interactSpace()).map(s => ({ id: s.id, x: s.x, z: s.z, top: s.top, yaw: s.yaw, kind: s.kind, occupant: s.occupant })),
    sit(id: string) { const s = seats.get(id); if (s) sitOn(s); return seated?.id ?? null; },
    stand() { standUp(); },
    /** « Encourager » from a place in the stands (true if the player rose to cheer). */
    cheer(s?: number) { return cheer(s); },
    more() { openMore(); },
    clip: () => playerBody?.clipName ?? null,
    activity: () => { const c = activities.current; return c ? { id: c.spec.id, step: c.step.label, index: c.index, scores: c.scores } : null; },
    gesture: () => gestures.info(),
    stride: () => ({ stamina: Math.round(stride.stamina), max: stride.maxStamina(), running: stride.running, winded: stride.winded, forme: stride.forme, speed, run: stride.runSpeed(), why: stride.whyNot(), toggle: strideUi.runToggle }),
    strideToggle: (on: boolean) => { strideUi.runToggle = on; },
    /** Checks that test something else than the gesture itself finish it at once with this score. */
    gestureFinish: (score = 1) => gestures.finishNow(score),
    placeList: () => places.all().map(p => ({ id: p.id, type: p.type, name: p.name, space: p.space, anchors: p.anchors.map(a => a.id) })),
    inventory: () => inventory.list(),
    roomInteractables: () => inside ? inside.int.interactables.map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z })) : [],
    travelTo: (h: HubId) => doTravel(h),
    rel, beats: () => ({ ...state.data.beats }), flags: () => [...state.data.flags],
    suggestion: () => suggestion(rel, state)?.id ?? null,
    playBeat(id: string, choice: string) { const b = BEATS.find(x => x.id === id)!; const c = b.choices.find(x => x.id === choice)!; return applyChoice(b, c, rel, state); },
    npcWhere: (id: string) => npcLife.where(id), npcSheet: (id: string) => npcLife.sheet(id),
    npcSettle: () => npcLife.settle(), npcAudit: () => npcLife.audit(), npcSlots: (h: number) => npcLife.slotsAt(h), people: () => npcLife.openPeople(),
    openNpc(id: string) { const it = world?.interactables.find(i => i.npc === id); if (it) openActions(it); },
    scene(kind: SceneKind) { const a = [...ACTIONS.arena, ...ACTIONS.ecurie].find(x => x.special === kind); if (a) runSpecial(a); else startScene(kind); },
    wrestlerReady: () => humanoidReady(),
    body: () => playerBody,
    faceCamera() { follow.pin(); follow.yaw = facing + Math.PI; },
    portrait(dist = 2.2, h = 1.5, side = 0.35) { camOverride = dist > 0 ? { dist, h, side } : null; },
    addPeople(n = 6) { if (!world) return; for (let k = 0; k < n; k++) { const h = new Humanoid(randomLookDbg()); h.group.position.set(pos.x + Math.sin(facing + 0.6 + k * 0.45) * (2.6 + (k % 2) * 1.2), 0.1, pos.z + Math.cos(facing + 0.6 + k * 0.45) * (2.6 + (k % 2) * 1.2)); h.group.rotation.y = facing + Math.PI; h.hold = k % 3 === 0 ? 'Talk' : 'Idle'; extra.add(h.group); debugPeople.push(h); } },
    sceneInfo: () => (lambScene ? { kind: lambScene.kind, t: lambScene.t } : null),
    /** The follow camera's last frame: free room behind the player (m), tight, extra pitch, swinging, occluders near. */
    camInfo: () => ({ ...follow.info, yaw: follow.yaw, x: camera.position.x, y: camera.position.y, z: camera.position.z }),
    /** Whether the camera sits inside a tree's leaves now (it never should). */
    camInLeaves: () => !!world?.canopies?.some(t => camera.position.y > t.y0 && camera.position.y < t.y1 && Math.hypot(camera.position.x - t.x, camera.position.z - t.z) < t.r),
    sceneCrowd: () => (lambScene instanceof LambScene ? lambScene.crowdSpots() : []),
    /** Distance from a to the first world surface on the segment a→b (equals the segment length when nothing is in the way). */
    sightline(a: [number, number, number], b: [number, number, number]) {
      const A = new THREE.Vector3(...a), d = new THREE.Vector3(...b).sub(A), len = d.length();
      const rc = new THREE.Raycaster(A, d.normalize(), 0.05, len); rc.camera = camera;
      const hit = world ? rc.intersectObject(world.group, true)[0] : undefined;
      return { len, hit: hit ? hit.distance : len };
    },
    duel() { startDuel('amical', 'costaud'); },
    duelStart(m: BoutMode = 'amical', style?: StyleId, discipline: Discipline = 'sans_frappe', name?: string) { startDuel(m, style, undefined, discipline, name); },
    duelStrike(kind: 'quick' | 'big' = 'quick') { if (lambScene instanceof LambDuel) lambScene.pressStrike(kind); },
    duelMove(kind: 'push' | 'pull' | 'pivot') { if (lambScene instanceof LambDuel) lambScene.pressMove(kind); },
    /** In the empoignade, the big-strike button: « Projeter », or « Contrer » while he tries a throw. */
    duelThrow() { if (lambScene instanceof LambDuel) lambScene.pressStrike('big'); },
    /** Coach Ablaye's lesson avec frappe: skip the current step (« Passer »). */
    duelLessonSkip() { if (lambScene instanceof LambDuel) lambScene.skipLessonStep(); },
    duelSet(side: 'player' | 'opponent', v: { balance?: number; composure?: number; stamina?: number; grip?: number }) { if (lambScene instanceof LambDuel) lambScene.debugSet(side, v); },
    /** Checks only: hold the opponent, the round's clock and the referee still while a position is set up (avec frappe). */
    duelHold(on: boolean) { if (lambScene instanceof LambDuel) lambScene.debugHold(on); },
    /** Checks only: the seconds left in the round. */
    duelClock(seconds: number) { if (lambScene instanceof LambDuel) lambScene.debugClock(seconds); },
    duelInfo: () => (lambScene instanceof LambDuel ? lambScene.info() : null),
    duelGrab() { if (lambScene instanceof LambDuel) lambScene.pressGrab(); },
    duelGuard(on: boolean) { if (lambScene instanceof LambDuel) lambScene.setGuard(on); },
    duelBreak() { if (lambScene instanceof LambDuel) lambScene.pressBreak(); },
    duelAbandon(confirm = true) { if (lambScene instanceof LambDuel) { if (confirm) lambScene.abandon(); else lambScene.askAbandon(true); } },
    duelFinish() { if (lambScene instanceof LambDuel) lambScene.finish(); },
    /** Screen pixels of points on both wrestlers (checks that the touch buttons never cover them). */
    duelScreen: () => (lambScene instanceof LambDuel ? lambScene.fighterPoints().map(p => { const v = new THREE.Vector3(...p).project(camera); return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight }; }) : null),
    arenaProfile: () => phoneHooks.arenaProfile?.() ?? [],
    scenePeek(t: number) { if (lambScene) { lambScene.t = t; lambScene.snap = true; } },
    outfit: () => openOutfit(), journal: () => openJournal(),
    phone(app?: string) { hud.closeModal(); return phone.open(app); },
    phoneClose() { phone.close(); },
    phoneInfo: () => phone.info(), phoneHooks: phone.hooks,
    emote(i = 0) { playEmote(i); },
    setLook(c: string, p: string, acc: string[]) { Object.assign(state.data.wrestler, { ngembColor: c, ngembPattern: p, accessories: acc }); },
    enter(kind: 'home' | 'gargote') { const it = world?.interactables.find(i => i.id.includes(`:${kind}:`)); if (it) enterInterior(it); },
    exit() { exitInterior(); },
    look(yaw: number, pitch?: number) { follow.pin(); follow.yaw = yaw; if (pitch !== undefined) follow.pitch = pitch; },
    place(x: number, z: number, yaw: number) { pos.set(x, 0.1 + (world?.heightAt(x, z) ?? 0), z); facing = yaw; follow.snapBehind(yaw); },
    cam(p: [number, number, number] | null, t?: [number, number, number]) { freeCam = p && t ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t) } : null; },
    meshStats() {
      const rows: { name: string; tris: number; visible: boolean }[] = [];
      world?.group.children.forEach((o, i) => { let t = 0; o.traverse(m => { const g = (m as THREE.Mesh).geometry; if (g) t += (g.index ? g.index.count : g.attributes.position.count) / 3; }); rows.push({ name: `${i}:${o.type}:${((o as THREE.Mesh).material as THREE.Material | undefined)?.type ?? ''}`, tris: Math.round(t), visible: o.visible }); });
      return rows.sort((a, b) => b.tris - a.tris).slice(0, 12);
    },
    lookAtPlayer(dist = 4, yawOff = Math.PI) { follow.pin(); follow.yaw = facing + yawOff; void dist; },
    ...economy.debug(),
  };
  for (const m of MODULES) Object.assign((window as unknown as { __dakar: Record<string, unknown> }).__dakar, m.debug?.(ctx));
}
