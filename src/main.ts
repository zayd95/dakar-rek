import './ui/style.css';
import * as THREE from 'three';
import { turnStep } from './core/turn';
import { Input } from './core/input';
import { fovFor } from './core/view';
import { GameState } from './core/state';
import { cityTimeAt, daylight } from './core/clock';
import { clamp, lerp, rng } from './core/rng';
import { loadSave, writeSave, clearSave, newSave, resumeSpot, restoredExtras, suggestedAvatar } from './core/save';
import { holdSaves, initSaveHealth, reportWrite, saveHealth, saveLine, saveMirror, savesHeld } from './core/saveHealth';
import { backupOf, exportCode, importSave, undoImport } from './core/saveTransfer';
import { readTestParams } from './core/testParams';
import { loadPlayerBody, bodyOf } from './actors/playerBody';
import { openStudio, type StudioResult } from './ui/characterStudio';
import { appearanceOf, defaultAppearance, encodeAppearance } from './actors/appearance';
import { renderPortrait } from './actors/portrait';
import type { HubId } from './core/types';
import { HUB_IDS } from './core/types';
import { HALF, buildHub, buildHubSteps, hubLayout } from './world/builder';
import { Sky } from './world/sky';
import { setGrainEnabled } from './world/grain';
import { buildInterior, disposeInterior, setInteriorDaylight, type Interior } from './world/interiors';
import { ACTIONS, HUB_NAMES, travelLeg } from './world/content';
import { inBand, type Action, type Collider, type HubWorld, type Interactable } from './world/types';
import { Character, PLAYER_OUTFIT } from './actors/character';
import { Crowd, DecorativeTraffic } from './actors/npc';
import { MonumentLife } from './actors/life';
import { PlacedPeople } from './actors/placedPeople';
import { Apprentice } from './actors/apprenti';
import { FollowCamera } from './actors/camera';
import { Hud, fcfa, type MenuItem } from './ui/hud';
import { preloadAssets } from './actors/vehicles';
import { preloadGlbVehicles } from './actors/glbVehicle';
import { missionTarget } from './game/missionGuide';
import { navigation } from './game/navigation';
import { preloadHumanoid, humanoidReady, Humanoid, randomLook, setAnimShadows, setHumanoidView, type Clip, type PersonLook } from './actors/humanoid';
import { SOLE as GAIT_SOLE } from './actors/gait';
import { castById, CAST } from './social/cast';
import { NpcLife } from './social/npcLife';
import { ROUTINES } from './social/routines';
import { Relations, PLAYER } from './social/relations';
import { BEATS, availableBeat, suggestion, suggestionHere, applyChoice, settleWelcome, welcomeByTalk, type Beat } from './social/beats';
import { goalNow, hudDue, hudSpace, needGoal } from './game/goalLine';
import { quietLog } from './ui/quiet';
import { applyWalk, walkCard, walkMinutes, walkTargets, waysOut, wayToward } from './world/walk';
import { restSpot, setRestSpot } from './game/rest';
import { Pacer, hiddenEvery } from './game/pace';
import { arenaFighter } from './arena/fighter';
import { currentHome } from './economy/assets';
import { homeSpec } from './economy/catalog';
import { LambScene, SCENE_LABEL, type SceneKind } from './lamb/scenes';
import { LambDuel } from './lamb/duel';
import { ATTRS, fighterAttributes, type Counters } from './career/career';
import { drillOfAction } from './lamb/drills';
import { FRIENDLY_MORE, STYLE_MAP, rosterOpponent } from './lamb/opponents';
import { lamb2On } from './lamb/flag';
import { PARTNER, RULES, RULES_STATUS, STYLES, STYLE_IDS, arenaProfileRows, opponentLevel, rankedStyle, record, recordIncrements, type BoutMode, type Discipline, type StyleId } from './lamb/rules';
import { phoneHooks } from './ui/phoneHooks';
import { dealerDirectory } from './transport/dealers';
import { EMOTES } from './lamb/poses';
import { ACCESSORIES, NGEMB_COLORS, NGEMB_PATTERNS, REVIEW_STATUS } from './lamb/look';
import { PresenceClient, loadProfile } from './multiplayer/client';
import { OnlineAccount } from './online/client';
import { online, setOnline } from './online/api';
import { visitDeps } from './online/visit';
import { fakeOnlineRequested, installFakeOnline } from './online/fake';
import { startMessageNotices } from './ui/phone/apps/messages';
import { RemoteAvatars, avatarLook } from './multiplayer/avatars';
import { dressFan } from './arena/supporterGear';
import { PresenceUi } from './multiplayer/ui';
import { Phone } from './ui/phone';
import { mapBridge } from './ui/minimap';
import { theme } from './ui/theme';
import { ChatUi } from './multiplayer/chat';
import { EMOTE_INFO, Emoter, Notice, PlayerSocial, seatedPeers } from './multiplayer/social';
import { isHub, lookIndex, nickname, MAX_ROOMS_PER_HUB, PRESENCE_CLIPS, type PresenceClip, type PresenceExtras } from './multiplayer/protocol';
import { Economy } from './economy/ui';
import { pickupFrags } from './economy/jobs';
import { activityOf } from './economy/polyvalence';
import { Interactions } from './interact/system';
import { Seats, seatClip, sitOriginY, standSpots, type Seat } from './interact/seats';
import { approachPath } from './interact/approach';
import { reach, bodyPoint, mouth, bend, nod, grip } from './actors/gesture';
import { LegacySource } from './interact/legacy';
import type { Target } from './interact/types';
import { ActivityRunner } from './activity/runner';
import { Places } from './activity/places';
import { Inventory } from './activity/inventory';
import { actionVerb } from './interact/legacy';
import { SHOP_COPY } from './ui/shopCopy';
import { objectiveMarks, isObjectiveAction } from './social/objectiveMarks';
import { shopRegular } from './social/regular';
import { People } from './interact/people';
import type { ActivitySpec } from './activity/types';
import { MODULES, type GameCtx } from './game/modules';
import { bankModule } from './economy/bankModule';
import { ownsVehicle, park, parked, type VehicleAsset } from './transport/owned';
import { CorridorHost, type Swap } from './road/host';
import { approachLink, hasLinks } from './transport/hubLink';
import { vehicleAudio as trafficAudio } from './transport/vehicleAudio';
import { transport } from './transport/module';
import { specOf as catalogSpec } from './economy/catalog';
import { arenaShow } from './arena/module';
import { eveningLine, placeClock } from './arena/eveningCall';
import { GALA_DONE_COUNTER } from './arena/program';
import { weatherNow } from './city/weather';
import { GesturePlayer } from './ui/gesture';
import { Stride, type RunLevel } from './game/stride';
import { StrideUi } from './ui/stride';
import { noteWork } from './economy/streakModule';
import { STREAK, runOf } from './economy/streak';
import { prayerPresence } from './actors/prayerPoses';
import { setVillaFacadeNight } from './housing/villaFacade';
/** Activity categories whose pay is work (a day worked): not leisure, prayer, travel or a social visit. */
const WORK_CATEGORIES = new Set(['livraison', 'service', 'commerce', 'combat', 'peche', 'artisanat']);

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');
const TEST = readTestParams(location.hostname, location.search);   // preview-only test links (src/core/testParams.ts)

// ------------------------------------------------------------------ storage (guest save is device-local)
let store: Storage | null = null;
try { store = window.localStorage; store.getItem('x'); } catch { store = null; }
initSaveHealth(!!store);

// ------------------------------------------------------------------ renderer and scene
const canvas = document.getElementById('c') as HTMLCanvasElement;
let renderer: THREE.WebGLRenderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });   // stencil: a car's cabin seen through its painted glass (src/transport/carCabin.ts)
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
  low: { pr: 1, shadow: 0, crowd: 8, traffic: 8 },
  medium: { pr: 1.5, shadow: 1024, crowd: 12, traffic: 9 },
  high: { pr: 2, shadow: 2048, crowd: 16, traffic: 12 },
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
  setAnimShadows(QUAL[quality].shadow > 0);                 // (without a shadow pass a body out of the view is unseen: animated like a hidden one)
  if (QUAL[quality].shadow) { sun.shadow.mapSize.set(QUAL[quality].shadow, QUAL[quality].shadow); sun.shadow.map?.dispose(); sun.shadow.map = null; }
  scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  try { store?.setItem('dakarrek.quality', quality); } catch { /* */ }
}
let viewW = 0, viewH = 0, resizeQueued = 0;
function resize() {
  if (resizeQueued) { cancelAnimationFrame(resizeQueued); resizeQueued = 0; }
  const w = innerWidth, h = innerHeight;
  if (w === viewW && h === viewH) return;
  viewW = w; viewH = h;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = fovFor(w, h); camera.updateProjectionMatrix();
}
/** Turning a phone: Safari reports the new size late on some rotations, and the visual viewport moves with the toolbars
 *  — resize on the next frame after any of them, and once more when the rotation has settled. */
const queueResize = () => { if (!resizeQueued) resizeQueued = requestAnimationFrame(resize); };
addEventListener('resize', () => { resize(); queueResize(); });
addEventListener('orientationchange', () => { queueResize(); setTimeout(queueResize, 350); });
window.visualViewport?.addEventListener('resize', queueResize);

// ------------------------------------------------------------------ game objects
const input = new Input(canvas);
const hud = new Hud(document.getElementById('ui')!, input);
const saved = loadSave(store);
/** A save written by an older client lost the debts, the rides' record, the player's days or the streak: they were taken back from the extras backup (said once, below). */
const restored = [...restoredExtras];
const isNewGame = !saved;
const state = new GameState(saved ?? newSave());
if (TEST.money !== null && state.wallet < TEST.money) state.addMoney(TEST.money - state.wallet, 'Test');
const presence = new PresenceClient(loadProfile(store, state.data.guestId), import.meta.env.VITE_MULTIPLAYER === 'true', import.meta.env.VITE_PRESENCE_URL);
presence.setAppearance(state.data.appearance ? encodeAppearance(state.data.avatar, state.data.appearance) : null, false);   // the studio's look travels with the connection (servers that relay it)
const remoteAvatars = new RemoteAvatars(presence); scene.add(remoteAvatars.group);
// LD2.0-B: the player's online account (Messages, Teranga Money, visits, meetups: src/online/client.ts) beside the hub's presence. Its saves must be synchronous
// and say false when nothing was written: a top-up is never sent before the wallet's debit is on disk.
const onlineAccount = new OnlineAccount({
  state, saveNow: () => (world ? saveNow() : !savesHeld() && writeSave(store, state.data)),
  profile: () => ({ name: presence.profile.name, look: presence.profile.look, app: presence.appearance ?? null }),
  endpoint: import.meta.env.VITE_PRESENCE_URL ? new URL('/api/me', import.meta.env.VITE_PRESENCE_URL).href : undefined,
  enabled: import.meta.env.VITE_MULTIPLAYER === 'true',
});
// A build without the server has no account (`online` stays null: Messages and Teranga Money say so and hide). `?debug&fakeonline` swaps in the
// in-memory account of the checks (src/online/fake.ts), never presented to players as real.
if (fakeOnlineRequested()) installFakeOnline({ now: () => presence.serverNow(), wallet: { get: () => state.wallet, add: (n, label) => { state.addMoney(n, label); } }, save: () => { if (world) saveNow(); }, me: { name: presence.profile.name } });
else if (import.meta.env.VITE_MULTIPLAYER === 'true') setOnline(onlineAccount);
startMessageNotices(m => hud.toast(m));                                                 // « 💬 Awa : … » for what arrives outside the open conversation
// a visit or a meeting joins the other player's presence room (src/online/visit.ts); the account refreshes the host's snapshot by itself
visitDeps.room = () => presence.room;
visitDeps.joinRoom = (hub, room) => { if (hub === world?.id) presence.join(hub, room); };
const emoter = new Emoter(), notice = new Notice();
remoteAvatars.dress = (body, peer) => { dressFan(body, peer.fan); };   // the écurie colours another player wears (presence `fan`)
const rel = new Relations(state.data);
settleWelcome(rel, state);                                   // a save whose player already talked with Ibou: his welcome is done
const follow = new FollowCamera(camera);
const player = new Character(PLAYER_OUTFIT);
scene.add(player.group);
const pos = new THREE.Vector3();
const tmpV = new THREE.Vector3();
let facing = 0, speed = 0;
let world: HubWorld | null = null;
let destination: { id: string; hub: HubId; name?: string } | null = null;
let crowd: Crowd | null = null, traffic: DecorativeTraffic | null = null, life: MonumentLife | null = null;
let apprentices: Apprentice[] = [];
/** Ambient people placed by the hub builder (dibiterie cook, customers…). */
let ambient: PlacedPeople | null = null;
/** Debug-only fixed camera (screenshots of landmarks). */
let freeCam: { p: THREE.Vector3; t: THREE.Vector3 } | null = null;
/** Recurring cast: routines, memory, situations (src/social/npcLife.ts). */
const npcLife = new NpcLife({ hud, rel, state, clock: () => { const ct = cityTimeAt(presence.serverNow()); return { hour: hourOverride ?? ct.hourFloat, day: ct.day }; }, menuMode: () => { mode = 'menu'; }, idle: () => mode === 'play' && !moduleSpace(), save: () => { saveNow(); }, openBeat: b => openBeat(b) });
/** Player's visible body: the Blender humanoid when loaded (the box Character stays as the logic stand-in). */
const PLAYER_LOOK: PersonLook = avatarLook(presence.profile.look);
let playerBody: Humanoid | null = null;
/** The player's body for the identity in the save (v4 for a save without one, or when the Meshy file cannot be loaded). Rebuilt when the quality class changes. */
let bodyLow: boolean | null = null;
async function makePlayerBody() {
  const low = quality === 'low', id = await loadPlayerBody(TEST.avatar === 'v4' ? null : state.data.avatar, low);   // (`?avatar=v4`: the shipped v4 body, for the checks)
  if (playerBody && playerBody.body === id && bodyLow === low) { playerBody.setAppearance(state.data.appearance); return; }
  const old = playerBody;
  playerBody = new Humanoid(PLAYER_LOOK, id); playerBody.fullRate = true; playerBody.hold = old?.hold ?? null; bodyLow = low;
  playerBody.setAppearance(state.data.appearance);                  // the creator's skin, hair and outfit (null: the body as it was)
  scene.add(playerBody.group); player.group.visible = false;
  old?.dispose();
}
/** New Game (no save, not a ?debug run): the character studio (src/ui/characterStudio.ts) opens at once, before the assets finish loading. Test links can force the body (src/core/testParams.ts). */
const creating = isNewGame && TEST.avatar !== 'homme' && TEST.avatar !== 'femme' && TEST.avatar !== 'v4' && (TEST.avatar === 'choose' || !DEBUG);
function settleAvatar(made: StudioResult | null) {
  if (TEST.avatar === 'homme' || TEST.avatar === 'femme') state.data.avatar = TEST.avatar;
  else if (made) { applyCharacter(made); reportWrite(writeSave(store, state.data)); }   // saved at once (the world is not built yet): leaving before the first autosave keeps the character
}
/** The first name and the shirt colour go to the device's presence profile (what other players read: a name, a colour index and, where the server relays it, the look); the body and the look to the save. */
function setPresenceProfile(name: string | null, color: number) {
  presence.setAppearance(state.data.appearance ? encodeAppearance(state.data.avatar, state.data.appearance) : null, false);   // the profile change below reconnects with it
  const profile = { name: nickname(name ?? presence.profile.name), look: lookIndex(color) };
  try { store?.setItem('dakarrek.presence.profile', JSON.stringify(profile)); } catch { /* session-only profile */ }
  presence.setProfile(profile); onlineAccount.profileChanged(); Object.assign(PLAYER_LOOK, avatarLook(profile.look)); playerBody?.setLook(PLAYER_LOOK);
}
function applyCharacter(r: StudioResult) {
  state.data.avatar = r.avatar; state.data.appearance = r.appearance ? appearanceOf(r.appearance, r.avatar) : null;   // (before the profile: the presence carries the look)
  setPresenceProfile(r.name, r.appearance?.color ?? presence.profile.look);
  if (r.portrait) storePortrait(r.portrait);
}
// ------------------------------------------------------------------ the Profile picture: the player's own avatar, drawn once (by the studio, or here by the game's renderer) and kept on the device
const PORTRAIT_KEY = 'dakarrek.portrait';
const portraitFor = () => state.data.appearance ? encodeAppearance(state.data.avatar, state.data.appearance) : `${state.data.avatar}:made`;
let portraitWanted = false;
/** The picture of this session (kept here too: without storage, or with it full, it is still drawn only once per look), and the looks already tried. */
let portraitMem: { key: string; url: string } | null = null;
const portraitTried = new Set<string>();
function storePortrait(url: string) { portraitMem = { key: portraitFor(), url }; try { store?.setItem(PORTRAIT_KEY, JSON.stringify(portraitMem)); } catch { /* full storage: this session keeps it */ } }
function profilePortrait(): string | null {
  const key = portraitFor();
  if (portraitMem?.key === key) return portraitMem.url;
  try { const p = JSON.parse(store?.getItem(PORTRAIT_KEY) ?? 'null') as { key?: string; url?: string } | null; if (p?.key === key && typeof p.url === 'string' && p.url.startsWith('data:image/')) { portraitMem = { key, url: p.url }; return p.url; } } catch { /* unreadable */ }
  if (!portraitTried.has(key)) { portraitTried.add(key); portraitWanted = true; }   // once per look: a picture that cannot be drawn leaves the icon, never a loop
  return null;
}
/** Draws the Profile picture with the game's own renderer (a body of its own, just before the frame is drawn: nothing of it is ever seen). */
function drawPortrait() {
  portraitWanted = false;
  const id = playerBody?.body; if (!id || id === 'v4') return;
  const h = new Humanoid(undefined, id); h.fullRate = true; h.play('Idle', 0); h.setAppearance(state.data.appearance);
  for (let i = 0; i < 4; i++) h.animate(1 / 60, 0);
  let made = false;
  try { const c = renderPortrait(renderer, h, { width: 160, height: 160, focus: 'face', yaw: -0.42, bg: 0x1d2438 }); storePortrait(c.toDataURL('image/jpeg', 0.86)); made = true; } catch { /* no picture: the Profile keeps its icon */ }
  h.dispose();
  if (made) phone.refresh();
}
/** Phone › Profil › « Modifier mon personnage »: the same studio on the current look, over the paused game; nothing else changes (no new game, no loss). */
let studioOpen = false;
async function editCharacter() {
  if (studioOpen) return;
  const was = mode; mode = 'busy'; input.enabled = false; input.reset(); hud.resetControls(); studioOpen = true;
  try {
    // a save from before the studio has no look: it starts from the body's own, in the shirt colour the others already see
    const appearance = state.data.appearance ?? { ...defaultAppearance(state.data.avatar), color: presence.profile.look };
    const r = await openStudio({ mode: 'edit', low: quality === 'low', avatar: state.data.avatar, appearance, keep: state.data.appearance, name: presence.profile.name });
    studioOpen = false;
    if (r) { applyCharacter(r); const kept = saveNow(); await makePlayerBody(); hud.toast(kept ? 'Ton personnage est enregistré.' : 'Ton personnage a changé, mais ce navigateur n’a pas pu l’enregistrer (Réglages › Partie).'); }   // saved before the body loads: leaving at once keeps the choice
  } catch { /* the studio could not open or close cleanly: the game goes on as it was */ }
  finally {
    studioOpen = false;
    if (mode === 'busy') { mode = was === 'menu' ? 'play' : was; input.enabled = mode === 'play'; }
  }
}
const debugPeople: Humanoid[] = [];
/** ?debug: bodies walking in a straight line at a set speed (the gait checks: near and far from the camera, ANIM_LOD). */
const debugWalkers: { h: Humanoid; vx: number; vz: number; x0: number; z0: number; t: number; run: number }[] = [];
const dbgRand = rng(42);
const randomLookDbg = () => randomLook(dbgRand);
let lambScene: LambScene | LambDuel | null = null;
let emoteT = 0;
const extra = new THREE.Group(); scene.add(extra);
let mode: 'play' | 'menu' | 'busy' | 'scene' = 'play';
/** Set once the module context (`ctx`, below) exists. */
let ctxReady = false;
let hourOverride: number | null = TEST.hour;
/** Checks: days moved forward on the city's calendar (the vehicles economy's debts and once-a-day errands are dated by city day). */
let dayShift = 0;
/** Walkable interiors of this hub, and the one the player is in. */
let interiors = new Map<string, Interior>();
let inside: { int: Interior; door: Interactable } | null = null;
/** Debug only: fixed camera offset from the player (front portraits for visual review). */
let camOverride: { dist: number; h: number; side: number } | null = null;
const invitedHub = isHub(params.get('hub')) ? params.get('hub') as HubId : null;
const roomParam = Number(params.get('room'));
const invitedRoom = Number.isInteger(roomParam) && roomParam >= 1 && roomParam <= MAX_ROOMS_PER_HUB ? roomParam : null;
const presenceUi = new PresenceUi(presence, hud, store, () => world?.id ?? null, profile => { Object.assign(PLAYER_LOOK, avatarLook(profile.look)); playerBody?.setLook(PLAYER_LOOK); if (state.data.appearance && state.data.appearance.color !== profile.look) { state.data.appearance = { ...state.data.appearance, color: profile.look }; playerBody?.setAppearance(state.data.appearance); presence.setAppearance(encodeAppearance(state.data.avatar, state.data.appearance), false); } onlineAccount.profileChanged(); }, () => { mode = 'menu'; input.enabled = false; });   // (the look follows the colour before the profile's reconnection, which carries it: one socket)
const chat = new ChatUi({ presence, avatars: remoteAvatars, scene, storage: store, enabled: import.meta.env.VITE_MULTIPLAYER === 'true', local: () => pos, space: presenceSpace,
  suspend: on => { if (on) { input.enabled = false; input.reset(); } else if (mode === 'play') input.enabled = true; } });
presence.onChange = () => { presenceUi.update(); chat.refresh(); if (!presence.count) remoteAvatars.clear(); onlineAccount.setWhere(presence.status === 'online' ? world?.id ?? null : null, presence.room); };
// Lot B economy (src/economy/*): Tiak Tiak deliveries, wallet history, starter-room furniture, phone hooks. Device-local.
const economy = new Economy({ state, hud, scene, menu: () => { mode = 'menu'; }, save: () => !!world && saveNow(), walkTo: id => setDestination(id) });
/** The one walking marker of the city (see openPlaces): a place of the current hub, or nothing. */
function setDestination(id: string | null) { destination = id && world ? { id, hub: world.id } : null; }
/** A bout at the arena (the duel in its ring): the others in the street still see the player there, in the ring. */
const arenaDuel = () => lambScene instanceof LambDuel && lambScene.mode !== 'entrainement';
function presenceSpace() { return lambScene ? (arenaDuel() ? 'street' : 'scene') : modulePresence() ?? moduleSpace() ?? (inside ? inside.door.id.includes(':home:') ? 'home' : inside.door.id : 'street'); }
/** A module's presence space when it differs from its interaction space (one's own motorbike: still in the street). */
function modulePresence(): string | null { if (!ctxReady) return null; for (const m of MODULES) { const s = m.presenceSpace?.(ctx); if (s) return s; } return null; }
/** A module's own space the player is in (a vehicle while riding: src/transport), or null. */
/** Module-owned space (a vehicle…). Presence can ask before the module context exists (online start-up): no module space yet. */
function moduleSpace(): string | null { if (!ctxReady) return null; for (const m of MODULES) { const s = m.space?.(ctx); if (s) return s; } return null; }

const sunDir = new THREE.Vector3();
const NIGHT_SKY = new THREE.Color(0x6474a6);
/** The hour the last frame was lit for (an interior's per-frame update reads it: src/world/interiors.ts Interior.update). */
let litHour = 12;
function updateLighting(hour: number) {
  litHour = hour;
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
  // at night the sky's light on the ground is a little stronger and less blue than it was (0.75, 0x5a6ea8): the road reads grey against the darker
  // walls, its markings and kerbs out of it (LD2.0-A night roads); the headlights and the lamps' pools do the rest (src/transport/headlightPool.ts)
  hemi.intensity = isNight ? 0.9 : 0.7 + 0.35 * d;
  hemi.color.copy(isNight ? NIGHT_SKY : sky.zenith.clone().lerp(new THREE.Color(0xffffff), 0.55 - 0.25 * weatherNow.cloud));
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
    setVillaFacadeNight(night);                                            // the Almadies villa's façade: its windows, uplights, roof edge (LD2.0-D)
    corridors.setNight(night);
    for (const m of world.signs) (m.material as THREE.MeshLambertMaterial).emissiveIntensity = night * 0.45;
  }
}

// ------------------------------------------------------------------ hubs
const rand = rng(Date.now() & 0xffff);
/** The roads between districts (src/road): attached to each district as it loads, streamed round the player, swapped at their middle. */
const corridors = new CorridorHost(scene, rand);
corridors.onHorn = n => trafficAudio.trafficHorn(n);

/** When the current hub was built (a place a module adds, such as a dealer's counter, appears a moment after). */
let hubAt = 0;
/** A district crossing asked by a module during the frame (src/transport/hubLink.ts): carried out before the next frame's updates, so no module is mid-step when the hub is rebuilt. */
/** How long the last district crossing took to build (ms): shown by the debug hook, read by the checks. */
let lastCrossMs = 0;
let pendingCross: { dest: HubId; at: { x: number; z: number; yaw: number }; keepSpeed?: number; quiet?: boolean; road?: boolean } | null = null;
/**
 * A district being loaded in steps: what is left to do after the frame that swapped it in. Modules whose `hubLoaded` has not run yet (`done`) are not updated meanwhile, so none is ever
 * stepped on a half-built district; `maxStep` is the longest single step (ms): what the checks read as the cost of the worst frame of the load.
 */
let staged: { gen: Generator<void, void, void>; done: Set<object>; steps: number; maxStep: number; start: number; log: [string, number][] } | null = null;
/** The last staged load's per-step cost, slowest first (debug: where the remaining spikes are). */
let lastStaged: { total: number; steps: number; maxStep: number; log: [string, number][] } | null = null;
/** Milliseconds a frame may spend finishing a staged load (the frame's own work is not counted: this is the extra). */
const STAGE_BUDGET_MS = 5;
const isGen = (r: unknown): r is Generator<void, void, void> => !!r && typeof (r as Generator).next === 'function';

/** Metres out on a road at which the district at its other end starts to be built, and the milliseconds a frame that may take. */
const PREWARM_AT = 130, PREWARM_BUDGET_MS = 4;
/** Vertices of the built district drawn off screen per frame to put them on the GPU. */
const WARM_VERTS = 90000;
/** ?nostage: swap the way #51's border road does (the whole district built and loaded in the swap frame): the measurements' baseline (scripts/perf-corridor.mjs). */
const STAGING = !new URLSearchParams(location.search).has('nostage');
/** A district built ahead of the player while they are still on the road to it (src/road): the generator, then the finished world. */
let prewarm: { id: HubId; gen: Generator<void, HubWorld, void>; world: HubWorld | null; ms: number; steps: number; warmMs: number; warm?: Warm } | null = null;
function prewarmStart(id: HubId) {
  if (prewarm?.id === id) return;
  prewarmDrop();
  setGrainEnabled(quality !== 'low');
  prewarm = { id, gen: buildHubSteps(id, quality === 'low', quality), world: null, ms: 0, steps: 0, warmMs: 0 };
}
function prewarmStep(budgetMs: number) {
  const w = prewarm; if (!w || w.world) return;
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    const r = w.gen.next(); w.steps++;
    if (r.done) {
      w.world = r.value; w.warm = warmBegin(w.world);
      renderer.compileAsync(w.world.group, camera, scene).catch(() => { /* compiled on first draw instead */ });   // the programs link in parallel where the browser can (KHR_parallel_shader_compile)
      break;
    }
  }
  w.ms += performance.now() - t0;
}
function prewarmDrop() {
  const w = prewarm; prewarm = null; if (!w?.world) return;
  if (w.warm) warmEnd(w.warm, w.world); scene.remove(w.world.group); w.world.dispose();
}
/** Takes the built district for `id` (finishing its build now if it is not done: the old cost, but only for a player who outran the build). */
function prewarmTake(id: HubId): HubWorld | null {
  const w = prewarm; if (!w || w.id !== id) return null;
  while (!w.world) { const r = w.gen.next(); if (r.done) w.world = r.value; }
  if (w.warm) warmEnd(w.warm, w.world);
  scene.remove(w.world.group);                              // (loadHubSteps adds it where it belongs)
  prewarm = null; return w.world;
}

/**
 * Getting the built district's meshes onto the GPU before the player can see them. The first draw of a mesh uploads its buffers and textures, which on a phone is a pause of many ms; here
 * each of the district's top-level pieces is drawn once, one or a few a frame, into a 1 × 1 pixel of the screen that the real frame then overwrites. The district stands in the scene meanwhile on
 * a layer the player's camera does not draw (and the lights are on both), so the same programs, lights and fog apply as in the real frame and nobody sees anything.
 */
const WARM_LAYER = 5;
interface Warm { cam: THREE.PerspectiveCamera; kids: THREE.Object3D[]; verts: number[]; i: number; saved: { o: THREE.Object3D; fc: boolean }[]; done: boolean }
function warmBegin(world: HubWorld): Warm {
  const cam = new THREE.PerspectiveCamera(); cam.layers.set(WARM_LAYER);
  const saved: Warm['saved'] = [];
  world.group.traverse(o => { o.layers.set(WARM_LAYER); if ((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite) { saved.push({ o, fc: o.frustumCulled }); o.frustumCulled = false; } });
  hemi.layers.enable(WARM_LAYER); sun.layers.enable(WARM_LAYER);
  const kids = [...world.group.children], verts = kids.map(k => { let n = 0; k.traverse(o => { const g = (o as THREE.Mesh).geometry; if (g?.attributes?.position) n += g.attributes.position.count; }); return n; });
  scene.add(world.group);
  return { cam, kids, verts, i: 0, saved, done: kids.length === 0 };
}
/** Draws the next pieces (up to `maxVerts` vertices) off screen. Called just before the frame's own render. */
function warmStep(maxVerts: number) {
  const w = prewarm?.warm; if (!w || w.done) return;
  const vp = renderer.getViewport(new THREE.Vector4()), ac = renderer.autoClear;
  let n = 0;
  renderer.autoClear = false; renderer.setViewport(0, 0, 1, 1);
  while (w.i < w.kids.length && n < maxVerts) {
    for (let k = 0; k < w.kids.length; k++) w.kids[k].visible = k === w.i;
    renderer.render(scene, w.cam); n += w.verts[w.i] + 3000; w.i++;
  }
  renderer.autoClear = ac; renderer.setViewport(vp);
  if (w.i >= w.kids.length) { for (const k of w.kids) k.visible = true; w.done = true; }
}
/** Puts the district back as a normal one: drawn by the player's camera, frustum culling on. */
function warmEnd(w: Warm, world: HubWorld) {
  for (const k of w.kids) k.visible = true;
  for (const s of w.saved) s.o.frustumCulled = s.fc;
  world.group.traverse(o => o.layers.set(0));
  w.done = true;
}

function loadHub(id: HubId, at?: { x: number; z: number; yaw: number }, keepSpeed = 0) {
  const g = loadHubSteps(id, at, keepSpeed, null, false);
  for (;;) if (g.next().done) break;
}
/** The same load, in steps: the frame that swaps the district in does the least that must be done at once (staged: the player's vehicle and place), the rest follows within a few ms a frame. */
function loadHubStaged(id: HubId, at: { x: number; z: number; yaw: number }, keepSpeed: number, built: HubWorld | null) {
  const gen = loadHubSteps(id, at, keepSpeed, built, true);
  staged = { gen, done: new Set(), steps: 0, maxStep: 0, start: performance.now(), log: [] };
  const t0 = performance.now(); gen.next();                                 // the swap's own frame: up to the first pause
  staged.maxStep = performance.now() - t0; staged.steps = 1;
}
/** Runs the staged load for at most `budgetMs` (a step that is longer still runs whole). */
function stagedStep(budgetMs: number) {
  const st = staged; if (!st) return;
  const t0 = performance.now();
  while (performance.now() - t0 < budgetMs) {
    const a = performance.now(); const r = st.gen.next(); st.steps++; st.maxStep = Math.max(st.maxStep, performance.now() - a);
    if (r.done) { lastStaged = { total: performance.now() - st.start, steps: st.steps, maxStep: st.maxStep, log: st.log.sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, ms]) => [n, Math.round(ms)]) }; staged = null; return; }
  }
}

function* loadHubSteps(id: HubId, at: { x: number; z: number; yaw: number } | undefined, keepSpeed: number, built: HubWorld | null, early: boolean): Generator<void, void, void> {
  hubAt = performance.now();
  let lt = performance.now();
  const lap = (n: string) => { const t = performance.now(); staged?.log.push([n, t - lt]); lt = t; };
  const pause = function* (n: string) { lap(n); yield; lt = performance.now(); };
  activities.cancel(); standUp(true);
  pacer.reset();
  for (const a of apprentices) a.dispose();          // detach them before the hub geometry is freed
  apprentices = [];
  ambient?.dispose(); ambient = null;
  const old = world;
  if (old) scene.remove(old.group);
  if (old && !early) old.dispose();                  // (staged: freed a few frames later, below)
  setGrainEnabled(quality !== 'low');                     // procedural surface noise is the main per-pixel cost
  extra.clear();
  if (early) { crowd = null; traffic = null; }          // the old district's walkers and traffic must not be updated (or greeted) while the new one is still loading
  world = built ?? buildHub(id, quality === 'low', quality);
  economy.decorateHub(world, quality);                   // before the placed people: the quincaillerie's keeper is one of them
  corridors.attach(world, quality, at ?? null);          // the roads that leave this district: before the modules and the player's place (both may be on one)
  scene.add(world.group);
  const w = world;
  interiors = new Map(); inside = null; follow.indoor = false; scene.remove(roomLight);
  doorSeq++; hud.fade(false);                            // cancel a door transition still fading
  const place = () => {
    const p = resumeSpot(at, w.bounds, w.spawn, (x, z) => !!w.corridors?.some(c => c.contains(x, z, 0.5)));   // a spot outside this hub and its roads (an old save, a bad teleport): its spawn
    pos.set(p.x, 0.1, p.z); facing = p.yaw; speed = keepSpeed;
    follow.snapBehind(facing);
    state.place(id, p.x, p.z, p.yaw);
    hud.setPlace(HUB_NAMES[id], '', false);
    remoteAvatars.clear(); emoter.reset(); notice.reset(); presence.join(id, id === invitedHub ? invitedRoom : null);
    phone.remember();
  };
  let criticalSeats: Seat[] = [];
  const runModule = function* (m: (typeof MODULES)[number]): Generator<void, void, void> {
    let t0 = performance.now();
    const r: unknown = early && m.hubLoadedSteps ? m.hubLoadedSteps(ctx, w) : m.hubLoaded?.(ctx, w);
    if (isGen(r)) for (;;) { const s = r.next(); if (s.done) break; if (early) { staged?.log.push(['mod:' + m.name, performance.now() - t0]); yield; lt = performance.now(); t0 = lt; } }
    staged?.log.push(['mod:' + m.name, performance.now() - t0]);
    staged?.done.add(m);
  };
  places.clear(); people.clear();
  if (early) {
    // the swap frame: the vehicle the player drives and the player's place. Everything else of the district follows, a few ms a frame.
    const seatsBefore = new Set(seats.all().map(s => s.id));
    for (const m of MODULES) if (m.critical) for (const _ of runModule(m)) { /* critical modules never pause */ }
    criticalSeats = seats.all().filter(s => !seatsBefore.has(s.id));          // the owned vehicle's driver seat: registerSeats below must not wipe it
    place();
    yield* pause('swap frame');
  }
  crowd = new Crowd(w, rand, QUAL[quality].crowd); traffic = new DecorativeTraffic(w, rand, QUAL[quality].traffic);
  extra.add(crowd.group, traffic.group);
  if (early) yield* pause('crowd + traffic');
  apprentices = humanoidReady() ? w.rapides.map(car => { const a = new Apprentice(id, rand); a.attach(car); return a; }) : [];
  for (const car of traffic.rapides()) { if (!humanoidReady()) break; const a = new Apprentice(id, rand, true); a.attach(car); apprentices.push(a); }
  ambient = new PlacedPeople(w, rand, h => extra.add(h.group));
  life?.dispose(); life = w.monument ? new MonumentLife(w.monument, rand, QUAL[quality].crowd) : null;
  if (life) extra.add(life.group);
  npcLife.load(w, extra);                            // recurring cast on their daily routines
  if (early) yield* pause('people + cast');
  let n = 0;
  for (const it of w.interactables) {
    // homes (the starter room included) are built by the ownership module through ctx.addInterior (src/economy/estate.ts)
    const kind = it.id.includes(':gargote:') ? 'gargote' : it.id.includes(':maiga:') ? 'maiga' : null;
    if (!kind) continue;
    const int = buildInterior(kind, 1000 + n * 40, 0, it.name, id); n++;
    w.group.add(int.group); int.group.visible = false; interiors.set(it.id, int);
    if (early) yield* pause('interior');
  }
  registerSeats();
  for (const s of criticalSeats) seats.add(s);                  // the same objects, so the occupant the module set (the player at the wheel) stays
  criticalSeats = [];
  // where to rest here (the tired refusals and phone › Santé name it): the player's bed in their own hub, else the free rest
  setRestSpot(restSpot(w.interactables, homeHub() === id ? 'ta chambre' : null));
  if (early) yield* pause('seats');
  for (const m of MODULES) { if (early && m.critical) continue; yield* runModule(m); if (early) { yield; lt = performance.now(); } }
  if (!early) place();
  if (early && old) { old.dispose(); yield* pause('dispose old district'); }
}

/** True if (x, z) is inside the rectangle. */
const inRect = (b: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

/**
 * Every frame on a district that has a road leaving it: the road's chunks and traffic follow the player, and past the middle of the road the other district becomes the loaded one
 * (the player, on foot or driving, is carried across by `corridorSwap`). The swap itself is in the next frame's start, like a border crossing (`pendingCross`).
 */
function corridorStep(dt: number) {
  const w = world; if (!w) return;
  corridors.update(dt, pos.x, pos.z, mode === 'play' && !inside ? { x: pos.x, z: pos.z } : null);
  // the district at the other end is built ahead while the player is well out on the road, and let go if they turn back
  const ap = inside ? null : corridors.approach(pos.x, pos.z) ?? approachLink(w.id, pos.x, pos.z);       // out on a road, or nearing a border street: the district beyond is built ahead
  if (STAGING && ap && ap.depth > PREWARM_AT) { if (prewarm?.id !== ap.to) prewarmStart(ap.to); prewarmStep(PREWARM_BUDGET_MS); }
  else if (prewarm && (!ap || ap.depth < PREWARM_AT - 60)) prewarmDrop();
  if (staged || mode !== 'play' || inside || lambScene || rising || approach) return;
  const sw = corridors.watch(pos.x, pos.z);
  if (sw) corridorSwap(sw);
}

/**
 * The player has crossed the middle of a road: the district at the other end becomes the loaded one, in the SAME instant and place. Both districts' frames differ by a translation
 * only (src/road/routes.ts), so heading, speed, steering and the camera need nothing: the vehicle being driven records the new frame's pose (`corridorCross`), a vehicle
 * parked on the road is re-homed to the new district's frame, and the player is placed at the same spot of the new frame.
 */
function corridorSwap(sw: Swap) {
  const w = world!, b = w.bounds;
  for (const a of ['jakarta', 'compacte', 'berline', 'tout_terrain', 'tiak'] as VehicleAsset[]) {          // vehicles parked on the road follow the frame
    const p = parked(state.data, a);
    if (!p || p.hub !== sw.from || inRect(b, p.x, p.z)) continue;
    park(state.data, { ...p, hub: sw.to, x: p.x + sw.dx, z: p.z + sw.dz });
  }
  for (const m of MODULES) if (m.corridorCross?.(ctx, sw.to, sw.dx, sw.dz)) break;                          // the one being driven keeps driving
  corridors.prepare(sw.road);
  pendingCross = { dest: sw.to, at: { x: pos.x + sw.dx, z: pos.z + sw.dz, yaw: facing }, keepSpeed: speed, quiet: true, road: STAGING };
}

/** The ground under the player indoors (LD2.0-D: a home on several levels walks its floors and stairs; every other interior, the floor), above y 0.1. */
const indoorGround = (int: Interior, x: number, z: number, y: number) => int.groundAt ? int.groundAt(x, z, y - 0.1) : 0;
/** `y` (LD2.0-D): the height of the body's feet; a collider of another floor (`Collider.y0`) is passed. */
function pushOut(x: number, z: number, r: number, cols: Collider[], y = 0.1): [number, number] {
  for (const c of cols) {
    if (c.y0 !== undefined && !inBand(c, y)) continue;
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
/** Where the player stood before sitting down on the seat (the spot beside it): standing up goes back there. */
let sitOrigin: { id: string; x: number; z: number; yaw: number } | null = null;
/** Seconds left standing up on a place in the stands, arms up (« Encourager »), before sitting back down. */
let cheerT = 0;
/** Getting up: the body rises from the seat to the spot it sat down from (or a free spot beside the seat) in 0.45 s, never a jump. */
let rising: { from: THREE.Vector3; to: THREE.Vector3; yaw0: number; yaw1: number; t: number; last: THREE.Vector3 } | null = null;
/** Walking to a seat before sitting (meals, « S’asseoir »): legs round the furniture, then a short sit-down. */
let approach: { seat: Seat; path: { x: number; z: number }[]; i: number; t: number; settle: number; from?: { x: number; y: number; z: number; yaw: number } } | null = null;
/** A gameplay module moving the player during an activity (carrying, running…): legs speed and facing. */
let drive: { speed: number; facing: number } | null = null;
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
  out.push({ id: 'self', name: seatClip(seated) === 'Lie' ? 'Au lit' : 'Assis', kind: 'self', space, x, z, radius: 1, bias: -1, affordances: () => [{ id: 'stand', verb: 'stand', label: 'Se lever', icon: '🧍', run: () => standUp() },
    ...(seated?.kind === 'stand' ? [{ id: 'cheer', verb: 'dance' as const, label: 'Encourager', icon: '🙌', detail: 'Debout un instant, les bras en l’air', run: () => { cheer(); } }] : [])] });
} });
seats.onSit = s => { if (mode === 'play' && !seated && goSit(s)) { mode = 'busy'; input.enabled = false; } };

/** Universal activities (src/activity): one runner plays every composed activity; places compose the primitives. */
const inventory = new Inventory(state);
/** Gestures of the trades: the hands-on part of a shift (serve, pass the tool, tighten, pull). */
const gestures = new GesturePlayer(document.getElementById('ui')!);
/** On foot, always free: walk, brisk walk, run while stamina lasts (fitness = « forme »). */
const stride = new Stride(state);
const strideUi = new StrideUi(document.getElementById('ui')!, stride);
const activities = new ActivityRunner({
  state, seats, space: () => interactSpace(), player: () => ({ x: pos.x, z: pos.z }), seated: () => seated,
  sit: s => goSit(s), walking: () => approach !== null,   // walks round the tables to the seat first (src/interact/approach.ts)
  clip: c => { if (playerBody) playerBody.hold = seated && (c === 'Sit' || !c) ? seatClip(seated) : c ?? null; },   // a step's Sit means « the seat's own pose » (lying on a bed…)
  stand: () => standUp(),                                  // out of bed after sleeping (runner: a sleep step ends the seat)
  busy: on => {
    if (on) { mode = 'busy'; input.enabled = false; return; }
    if (approach) { seats.release(approach.seat.id, 'player'); approach = null; speed = 0; }   // stopped on the way to the seat
    drive = null;
    if (mode === 'busy') { mode = 'play'; input.enabled = true; }
  },
  progress: (on, pct = 0, label = '') => hud.progress(on, pct, label, progressMeta()),
  toast: m => hud.toast(m), save: () => { if (world) saveNow(); },
  rel: (npc, d) => rel.change(PLAYER, npc, d), flag: f => { if (!state.data.flags.includes(f)) state.data.flags.push(f); },
  item: (id, d) => inventory.add(id, d), hasItem: (id, n) => inventory.has(id, n),
  // polyvalence: the category of each activity is practised, and work pay is scaled by the variety (src/economy)
  // a paid piece of work (a shift, a service, a sale…) is also a day worked (src/economy/streakModule.ts); leisure, prayer and travel are not
  category: c => economy.practiseCategory(c), pay: (m, c) => { const v = economy.scalePay(m, c); if (v > 0 && c && WORK_CATEGORIES.has(c)) noteWork('job'); return v; }, payPreview: (m, c) => economy.previewPay(m, c),
  gesture: (g, label, done) => gestures.play(g, label, done),
});
const places = new Places(activities, () => hourOverride ?? cityTimeAt(presence.serverNow()).hourFloat);
interactions.add(places);
/** Real players next to you can be greeted (src/multiplayer/social.ts): a gesture the players nearby see, and a quiet word to the one it is meant for. */
interactions.add(new PlayerSocial(() => presence.peers.values(), p => remoteAvatars.hidden(p), (kind, peer) => {
  if (!emoter.make(kind, peer.id, performance.now())) { hud.toast('Doucement : un geste à la fois.'); return; }
  hud.toast(`${EMOTE_INFO[kind].you} ${peer.name} ${EMOTE_INFO[kind].glyph}`);
}));
remoteAvatars.onEmote = (peer, emo) => { if (emo.to && emo.to === presence.id) hud.toast(`${peer.name} ${EMOTE_INFO[emo.k].toast} ${EMOTE_INFO[emo.k].glyph}`); };
/** Everyone in the street can be greeted (placed people and walkers). */
const people = interactions.add(new People(() => [
  ...(ambient?.bodies() ?? []).map(b => ({ id: b.id, obj: b.h.group, h: b.h, seated: b.seated, female: b.female })),
  ...(crowd?.bodies() ?? []).map(b => ({ id: b.id, obj: b.obj, h: b.h })),
], activities, line => hud.toast(line), () => ({ x: pos.x, z: pos.z }))) as People;
/** What gameplay modules (src/game/modules.ts) may use: the shared systems, the player and the hub. */
const ctx: GameCtx = {
  scene, camera, follow, extra, state, hud, input, interactions, seats, people, places, activities, inventory,
  quality: () => quality, world: () => world, inside: () => inside, space: () => interactSpace(),
  hour: () => hourOverride ?? cityTimeAt(presence.serverNow()).hourFloat, day: () => cityTimeAt(presence.serverNow()).day + dayShift, now: () => presence.serverNow(),
  player: {
    pos, facing: () => facing, body: () => playerBody, seated: () => seated,
    sit: s => sitOn(s, true), standUp: inPlace => standUp(inPlace), drive: m => { drive = m; },
    place(x, z, yaw) { pos.set(x, 0.1 + (inside ? indoorGround(inside.int, x, z, pos.y) : !world ? 0 : world.heightAt(x, z)), z); facing = yaw; follow.snapBehind(yaw); },
    cheer: s => cheer(s),
  },
  peers: () => [...presence.peers.values()],
  ballNet: { self: () => (presence.status === 'online' ? presence.id : ''), send: b => presence.sendBall(b), listen: fn => { presence.onBall = fn; } },
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
  crossHub(dest, at) { if (world) pendingCross = { dest, at, keepSpeed: speed, road: STAGING }; },       // the border street: the same staged, built-ahead hand-over as a corridor's middle
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
/**
 * Every content action runs through the universal runner: a composed one (Maïga meals…) with its own steps, a plain
 * one as a single timed step whose pay is scaled by polyvalence (the step's category, src/economy/polyvalence.ts).
 */
function actionSpec(a: Action, it?: Interactable): ActivitySpec {
  const verb = actionVerb(a)[0];
  const steps = a.steps ?? [{ label: a.label, primitive: verb, seconds: a.seconds, effects: { money: a.gain, category: activityOf(a, it?.id) ?? undefined, needs: a.needs, counters: a.counter ? { [a.counter]: 1 } : undefined } }];
  return { id: a.id, primitive: verb, label: a.label, detail: a.detail, price: a.cost, steps, requires: a.requires ? () => a.requires!(state) : undefined, quiet: a.quiet, plain: !a.steps };
}

function sitOn(seat: Seat, force = false, from?: { x: number; z: number; yaw: number }) {
  if ((!force && mode !== 'play') || seated || !seats.occupy(seat.id, 'player')) return;
  approach = null; rising = null;
  // where the player stood before: standing up goes back there (a walk to the seat gives its last spot; a sit from where
  // one stands counts when that is right beside the seat)
  const near = Math.hypot(pos.x - seat.x, pos.z - seat.z);
  sitOrigin = from ? { id: seat.id, ...from } : near > 0.25 && near <= 2 && seat.kind !== 'vehicle' ? { id: seat.id, x: pos.x, z: pos.z, yaw: facing } : null;
  seated = seat; speed = 0; hideProxy(); emoteT = 0; previewT = 0; cheerT = 0;
  pos.set(seat.x, sitOriginY(seat) + (inside ? 0 : 0), seat.z); facing = seat.yaw;
  if (playerBody) playerBody.hold = seatClip(seat);
}
/**
 * Walks the player to a seat, round tables and chairs (src/interact/approach.ts), then sits down: the seat is held
 * for the player on the way. False when no free spot beside it can be reached. The frame loop moves the player
 * while `approach` is set (mode 'busy').
 */
/** Without a walking route to a seat, closer than this the player still sits down on it (m). */
const SIT_HERE = 3.5;
function goSit(seat: Seat): boolean {
  if (seated?.id === seat.id) return true;
  if (seated) standUp();
  finishRising();                                              // from the spot it rose to, not from the old seat
  if (!world || approach || !seats.occupy(seat.id, 'player')) return false;
  // a boat's or a vehicle's seat is boarded, not walked round; with no route but already beside it (a stool at a tap,
  // a place in a prayer row, a salon chair inside its own furniture), the player sits down where they are
  const path = seat.kind === 'vehicle' ? null : approachPath(pos, seat, inside ? inside.int.colliders.filter(c => inBand(c, pos.y)) : world.colliders, inside ? 0.3 : 0.5, inside ? inside.int.bounds : world.bounds);
  if (!path) {
    seats.release(seat.id, 'player');
    if (seat.kind !== 'vehicle' && Math.hypot(seat.x - pos.x, seat.z - pos.z) > SIT_HERE) return false;
    sitOn(seat, true);
    return seated?.id === seat.id;
  }
  approach = { seat, path, i: 0, t: 0, settle: -1 };
  hideProxy(); emoteT = 0; previewT = 0; player.setPose(null);
  if (playerBody) playerBody.hold = null;
  return true;
}
const WALK_SPEED = 1.7;
function stepApproach(dt: number) {
  const a = approach!, last = a.path.length - 1; a.t += dt;
  if (a.i < last && a.t < 12) {                                  // walk the legs to the spot beside the seat
    const p = a.path[a.i], dx = p.x - pos.x, dz = p.z - pos.z, d = Math.hypot(dx, dz);
    speed += (WALK_SPEED - speed) * Math.min(1, dt * 8);
    const want = Math.atan2(dx, dz);
    facing += Math.atan2(Math.sin(want - facing), Math.cos(want - facing)) * Math.min(1, dt * 10);
    const step = Math.min(d, speed * dt);
    if (d > 1e-4) { pos.x += (dx / d) * step; pos.z += (dz / d) * step; }
    if (d - step < 0.05) a.i++;
    pos.y = 0.1 + (inside ? indoorGround(inside.int, pos.x, pos.z, pos.y) : !world ? 0 : world.heightAt(pos.x, pos.z));
    return;
  }
  // then turn to face the way the seat faces and sit down (or lie down on a bed) in 0.45 s
  if (a.settle < 0) { a.settle = 0; a.from = { x: pos.x, y: pos.y, z: pos.z, yaw: facing }; if (playerBody) playerBody.hold = seatClip(a.seat); }
  a.settle = Math.min(1, a.settle + dt / 0.45); speed = 0;
  const k = a.settle * a.settle * (3 - 2 * a.settle), s = a.seat, f = a.from!;
  pos.set(lerp(f.x, s.x, k), lerp(f.y, sitOriginY(s), k), lerp(f.z, s.z, k));
  facing = f.yaw + Math.atan2(Math.sin(s.yaw - f.yaw), Math.cos(s.yaw - f.yaw)) * k;
  if (a.settle >= 1) {
    sitOn(s, true, { x: f.x, z: f.z, yaw: f.yaw });
    if (!activities.running && mode === 'busy') { mode = 'play'; input.enabled = true; }   // « S’asseoir » on its own
  }
}
/** On a place in the stands: up on the tier for a moment, arms up (others see Celebrate), then back on the seat. */
function cheer(seconds = 2.5) {
  if (!seated || seated.kind !== 'stand' || mode !== 'play') return false;
  cheerT = Math.max(0.5, Math.min(6, seconds));
  if (ctxReady) for (const m of MODULES) m.cheered?.(ctx);           // the neighbours in one's own écurie's section answer (src/arena/supporters.ts)
  return true;
}
/** Ends a rise at once (something else takes the player over: a new seat, a door, a trip). */
function finishRising() { if (rising) { pos.copy(rising.to); facing = rising.yaw1; rising = null; } }
/** One step of getting up: smooth from the seat to the spot, the legs take over (the Sit hold is already released). */
function stepRising(dt: number) {
  const r = rising!;
  if (pos.distanceToSquared(r.last) > 1e-4) { rising = null; return; }        // moved by something else (a teleport, a door): not ours any more
  r.t = Math.min(1, r.t + dt / 0.45); speed = 0;
  const k = r.t * r.t * (3 - 2 * r.t);
  pos.lerpVectors(r.from, r.to, k); r.last.copy(pos);
  facing = r.yaw0 + Math.atan2(Math.sin(r.yaw1 - r.yaw0), Math.cos(r.yaw1 - r.yaw0)) * k;
  if (r.t >= 1) rising = null;
}
/**
 * Stand up from the seat (`inPlace`: just clear the state, e.g. before a door or a trip). The body returns to the spot it
 * sat down from when that is still free, else to the first free spot round the seat (in front, beside, behind: a chair
 * faces its table, so the front is often furniture), and gets there in 0.45 s, as the sit-down does.
 */
function standUp(inPlace = false) {
  if (approach) { seats.release(approach.seat.id, 'player'); approach = null; speed = 0; }
  if (!seated) return;
  const s = seated, cheering = cheerT > 0; seats.release(s.id, 'player'); seated = null; cheerT = 0;
  if (playerBody && (playerBody.hold === seatClip(s) || (cheering && playerBody.hold === 'Celebrate'))) playerBody.hold = null;
  const origin = sitOrigin && sitOrigin.id === s.id && Math.hypot(sitOrigin.x - s.x, sitOrigin.z - s.z) <= 2 ? sitOrigin : null;
  sitOrigin = null;
  if (inPlace || !world) { rising = null; return; }
  // the first free spot: where it came from, in front of a chair, beside it, behind it; out of a bed by a side (or past its foot); never inside furniture or a wall
  const feet = sitOriginY(s) - 0.1;                                                     // the floor the seat stands on (LD2.0-D: its level's)
  const cols = inside ? inside.int.colliders.filter(c => inBand(c, feet)) : world.colliders, r = inside ? 0.3 : 0.5;
  const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw), lx = Math.cos(s.yaw), lz = -Math.sin(s.yaw);
  const spots = [
    ...(origin ? [{ x: origin.x, z: origin.z }] : []),
    ...standSpots(s),
    ...(s.exits?.length || s.clip === 'Lie' ? [] : [{ x: s.x + lx * 0.75, z: s.z + lz * 0.75 }, { x: s.x - lx * 0.75, z: s.z - lz * 0.75 }, { x: s.x - fx * 0.7, z: s.z - fz * 0.7 }]),
  ];
  let nx = s.x, nz = s.z, best = Infinity;
  for (const [i, p] of spots.entries()) {
    const [x, z] = pushOut(p.x, p.z, r, cols);
    const blocked = cols.some(c => x > c.x0 - r * 0.9 && x < c.x1 + r * 0.9 && z > c.z0 - r * 0.9 && z < c.z1 + r * 0.9);
    const cost = Math.hypot(x - p.x, z - p.z) + (blocked ? 10 : 0) + i * 0.02;       // a free spot in the list order wins; a pushed one only when none is free
    if (cost < best - 1e-6) { best = cost; nx = x; nz = z; }
  }
  const yaw1 = s.clip === 'Lie' ? Math.atan2(nx - s.x, nz - s.z) : facing;           // out of bed, facing away from it
  rising = { from: pos.clone(), to: new THREE.Vector3(nx, 0.1 + (inside ? indoorGround(inside.int, nx, nz, Math.max(0.1, feet)) : world.heightAt(nx, nz)), nz), yaw0: facing, yaw1, t: 0, last: pos.clone() };
}
/** Registers the seats of the hub, its interiors and marks those already used by the ambient people. */
function registerSeats() {
  seats.clear(); if (!world) return;
  seats.addAll(world.seats);
  for (const [doorId, int] of interiors) seats.addAll(int.seats.map(s => ({ ...s, space: doorId.includes(':home:') ? 'home' : doorId })));
  for (const p of world.people) if (p.clip === 'Sit') seats.occupyNear('street', p.x, p.z, 'npc');
}
/** The routine characters sit on the same street benches as the player: their seats are held while they sit there. */
function syncNpcSeats() {
  if (!world) return;
  const held = new Set<string>();
  for (const r of ROUTINES) {
    if (r.hub !== world.id) continue;
    const w = npcLife.where(r.id);
    if (!w?.here || !w.sit || w.x === undefined || w.z === undefined) continue;
    const who = 'npc:' + r.id, s = seats.inSpace('street').find(x => x.occupant === who) ?? seats.occupyNear('street', w.x, w.z, who);
    if (s && Math.hypot(s.x - w.x, s.z - w.z) <= 0.45) held.add(s.id);
  }
  for (const s of seats.inSpace('street')) if (s.occupant?.startsWith('npc:') && !held.has(s.id)) seats.release(s.id, s.occupant);
}
/** What the action button did before the contextual system (kept for places, people and stations). */
function legacyAction(it: Interactable) {
  nearest = it;
  if (it.kind === 'travel') openTravel();
  else if (it.kind === 'walk') openWalk();
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
  let best = 1e9;                                              // (squares: this runs every frame over all the hub's places)
  if (inside && pos.y > 1.6) return;                                             // LD2.0-D: upstairs in a home (its doors are on the ground floor)
  for (const it of inside ? inside.int.interactables : world.interactables) {
    const dx = it.x - pos.x, dz = it.z - pos.z, d = dx * dx + dz * dz;
    if (d <= it.radius * it.radius && d < best) { best = d; nearest = it; }
  }
}

function describe(a: Action): string {
  const parts: string[] = [];
  if (a.detail) parts.push(a.detail);
  return parts.join(' · ');
}

function openActions(it: Interactable) {
  mode = 'menu';
  const marks = objectiveMarks(suggestion(rel, state));          // what the current objective points at (a gold star on those actions)
  // a shop that knows its regular (src/social/regular.ts): a few words from the shopkeeper, and the neighbour price in place of the full one
  const reg = it.menu === 'shop' ? shopRegular(it.id, state, rel, hourOverride ?? cityTimeAt(presence.serverNow()).hourFloat) : null;
  const enc = reg?.owner ? npcLife.encounter(reg.owner) : null;       // a moment at the counter (src/social/situations.ts): the « Parler à » row opens it
  const visible = it.actions.filter(a => (!a.visible || a.visible(state)) && !reg?.hide.has(a.id));
  const items: MenuItem[] = visible.map(a => {
    const why = a.requires?.(state) ?? (a.cost && !state.canAfford(a.cost) ? 'Pas assez d’argent' : null);
    return { icon: actionVerb(a)[1], ...(it.menu === 'shop' ? SHOP_COPY[a.id] : {}), ...(enc && a.id === 'boutique-salut' ? { short: 'Un moment avec Mamadou' } : {}), ...(isObjectiveAction(a, marks) ? { objective: true } : {}), ...(reg?.was[a.id] ? { was: fcfa(reg.was[a.id]) } : {}), label: a.label, detail: enc && a.id === 'boutique-salut' ? enc.detail : why ?? describe(a), right: a.cost ? '−' + fcfa(a.cost) : a.gain ? '+' + fcfa(economy.workPreview(a, it)) : undefined, disabled: !!why, onPick: () => { hud.closeModal(); if (enc && a.id === 'boutique-salut') enc.open(); else if (a.special) runSpecial(a); else runAction(a, it.npc, it); } };
  });
  let subtitle = reg ? (reg.greeting ? `« ${reg.greeting} »` : 'Que veux-tu faire ?') : it.description ?? 'Que veux-tu faire ?';
  if (it.npc) {
    items.unshift(...npcLife.menuItems(it.npc));            // situation, favour, introduction (after the beat)
    const beat = availableBeat(it.npc, rel, state);
    if (beat) items.unshift({ label: beat.title, detail: 'Histoire', right: undefined, disabled: false, objective: marks.npcs.has(beat.npc), onPick: () => openBeat(beat) });
    const lv = rel.level(it.npc);
    subtitle = `« ${npcLife.greet(it.npc)} » · Relation : ${Relations.label(lv)} (${lv > 0 ? '+' : ''}${Math.round(lv)})`;
  }
  hud.openMenu(it.name, subtitle, items, '', undefined, it.menu);
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
    case 'bank': bankModule.counter(nearest?.name); break;                 // Banque Teranga: the savings account (src/economy/bankModule.ts)
    case 'bankAdvice': bankModule.advise(nearest?.name, a); break;
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
// with ?lamb2 the arena's and the écurie's bouts say which làmb they are
if (LAMB2) for (const a of [...ACTIONS.arena, ...ACTIONS.ecurie]) {
  if (a.id === 'combat') a.detail = 'Sans frappe ou avec frappe · choisis ton adversaire';
  else if (a.id === 'combat_classe') a.detail = 'Lutte avec frappe · adversaire selon ton classement';
  else if (a.id === 'combat_entrainement') a.detail = 'Leçon de la lutte avec frappe : frappes, garde, empoignade, projection · non classé';
}
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
  // with ?lamb2 the ranked bout is avec frappe: the same career ladder (points, purse), its own record (lamb_af_classe_*)
  const discipline: Discipline = LAMB2 ? 'avec_frappe' : 'sans_frappe';
  const r = record(state.data.counters, 'classe', discipline), pick = opponentPick('classe');
  const st = STYLES[(pick?.style as StyleId | undefined) ?? rankedStyle(r.v + r.d + r.n)] ?? STYLES.costaud, level = pick?.level ?? opponentLevel(r.v, r.d);
  // avec frappe the opponent fights as himself (his style of the six, his level): the menu says who he is
  const who = LAMB2 ? rosterOpponent(pick?.name ?? st.name, ctx.day()) : null, word = who ? STYLE_MAP[who.style].word : '';
  const label = who ? `Affronter ${who.wrestler.name} · ${word[0].toUpperCase()}${word.slice(1)} · niveau ${who.level}` : `Affronter ${pick?.name ?? st.name} · ${st.label} · niveau ${level}`;
  hud.openMenu('Combat classé', `Classement local (cet appareil) · ${r.v} V · ${r.d} D · ${r.n} N`, [
    { label, detail: st.hint, onPick: () => startDuel('classe', st.id, undefined, discipline) },
  ], `<div class="draft">${RULES[discipline].label} · ${RULES_STATUS}. Un abandon est compté à part : ce n’est ni une victoire ni une défaite.</div>`);
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
  duel.onMoment = (m, w, o) => { for (const mod of MODULES) mod.lamb?.(ctx, { kind: 'moment', moment: m, winner: w, outcome: duel.outcome ?? 'decision', strike: o?.kind, opponent: style.name }); };
  lambScene = duel;
  extra.add(duel.group);
  npcLife.setVisible(false);
  hud.setScene(boutMode === 'entrainement' ? 'Entraînement · combat' : 'Combat · làmb', `${RULES[discipline].label} · ${RULES_STATUS}`);
}
phoneHooks.arenaProfile = () => arenaProfileRows(state.data.counters, state.data.flags.includes('ecurie_baobab') ? 'Baobab (fictive)' : null);

/** « Frappe 34 → 36 » for each fighter attribute (src/career/career.ts) that differs between two sets of counters. */
const attrMoves = (from: Counters, to: Counters) => {
  const a = fighterAttributes(from), b = fighterAttributes(to);
  return ATTRS.filter(x => a[x.id] !== b[x.id]).map(x => `${x.label} ${a[x.id]} → ${b[x.id]}`);
};
/**
 * An écurie drill, played (?lamb2): Coach Ablaye calls it, Babacar is the partner (src/lamb/drills.ts). A finished drill
 * counts exactly as the timed drill does — its needs, its counter (the career's fighter attributes read it), the
 * activity — whatever the score; an abandoned one counts nothing. The recap and the toast say the real attribute change.
 */
function startDrill(a: Action, npc?: string, it?: Interactable) {
  if (lambScene) return;
  const id = drillOfAction(a.id), at = world?.ecurie;
  if (!id) return;
  if (!at) { hud.toast('Les exercices ont lieu à l’écurie de Pikine'); mode = 'play'; return; }
  hideProxy(); emoteT = 0; previewT = 0;
  hud.closeModal();
  mode = 'scene';
  const c = state.data.counters, key = a.counter;
  const notes = key ? attrMoves(c, { ...c, [key]: (c[key] ?? 0) + 1 }) : [];
  const duel = new LambDuel({ origin: { x: at.cx, z: at.cz }, look: state.data.wrestler, input, crowdSize: 0, mode: 'entrainement', style: PARTNER, level: 1, ring: 5,
    discipline: 'avec_frappe', attrs: fighterAttributes(c), drill: id, drillNotes: notes.length ? notes : ['Tes attributs ne bougent plus guère avec cet exercice'] });
  duel.onDone = () => {
    const r = duel.drillResult();
    if (!r || r.outcome === 'abandon') { hud.toast('Exercice interrompu : rien n’est compté'); return; }
    const before = { ...state.data.counters };
    economy.work(a, it);                                    // records the activity, as the timed drill does
    if (a.needs) state.adjust(a.needs);
    if (a.counter) state.count(a.counter);
    if (npc) rel.change(PLAYER, npc, 1);
    state.count('actions');
    npcLife.afterAction(a, it ?? null);
    hud.toast([`${a.label} ✓ ${r.score}/${r.of}`, ...attrMoves(before, state.data.counters)].join('  '));
  };
  lambScene = duel;
  extra.add(duel.group);
  npcLife.setVisible(false);
  hud.setScene(`Entraînement · ${a.label}`, `${RULES.avec_frappe.label} · ${RULES_STATUS}`);
}

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
/** A Meshy body is dressed (no ngemb, no wrestler's build): for the attire preview and the emotes a v4 body in ngemb stands in for it (like the arena's wrestlers). */
let ngembBody: Humanoid | null = null;
function showProxy(clip: Clip) {
  if (!playerBody) { player.setWrestler(state.data.wrestler); return; }
  const w = state.data.wrestler, cut = w.ngembPattern === 'bordure' ? 'B' : 'A';
  if (playerBody.body !== 'v4') {
    if (!ngembBody) { ngembBody = new Humanoid(PLAYER_LOOK); ngembBody.fullRate = true; scene.add(ngembBody.group); }
    ngembBody.setWrestler(w, cut, PLAYER_LOOK.skin); ngembBody.hold = clip; proxy = true; return;
  }
  playerBody.setWrestler(w, cut); playerBody.hold = clip; proxy = true;
}
function hideProxy() {
  if (ngembBody) { ngembBody.dispose(); ngembBody = null; }
  if (playerBody && proxy && playerBody.body === 'v4') { playerBody.setLook(PLAYER_LOOK); playerBody.hold = null; }
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

/** Talking to Tonton Ibou in any way closes his welcome (« Parle à Tonton Ibou »): done once, gone for good. */
function welcomed(npc?: string) {
  const reply = welcomeByTalk(npc, rel, state);
  if (reply) { hud.moment({ icon: '💬', title: 'Tonton Ibou', lines: [reply] }); saveNow(); }
}
function runAction(a: Action, npc?: string, it?: Interactable) {
  // with ?lamb2 the écurie drills (src/career DRILLS) are played with the avec-frappe controls (src/lamb/drills.ts)
  if (LAMB2 && drillOfAction(a.id)) { startDrill(a, npc, it); return; }
  const where = it?.name && !it.name.startsWith(a.label) ? it.name : undefined;   // wallet history: « action · place »
  activities.onEnd = (_s, done) => {                      // once: later activities (places, venues) must not replay this action's hooks
    activities.onEnd = () => {};
    if (done) { if (npc) npcLife.talked(npc, a); state.count('actions'); npcLife.afterAction(a, it ?? null); welcomed(npc); }   // counters belong to the steps
  };
  activities.start(actionSpec(a, it), { place: where, at: it && { x: it.x, z: it.z } });
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
  // on foot too, free and at any energy (§0 A): the gare offers it under the paid rides
  const walks = walkRows();
  hud.openMenu('Car rapide', 'Où va-t-on ? Le car rapide se paie ; à pied, c’est gratuit, à toute heure.', [...items, ...walks]);
}

/** The neighbourhood the player lives in (their home's door is in it), null without a home. */
function homeHub(): HubId | null {
  const door = homeSpec(currentHome(state).spec)?.home.door;
  return door ? (door.split(':')[0] as HubId) : null;
}
/** « Rentrer chez moi » first when home is elsewhere, then every other neighbourhood, nearest first: free. */
function walkRows() {
  if (!world) return [];
  const here = world.id, home = homeHub();
  const rows = walkTargets(here).map(t => ({ label: `À pied · ${HUB_NAMES[t.hub]}`, icon: '🚶', detail: `≈ ${t.minutes} min de marche · gratuit, à toute heure`, right: 'Gratuit', onPick: () => { hud.closeModal(); doWalk(t.hub); } }));
  if (home && home !== here) rows.unshift({ label: 'Rentrer chez moi à pied', icon: '🏠', detail: `${HUB_NAMES[home]} · ≈ ${walkMinutes(here, home)} min · gratuit`, right: 'Gratuit', onPick: () => { hud.closeModal(); doWalk(home); } });
  return rows;
}
/** A way out of the neighbourhood (« Partir à pied »): where to walk to. */
function openWalk() {
  if (!world) return;
  mode = 'menu';
  hud.openMenu('Partir à pied', 'Gratuit, à toute heure, même sans argent ni énergie : la marche prend du temps, c’est tout.', walkRows());
}
/**
 * On foot to another neighbourhood (§0 A): a fade with where and how long, the needs tick for that time, nothing is paid
 * or counted, then the player walks in at the destination's way out facing where they came from.
 */
function doWalk(dest: HubId) {
  if (!world || dest === world.id) return;
  const from = world.id, minutes = walkMinutes(from, dest);
  mode = 'busy'; input.enabled = false;
  hud.fade(true, walkCard(dest, minutes));
  setTimeout(() => {
    applyWalk(state, from, dest);
    const way = wayToward(waysOut(hubLayout(dest).sea, HALF + 1), dest, from);   // 8 m in from the way out, facing in
    loadHub(dest, way ? { x: way.x + Math.sin(way.yaw) * 8, z: way.z + Math.cos(way.yaw) * 8, yaw: way.yaw } : undefined);
    hud.fade(false);
    hud.toast(`Arrivée à pied : ${HUB_NAMES[dest]}`);
    mode = 'play'; input.enabled = true; saveNow();
  }, 1400);
}
phoneHooks.walkTo = doWalk;
phoneHooks.dealers = () => dealerDirectory(state);
phoneHooks.markPlace = (id, hub, name) => { destination = id && hub ? { id, hub, name } : null; };
phoneHooks.marked = () => destination;
phoneHooks.editCharacter = () => { void editCharacter(); };
phoneHooks.profileName = () => presence.profile.name;
phoneHooks.profilePortrait = profilePortrait;
phoneHooks.homeHub = homeHub;

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

/** Person of the suggested story beat, or « first delivery » (refreshed with the HUD: src/game/goalLine.ts hudDue). */
let guideNpc: string | null = null, guideJob = false;
/** HUD refreshes so far (src/game/goalLine.ts hudDue; the checks wait on it rather than on a fixed delay). */
let hudTicks = 0;
/** Where a critical need is met here (src/game/goalLine.ts needGoal), while it leads the goal line. */
let needTarget: { name: string; x: number; z: number } | null = null;
/**
 * The goal line here and now (src/game/goalLine.ts goalNow): the walking marker, the fighter’s evening, a critical
 * need, tonight's gala, then the lead about this hub at this hour (src/social/beats.ts suggestionHere). Tonton Ibou's
 * welcome is such a lead only in Pikine, by day, in the first moments of a new game (never over tonight's gala);
 * otherwise it waits in the Carnet.
 */
function goalLine(hour: number): string | null {
  if (!world) return null;
  const here = suggestionHere(rel, state, world.id, hour, id => !!npcLife.where(id)?.here);
  const ev = eveningLine(ctx, false), fighter = arenaFighter.pending();   // tonight's gala before any lead, the welcome too
  const homeDoor = homeSpec(currentHome(state).spec)?.home.door ?? null;
  const home = !inside && homeDoor ? world.interactables.find(i => i.id === homeDoor) ?? null : null;
  const need = fighter ? null : needGoal({ needs: state.data.needs, wallet: state.wallet, here: pos, spots: inside ? inside.int.interactables : world.interactables, home });
  const g = goalNow({ walking: walkingHint(), fighter, evening: ev, need, here, bearing: withBearing });
  eveningTarget = g && (g.kind === 'fighter' || g.kind === 'evening') ? g.target : null;
  needTarget = g?.kind === 'need' ? g.target : null;
  guideNpc = g?.npc ?? null;
  guideJob = !!g?.job;
  return g?.text ?? null;
}
/** Tonight's arena (or what to do after the bout): the goal line's target while it leads (src/arena/eveningCall.ts). */
let eveningTarget: { name: string; x: number; z: number } | null = null;
/** Way-finding: the walking destination, else the suggested person (or the nearest Tiak Tiak pick-up for the first job) in this hub. */
function guideTarget(): { name: string; x: number; z: number } | null {
  if (!world) return null;
  if (destination?.hub === world.id) { const it = guidePlace(destination.id); if (it) return jobAt(it) ?? it; }
  { const m = destination ? null : missionTarget(); if (m && m.hub === world.id) return m; }
  { const n = destination?.hub === world.id ? null : navigation.localGoal(); if (n) return n; }   // driving directions: the way out toward the goal's district, or the place chosen on the map
  if (eveningTarget) return eveningTarget;
  if (needTarget) return needTarget;
  if (guideJob) {
    const w = world, here = inside ? inside.door : pos;
    const ends = pickupFrags(w.id).map(f => w.interactables.find(i => i.id.startsWith(w.id + ':') && i.id.includes(f))).filter((i): i is Interactable => !!i);
    ends.sort((a, b) => Math.hypot(a.x - here.x, a.z - here.z) - Math.hypot(b.x - here.x, b.z - here.z));
    if (ends[0]) return { name: ends[0].name, x: ends[0].x, z: ends[0].z };
  }
  const w = guideNpc ? npcLife.where(guideNpc) : null;
  return w?.here && w.x !== undefined && w.z !== undefined ? { name: castById(guideNpc!)?.name ?? '', x: w.x, z: w.z } : null;
}

/** The task in hand whose target is this place (a delivery sets the walking marker on its pick-up and drop-off): marked as its job (src/ui/jobMarks.ts). */
function jobAt(p: { x: number; z: number }) { const m = missionTarget(); return m?.job && m.hub === world?.id && Math.hypot(m.x - p.x, m.z - p.z) < 2 ? m : null; }
/** « ↗ text · 72 m » toward a target (the same arrow as the walking marker), or the text alone. */
function withBearing(text: string, t: { x: number; z: number } | null): string {
  if (!t || inside) return text;
  const dx = t.x - pos.x, dz = t.z - pos.z, angle = Math.atan2(dx, dz) - follow.yaw;
  return `${['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8]} ${text} · ${Math.round(Math.hypot(dx, dz))} m`;
}

/** A place the player can be guided to: a place of the hub's content, or one a module adds (a vehicle dealer's counter). */
function guidePlace(id: string): { name: string; x: number; z: number } | null {
  // the dealers' directory names a dealer with its district (`teranga:dealer:pikine`, src/transport/ownedModule.ts directoryRows); its place in that district is `teranga:dealer`
  const local = world && id.endsWith(`:${world.id}`) ? id.slice(0, -(world.id.length + 1)) : null;
  for (const k of local ? [id, local] : [id]) {
    const it = world?.interactables.find(i => i.id === k); if (it) return { name: it.name, x: it.x, z: it.z };
    const pl = ctxReady ? ctx.places.all().find(p => p.id === k) : undefined, a = pl?.anchors[0];
    if (pl && a) return { name: pl.name, x: a.x, z: a.z };
  }
  return null;
}

function walkingHint(): string | null {
  // a task in hand (an errand, a VTC passenger) leads the goal line, wherever its target is
  const m = destination ? null : missionTarget();
  const pin = m?.job === 'vtc' ? '🚘' : m?.job === 'delivery' ? '📦' : '📍';                // a job's own pictogram (src/ui/jobMarks.ts)
  if (m) return m.hint ?? (m.hub === world?.id ? withBearing(`${pin} ${m.name}`, m) : `${pin} ${m.name} · ${HUB_NAMES[m.hub].split(' · ')[0]}`);
  if (!destination) return null;
  // a place of another district (a dealer marked from the phone's Carte): the marker waits, the goal line says where to go
  if (destination.hub !== world?.id) return `📍 ${destination.name ?? 'Repère'} · ${HUB_NAMES[destination.hub].split(' · ')[0]} : téléphone › Carte › y aller à pied`;
  const target = guidePlace(destination.id);
  if (!target) { if (performance.now() - hubAt > 5000) destination = null; return null; }
  if (inside) return 'Sors dans la rue pour rejoindre ' + target.name;
  const dx = target.x - pos.x, dz = target.z - pos.z, distance = Math.hypot(dx, dz);
  if (distance < 2.3) { destination = null; hud.toast('Te voilà : ' + target.name); return null; }
  const angle = Math.atan2(dx, dz) - follow.yaw;
  const arrow = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][(Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8];
  return `${arrow} ${jobAt(target)?.job === 'delivery' ? '📦 ' : ''}${target.name} · ${Math.round(distance)} m`;
}

/** Quality change (phone › Réglages): rebuilds the hub and keeps the player in the room they were in. */
function setQuality(q: Quality) {
  const roomId = inside?.door.id, roomPosition = inside ? pos.clone() : null;
  const at = { x: inside ? inside.door.x : pos.x, z: inside ? inside.door.z : pos.z, yaw: facing };
  quality = q; applyQuality();
  if (state.data.avatar && humanoidReady()) void makePlayerBody();      // the light body files on the low preset
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
  places: () => world?.interactables.filter(i => !i.npc && i.kind !== 'walk').map(i => i.name) ?? [],
  quality: () => quality, setQuality, save: saveNow, toast: m => hud.toast(m),
  newGame: () => { holdSaves(); clearSave(store); world = null; location.reload(); },   // saves held, world = null: no save on the way out
  lock: on => {
    if (on) { if (mode === 'play') mode = 'menu'; if (mode === 'menu') { input.enabled = false; hud.resetControls(); } }
    else if (mode === 'menu' && !hud.modalOpen) { mode = 'play'; input.enabled = true; }
    else if (hud.modalOpen && mode === 'play') { mode = 'menu'; input.enabled = false; }   // an app opened a menu
  },
});

// the minimap and the phone's map (src/ui/minimap.ts): the game's walking marker, the phone, the contacts around
transport.addObstacles(out => { if (corridors.active) corridors.footprints(out, pos.x, pos.z); });     // the road's traffic is solid for the vehicle the player drives
mapBridge.walkTo = id => setDestination(id);
/** The vehicles the player owns and where they stand parked (the city map shows them; the one being driven is the player's own marker). */
mapBridge.owned = () => (['jakarta', 'teranga', 'rafet', 'compacte', 'berline', 'gainde', 'tout_terrain', 'tiak'] as VehicleAsset[]).flatMap(a => {
  if (!ownsVehicle(state, a)) return [];
  const p = parked(state.data, a); if (!p) return [];
  if (MODULES.some(m => { const o = m as unknown as { ridden?: boolean; def?: { asset?: string } }; return o.ridden && o.def?.asset === a; })) return [];
  return [{ asset: a, name: catalogSpec(a)?.name ?? a, hub: p.hub, x: p.x, z: p.z, yaw: p.yaw }];
});
mapBridge.destination = () => (destination && destination.hub === world?.id ? destination.id : null);
mapBridge.openMap = () => { if (mode === 'play' && !phone.isOpen) phone.open('carte'); };
phoneHooks.openPhone = app => ((mode === 'play' || phone.isOpen) ? phone.open(app) : false);
mapBridge.playersNow = () => presenceSpace() !== 'street' ? [] : [...presence.peers.values()].filter(p => p.space === 'street' && !remoteAvatars.hidden(p) && Math.hypot(p.x - pos.x, p.z - pos.z) < 90).slice(0, 12).map(p => ({ id: p.id, name: p.name, x: p.x, z: p.z }));
mapBridge.friendsNow = () => CAST.filter(c => c.hub === world?.id && rel.level(c.id) >= 15).flatMap(c => { const w = npcLife.where(c.id); return w && w.here && w.x !== undefined && w.z !== undefined ? [{ id: c.id, name: c.name, x: w.x, z: w.z }] : []; });

function saveNow(): boolean {
  if (savesHeld()) return false;                          // an import or a New Game is reloading the page: nothing writes the old game back
  // indoors, save the street position at the door: interiors are rebuilt on load
  // a module may hold the player somewhere they cannot resume (a moving vehicle): it gives a safe spot instead
  const safe = inside || !ctxReady ? null : MODULES.reduce<{ x: number; z: number; yaw: number } | null>((p, m) => p ?? m.safePlace?.(ctx) ?? null, null);
  if (inside) state.place(world!.id, inside.door.x, inside.door.z, facing); else if (safe) state.place(world!.id, safe.x, safe.z, safe.yaw); else state.place(world!.id, pos.x, pos.z, facing);
  const ok = writeSave(store, state.data);
  reportWrite(ok);
  return ok;
}
// « Partie » in the phone's settings (src/ui/saveCard.ts): save now, copy the game as a code, import one, undo the last import
const savedProfile = () => { try { return JSON.parse(store?.getItem('dakarrek.presence.profile') ?? 'null') as { name: string; look: number } | null; } catch { return null; } };
phoneHooks.saveCard = {
  save: () => !!world && saveNow(),
  code: () => { if (world) saveNow(); return exportCode(state.data, savedProfile() ?? presence.profile); },
  replace: (data, profile, key) => { if (world) saveNow(); if (!importSave(store, data, profile, Date.now(), key)) return false; holdSaves(); world = null; location.reload(); return true; },   // saved first: the game it replaces is the one kept aside
  canUndo: () => !!backupOf(store),
  undo: () => { if (!undoImport(store)) return false; holdSaves(); world = null; location.reload(); return true; },
  nameOf: spec => { const sp = catalogSpec(spec); return sp ? { name: sp.name, kind: sp.kind } : undefined; },
  toast: m => hud.toast(m),
  framed: saveHealth().framed,
};
phoneHooks.saveStatus = () => { const h = saveHealth(); return h.ok === null ? undefined : { ok: h.ok && saveLine().tone === 'ok', at: h.at, where: saveMirror()?.ok ? 'cet appareil et ' + saveMirror()!.label : 'cet appareil' }; };

hud.onAction = () => {
  hud.markAct();                                           // what the game says next answers it (src/ui/quiet.ts)
  if (activities.running) { activities.cancel('Arrêté'); return; }
  if (mode !== 'play') return;
  // right after a sheet closed the frame may not have picked the focus again yet: pick it now (src/interact/system.ts current)
  const a = interactions.primary(lambScene ? null : interactions.current(interactSpace(), pos.x, pos.z, facing, inside ? pos.y : undefined));
  if (a && !a.disabled) a.run(); else if (a?.disabled) hud.deny(a.disabled);
};
hud.onMore = () => openMore();
hud.onSceneStop = () => stopScene();
hud.onMenu = () => { if (phone.isOpen) phone.close(); else if (mode === 'play') phone.open(); };
hud.onStreak = () => { if (mode === 'play' && !phone.isOpen) phone.open('progression'); };   // the HUD's streak chip: Profil › Progression
phoneHooks.openPresence = () => presenceUi.button.click();                                       // phone › Réglages › « Jouer en ligne »
new MutationObserver(() => { if (!hud.modalOpen && !phone.isOpen && mode === 'menu') { mode = 'play'; input.enabled = true; } }).observe(document.getElementById('modal')!, { attributes: true });
addEventListener('visibilitychange', () => { if (document.hidden && world) saveNow(); });
addEventListener('pagehide', () => { if (world) saveNow(); });
setInterval(() => { if (world && mode === 'play') saveNow(); }, 8000);

/** Action button + diegetic prompt for the focused target. */
const promptV = new THREE.Vector3();
function showPrompt(t: Target | null) {
  const run = activities.current;
  if (run) { hud.setPrompt('Arrêter', run.step.label, false, { icon: '✋', stop: true }); hud.setWorldPrompt(null); return; }
  const a = t ? interactions.primary(t) : null;
  if (!t || !a) { hud.setPrompt(null); hud.setWorldPrompt(null); return; }
  const all = interactions.all(t), opt = { icon: a.icon, cost: a.cost, gain: a.gain, disabled: a.disabled };
  hud.setPrompt(a.label, a.disabled ?? (a.label === t.name ? '' : t.name), all.length > 1, opt);
  if (t.kind === 'self' || !world || seated) { hud.setWorldPrompt(null); return; }   // seated: the middle stays clear (§0 C)
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
let last = performance.now(), hudAt = -Infinity, hudKey = '';
/** The routine characters' bench seats are re-held twice a second (syncNpcSeats). */
let npcSeatT = 0;
/** A real player seated on a bench takes that place for you too (src/multiplayer/social.ts): you sit next to them, not through them. */
function syncPeerSeats() {
  const sp = interactSpace(), held = new Set<string>();
  // peers carry their presence space (a shared home is `home:<tag>`), the seats the interaction space (`home`)
  for (const p of seatedPeers(presence.peers.values(), presenceSpace())) {
    if (remoteAvatars.hidden(p)) continue;                       // a blocked player is not drawn: their place is free
    const who = 'peer:' + p.id;
    const s = seats.inSpace(sp).find(x => x.occupant === who) ?? seats.occupyNear(sp, p.x, p.z, who, 0.6);
    if (s) held.add(s.id);
  }
  for (const s of seats.all()) if (s.occupant?.startsWith('peer:') && !held.has(s.id)) seats.release(s.id, s.occupant);
}
/** One quiet line when a real player comes close (each once, not more than one every 45 s). */
function noticePlayers() {
  if (mode !== 'play' || !presence.peers.size) return;
  const p = notice.next(presence.peers.values(), { x: pos.x, z: pos.z, space: presenceSpace() }, q => remoteAvatars.hidden(q), performance.now());
  if (p) hud.toast(`${p.name} est près de toi`);
}
/**
 * Debug profiler (?debug: `__dakar.perfOn(true)`, then `__dakar.perf()`): milliseconds per system and per module of the
 * frame loop, smoothed, for the evening performance budget (scripts/check-perf-evening.mjs). Off: one boolean test.
 */
let profOn = false;
/** What the street's systems are owed while the arena's walls hide them (src/game/pace.ts). */
const pacer = new Pacer();
const prof = new Map<string, number>();
const profMark = (name: string, t0: number) => { const v = performance.now() - t0; const o = prof.get(name); prof.set(name, o === undefined ? v : o * 0.92 + v * 0.08); };
/** ?debug: the game paused, advanced frame by frame by `__dakar.step` (scripts/check-gait.mjs). */
let stepping = false;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!stepping) frameStep(now, dt);
}
/** Per frame: [ms of game work, ms of renderer.render] for the last 400 frames (debug: what a district swap costs the frame, scripts/perf-corridor.mjs). */
const frameRing: number[][] = [];
/** ?debug: modules whose update took over 25 ms in a frame: [frame index in the ring, name, ms, 1 if a district was loading]. */
const slowMods: (string | number)[][] = [];
const DEBUG_SLOW = new URLSearchParams(location.search).has('debug');
function frameStep(now: number, dt: number, draw = true) {
  const tFrame0 = performance.now();
  if (document.hidden || !world) return;
  const tFrame = profOn ? performance.now() : 0;
  setHumanoidView(camera);                                 // far, unseen and hidden bodies get less animation work (ANIM_LOD)
  if (pendingCross) {                                      // a car crossing the border road: the district changes around it, no fade
    const c = pendingCross; pendingCross = null;
    const t0 = performance.now();
    if (c.road) loadHubStaged(c.dest, c.at, c.keepSpeed ?? 0, prewarmTake(c.dest)); else loadHub(c.dest, c.at, c.keepSpeed);
    lastCrossMs = performance.now() - t0;
    if (!c.quiet) hud.toast(HUB_NAMES[c.dest]);
    saveNow();
  }

  if (input.takeMenu()) { if (activities.running) activities.cancel('Arrêté'); else if (lambScene instanceof LambScene) stopScene(); else if (hud.modalOpen) hud.closeModal(); else if (phone.isOpen) phone.close(); else if (mode === 'play') phone.open(); }
  if (phone.isOpen && mode === 'play') { mode = 'menu'; input.enabled = false; }   // a door or trip that finished behind the phone: keep movement off
  if (input.takeAction() && (mode === 'play' || activities.running)) hud.onAction();   // the focus: picked by onAction if no frame has yet
  activities.update(dt);
  { const mv = input.move(); strideUi.update(dt, Math.hypot(mv.x, mv.y) > 0.05, mode === 'play' && !seated && !lambScene); }
  if (staged) stagedStep(STAGE_BUDGET_MS);                // a district swapped in by a road: its load finishes a few ms a frame
  if (profOn) for (const m of MODULES) { if (staged && !staged.done.has(m)) continue; const t = performance.now(); m.update?.(ctx, dt); profMark('module:' + m.name, t); }
  else for (const m of MODULES) {
    if (staged && !staged.done.has(m)) continue;
    if (!DEBUG_SLOW) { m.update?.(ctx, dt); continue; }
    const t = performance.now(); m.update?.(ctx, dt); const ms = performance.now() - t;
    if (ms > 25 && slowMods.length < 60) slowMods.push([frameRing.length, 'update:' + m.name, Math.round(ms), staged ? 1 : 0]);
  }
  if ((corridors.active || hasLinks(world.id)) && !pendingCross) corridorStep(dt);

  if (rising && mode !== 'play') finishRising();                        // a door, a trip or a scene took over mid-rise
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
  } else if (mode === 'play' && rising) {
    stepRising(dt);
    state.tick(dt * 1000);
  } else if (mode === 'play') {
    const m = input.move();
    const fx = Math.sin(follow.yaw), fz = Math.cos(follow.yaw), rx = -Math.cos(follow.yaw), rz = Math.sin(follow.yaw);
    const dx = fx * m.y + rx * m.x, dz = fz * m.y + rz * m.x;
    const mag = Math.min(1, Math.hypot(m.x, m.y));
    const shiftLevel = input.shift.level(input.keys.has('ShiftLeft') || input.keys.has('ShiftRight'));       // Shift: jog; double-tapped and held: sprint
    let keep = 1;
    if (mag > 0.05) { const t = turnStep(facing, Math.atan2(dx, dz), dt, speed); facing = t.facing; keep = t.keep; }   // turn first, pace follows the facing
    const keyed = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some(k => input.keys.has(k)), stick = Math.hypot(input.joy.x, input.joy.y);
    const analog = stick > 0.01 && !keyed && strideUi.level === 0;                    // the phone's stick: the push is the speed, along one smooth curve (the keys keep walk / Shift jog / double-tap sprint)
    const target = (analog ? stride.analog(stick, dt) : stride.target(mag, Math.max(shiftLevel, strideUi.level) as RunLevel, dt)) * keep;
    speed += (target - speed) * Math.min(1, dt * (target > speed ? 6 : 12));
    if (mag > 0.05) {
      let nx = pos.x + Math.sin(facing) * speed * dt, nz = pos.z + Math.cos(facing) * speed * dt;      // along the body, not the raw stick
      [nx, nz] = pushOut(nx, nz, inside ? 0.3 : 0.5, inside ? inside.int.colliders : world.colliders, pos.y);
      const b = inside ? inside.int.bounds : world.bounds;
      if (inside) { nx = clamp(nx, b.x0, b.x1); nz = clamp(nz, b.z0, b.z1); }
      else if (!inRect(b, nx, nz)) {                                         // beyond the district's streets: only on a road that leaves it (slide along its edge like the wall)
        const roads = world.corridors, ok = (x: number, z: number) => inRect(b, x, z) || !!roads?.some(c => c.contains(x, z, 0.4));
        if (!ok(nx, nz)) { if (ok(nx, pos.z)) nz = pos.z; else if (ok(pos.x, nz)) nx = pos.x; else { nx = pos.x; nz = pos.z; } }
      }
      stride.moved(Math.hypot(nx - pos.x, nz - pos.z));
      pos.x = nx; pos.z = nz;
    } else speed *= 0.8;
    { const gy = 0.1 + (inside ? indoorGround(inside.int, pos.x, pos.z, pos.y) : world.heightAt(pos.x, pos.z)); pos.y += (gy - pos.y) * Math.min(1, dt * 14); } // climb stairs smoothly (LD2.0-D: a home's floors and flights too)
    state.tick(dt * 1000);
  } else if (mode === 'busy') {
    if (approach) stepApproach(dt);
    else if (drive) {
      speed += (drive.speed - speed) * Math.min(1, dt * 10);
      facing += Math.atan2(Math.sin(drive.facing - facing), Math.cos(drive.facing - facing)) * Math.min(1, dt * 10);
    } else speed = 0;
    state.tick(dt * 1000);
  }
  inside?.int.update?.(dt, pos, camera, litHour);                        // a home with a floor plan: its doors, the see-through hole, the room light
  if (!lambScene) {
    if ((player.pose || proxy) && speed > 0.5) { player.setPose(null); emoteT = 0; previewT = 0; hideProxy(); }
    if (emoteT > 0) { emoteT -= dt; if (emoteT <= 0) { player.setPose(null); hideProxy(); } }
    if (previewT > 0) { previewT -= dt; if (previewT <= 0 && emoteT <= 0) hideProxy(); }

    player.group.position.copy(pos); player.group.rotation.y = facing; player.animate(dt, speed);
    if (playerBody) { playerBody.group.visible = !ngembBody; playerBody.group.position.copy(pos); playerBody.group.rotation.y = facing; playerBody.animate(dt, speed); }
    if (ngembBody) { ngembBody.group.position.copy(pos); ngembBody.group.rotation.y = facing; ngembBody.animate(dt, speed); }
  } else { player.animate(0, 0); if (playerBody) playerBody.group.visible = false; if (ngembBody) ngembBody.group.visible = false; }
  let tSys = profOn ? performance.now() : 0;
  // inside the arena's walls (on the tiers) the street's cast, walkers, traffic and placed people cannot be seen: they go on
  // at 4 Hz with the time gone by
  const hidden = hiddenEvery(world.arena, camera.position);
  { const run = pacer.step('cast', dt, hidden); if (run !== null) npcLife.update(run, pos, freeCam?.p ?? camera.position); }
  if (profOn) { profMark('npcLife', tSys); tSys = performance.now(); }
  if ((npcSeatT -= dt) <= 0) { npcSeatT = 0.5; syncNpcSeats(); syncPeerSeats(); noticePlayers(); }
  { const run = pacer.step('walkers', dt, hidden); if (run !== null) { crowd?.update(run); traffic?.update(run); life?.update(run); } }
  world.tick(dt);
  if (profOn) { profMark('walkers+traffic+life+world', tSys); tSys = performance.now(); }
  { const run = pacer.step('placed', dt, hidden); if (run !== null) ambient?.update(run, freeCam?.p ?? camera.position, quality === 'low' ? 55 : 90); }
  if (profOn) { profMark('ambient(npc.ts)', tSys); tSys = performance.now(); }
  // (where each apprentice was drawn last frame: no walk up the moving car's parents for a distance)
  { const run = pacer.step('apprentices', dt, hidden); if (run !== null) for (const a of apprentices) { const wp = tmpV.setFromMatrixPosition(a.h.group.matrixWorld), d = Math.hypot(wp.x - pos.x, wp.z - pos.z); if (world.id === 'pikine') a.h.group.visible = d < 60; a.update(run, !inside && d < 22); } }   // Pikine's gare has six: past 60 m they are specks, and each body is several draw calls
  for (const h of debugPeople) h.animate(dt, 0);
  for (const w of debugWalkers) { w.t += dt; const u = w.t % w.run; w.h.group.position.set(w.x0 + w.vx * u, 0.1, w.z0 + w.vz * u); w.h.group.updateMatrixWorld(true); w.h.animate(dt, Math.hypot(w.vx, w.vz)); }
  const space = presenceSpace();
  // the body's own pose, also while an activity runs (asleep in bed, praying, dancing, eating at a table): a narrow list, anything else is Idle
  // (a Meshy body dances through its v4 stand-in, src/actors/playerBody.ts: what others see is the stand-in's pose)
  const shown = proxy && ngembBody ? ngembBody : playerBody;
  const seen = shown?.clipName ? prayerPresence(shown.clipName) ?? shown.clipName : null;     // a prayer posture: standing or kneeling
  const clip = mode !== 'scene' && seen && PRESENCE_CLIPS.includes(seen as PresenceClip) ? seen as PresenceClip : 'Idle';
  // the modules' optional fields (the arena show friends share: src/arena/together.ts), validated by the protocol
  const extras: Partial<PresenceExtras> = {}; for (const m of MODULES) Object.assign(extras, m.presence?.(ctx) ?? {});
  // fighting at the arena: where the player's wrestler stands in the ring, in a fighting stance (src/arena/myGala.ts)
  const ring = arenaDuel() ? (lambScene as LambDuel).fighterPoints()[0] : null;
  presence.publish(ring ? { type: 'move', x: ring[0], y: ring[1], z: ring[2], yaw: facing, speed: 0, space, clip: 'Stance', ...extras, ...(emoter.emo ? { emo: emoter.emo } : {}) }
    : { type: 'move', x: pos.x, y: pos.y, z: pos.z, yaw: facing, speed: mode === 'play' || approach || drive ? Math.min(speed, 6) : 0, space, clip, ...extras, ...(emoter.emo ? { emo: emoter.emo } : {}) }, now);   // walking to a seat or carrying: the legs move for others too
  remoteAvatars.update(dt, pos, space, quality === 'low' ? 6 : quality === 'medium' ? 10 : 14, camera, innerHeight);
  chat.update(dt, camera, innerHeight);
  findNearest();
  const focus = mode === 'play' && !lambScene ? interactions.update(interactSpace(), pos.x, pos.z, facing, inside ? pos.y : undefined) : (interactions.focus = null);
  economy.update(dt, pos, !!inside, mode === 'play' && !lambScene, inside ? inside.door : pos);

  follow.roofless = !!inside?.int.open;
  if (!lambScene && !MODULES.some(m => m.camera?.(ctx, dt, drag))) follow.update(dt, pos, facing, drag, inside ? inside.int.colliders : world.colliders, innerHeight > innerWidth, speed > 0.5, inside ? inside.int.cameraBox : undefined, inside ? undefined : (x, z) => world!.heightAt(x, z), inside ? undefined : world.canopies, inside ? [] : world.roofs ?? []);
  if (camOverride && !lambScene) {
    const a = facing + camOverride.side;
    camera.position.set(pos.x + Math.sin(a) * camOverride.dist, camOverride.h, pos.z + Math.cos(a) * camOverride.dist);
    camera.lookAt(pos.x, camOverride.h - 0.1, pos.z);
  }
  const ct = cityTimeAt(presence.serverNow()); const hour = hourOverride ?? ct.hourFloat;
  updateLighting(hour);
  theme.follow(hour);
  const hk = hudSpace(world.id, !!inside, hourOverride);
  if (hudDue(now, hudAt, hk, hudKey)) { hudAt = now; hudKey = hk; hudTicks++; hud.setStats(state.wallet, state.data.needs, state.mood()); { const run = runOf(state.data); hud.setStreak(run, run > 0 && state.data.streak.last === state.data.play.day, STREAK.milestones.includes(run)); } hud.setGoal(mode === 'play' && !arenaShow.watching() ? goalLine(hour) : null); const pc = placeClock(ct.day, hourOverride === null ? hour : Math.floor(hour), state.data.counters[GALA_DONE_COUNTER] === ct.day); hud.setPlace(HUB_NAMES[world.id], pc.clock, hour < 6 || hour >= 19, pc.tag); }
  if (freeCam) { camera.position.copy(freeCam.p); camera.lookAt(freeCam.t); }
  showPrompt(focus);                                       // after the camera moved: the bubble sticks to its target
  if (profOn) { profMark('rest of update', tSys); tSys = performance.now(); }
  if (draw && prewarm?.warm && !prewarm.warm.done) warmStep(WARM_VERTS);
  if (portraitWanted && playerBody && !studioOpen) drawPortrait();     // (before the frame: the picture's corner of the canvas is drawn over)
  if (draw && !studioOpen) { const tr = performance.now(); renderer.render(scene, camera); const done = performance.now(); frameRing.push([Math.round(tr - tFrame0), Math.round(done - tr), renderer.info.memory.geometries, renderer.info.memory.textures, renderer.info.programs?.length ?? 0]); if (frameRing.length > 400) frameRing.shift(); }   // the studio covers the screen and draws itself
  if (profOn) { profMark('render (CPU)', tSys); profMark('frame (JS)', tFrame); }
}

// ------------------------------------------------------------------ start
resize(); applyQuality();
/** The modules are initialised and the first hub is loaded (the debug API's trips wait for it). */
let started = false, markStarted = () => {};
const whenStarted = new Promise<void>(r => { markStarted = r; });
async function start() {
  const loading = Promise.all([preloadAssets(), preloadHumanoid(), preloadGlbVehicles(['compacte', 'teranga', 'rafet', 'lamane', 'gainde'])]);
  // a new game opens on the studio straight away: the welcome and the name need nothing loaded, the bodies load while the name is typed
  const studio = creating ? openStudio({ mode: 'new', low: quality === 'low', suggested: suggestedAvatar(store), origin: HUB_NAMES[state.data.hub].split(' · ')[0],
    name: /^Dakarois [0-9A-F]{4}$/.test(presence.profile.name) ? '' : presence.profile.name }) : null;
  if (studio) { studioOpen = true; input.enabled = false; }                      // touches on the studio never reach the game's stick or camera
  const [, made] = await Promise.all([loading, studio]);
  studioOpen = false; if (studio) { input.enabled = true; input.reset(); }
  settleAvatar(made);
  for (const m of MODULES) m.init?.(ctx);
  if (humanoidReady()) await makePlayerBody();
  const startHub = invitedHub ?? state.data.hub;
  if (invitedHub || isNewGame || (state.data.x === 0 && state.data.z === 0)) loadHub(startHub);
  else loadHub(startHub, { x: state.data.x, z: state.data.z, yaw: state.data.yaw });
  if (isNewGame) hud.toast('Bienvenue à Pikine ! Tonton Ibou t’attend devant ta chambre.');
  else if (restored.includes('loans') && state.data.loans.list.some(l => l.status === 'open')) hud.toast('Tes crédits en cours ont été retrouvés : la partie avait été ouverte avec une version plus ancienne du jeu.');
  started = true; markStarted();
  requestAnimationFrame(frame);
  if (made) requestAnimationFrame(() => requestAnimationFrame(() => made.arrive()));   // the arrival card fades once the game has drawn
  else setTimeout(() => { profilePortrait(); }, 1500);                               // a save without its Profile picture yet gets it drawn, soon after the start
}
void start();

if (DEBUG) {
  (window as unknown as Record<string, unknown>).__dakar = {
    state, hubs: HUB_IDS, three: { scene, renderer, camera, sky: sky.mesh },
    /** LD2.0-B: the player's online account as the UI sees it (src/online/api.ts), for the checks: status, me, balance, conversations, items, history. */
    account: () => online,
    presence: () => ({ status: presence.status, id: presence.id, room: presence.room, count: presence.count, peers: [...presence.peers.values()], visible: remoteAvatars.size, bikes: remoteAvatars.bikes, poses: remoteAvatars.poses(), gear: remoteAvatars.gear(), move: presence.lastPublished }),
    // before the modules' init has run (the assets still loading), the trip waits for it (the returned promise)
    teleport(hub: HubId, x?: number, z?: number, yaw = 0) { const go = () => loadHub(hub, x === undefined ? undefined : { x, z: z ?? 0, yaw }); if (started) go(); else return whenStarted.then(go); },
    setHour(h: number | null) { hourOverride = h; },
    /** Checks: the next city day(s) for the modules that date things by day (errands, debts). */
    nextDay(n = 1) { dayShift += n; return cityTimeAt(presence.serverNow()).day + dayShift; },
    camera: () => ({ at: [camera.position.x, camera.position.y, camera.position.z], fov: camera.fov, aspect: Math.round(camera.aspect * 1000) / 1000, hfov: Math.round(2 * Math.atan(Math.tan(camera.fov * Math.PI / 360) * camera.aspect) * 1800 / Math.PI) / 10 }),
    pos: () => ({ x: pos.x, y: pos.y, z: pos.z, hub: world?.id, mode, near: nearest?.name ?? null, yaw: facing, cam: follow.yaw }),
    interactables: () => world?.interactables.map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z })) ?? [],
    cityPlaces: () => world?.interactables.filter(i => i.id.includes(':city:')).map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z, radius: i.radius, actions: i.actions.map(a => ({ id: a.id, label: a.label, gain: a.gain, cost: a.cost })) })) ?? [],
    crossMs: () => lastCrossMs,
    /** ?debug: writes the save now (the player's place included). */
    save: () => { if (world) saveNow(); },
    /** The roads between districts (src/road): chunks, traffic, and where a point of this district's frame stands on a road. */
    road: {
      info: () => corridors.info(),
      /** The road a point (this district's frame) is on: its id, arc length, side (+ left of the travel direction a → b), the road's heading there, and its length. */
      project: (x: number, z: number) => { let best: { road: string; s: number; d: number; yaw: number; length: number; swapS: number; hub: HubId; a: HubId; b: HubId; on: boolean } | null = null; for (const id of corridors.info().map(i => i.road)) { const v = corridors.view(id)!, p = v.project(x, z), on = v.contains(x, z, 0); if (Math.abs(p.d) > 80 && !on) continue; if (!best || (on && !best.on) || (on === best.on && Math.abs(p.d) < Math.abs(best.d))) best = { road: id, s: p.s, d: p.d, yaw: p.yaw, length: v.road.length, swapS: v.road.swapS, hub: v.hub, a: v.road.def.a, b: v.road.def.b, on }; } return best; },
      /** A point of the road, in the loaded district's frame: `s` metres from a, `lat` metres to the left of the a → b direction. */
      at: (id: string, s: number, lat = 0) => { const v = corridors.view(id); if (!v) return null; const a = v.road.spine.at(s), y = Math.atan2(v.road.spine.at(s + 2).x - v.road.spine.at(s - 2).x, v.road.spine.at(s + 2).z - v.road.spine.at(s - 2).z); return { x: a.x + Math.cos(y) * lat + v.offset.x, z: a.z - Math.sin(y) * lat + v.offset.z, yaw: y }; },
      lastSwapMs: () => lastCrossMs,
      /** What is solid within `r` metres of (x, z): the district's colliders (stalls, poles, parked vehicles…) and whether the road's ground holds the point. */
      probe: (x: number, z: number, r = 6) => world ? { colliders: world.colliders.filter(c => x > c.x0 - r && x < c.x1 + r && z > c.z0 - r && z < c.z1 + r).map(c => [+c.x0.toFixed(1), +c.z0.toFixed(1), +c.x1.toFixed(1), +c.z1.toFixed(1), c.h]), ground: !!world.corridors?.some(c => c.contains(x, z, 1)) } : null,
      staged: () => (staged ? { steps: staged.steps, maxStep: staged.maxStep, done: staged.done.size } : null),
      lastStaged: () => lastStaged,
      putTraffic: (id: string, i: number, sArc: number, dir: 1 | -1) => corridors.view(id)?.putTraffic(i, sArc, dir) ?? null,
      frames: () => frameRing,
      slowMods: () => slowMods,
      prewarm: () => (prewarm ? { id: prewarm.id, ready: !!prewarm.world, ms: Math.round(prewarm.ms), steps: prewarm.steps, warmed: prewarm.warm ? `${prewarm.warm.i}/${prewarm.warm.kids.length}` : null } : null),
    },
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
    focus: () => { const t = interactions.focus; return t ? { id: t.id, name: t.name, kind: t.kind, space: t.space, primary: interactions.primary(t)?.label ?? null, all: interactions.all(t).map(a => a.label), why: interactions.all(t).filter(a => a.disabled).map(a => a.disabled) } : null; },
    seated: () => seated?.id ?? null,
    approach: () => approach ? { seat: approach.seat.id, leg: approach.i, legs: approach.path.length, settle: +approach.settle.toFixed(2), x: +pos.x.toFixed(2), z: +pos.z.toFixed(2) } : null,
    lying: () => (seated && seatClip(seated) === 'Lie' ? 1 : 0),
    roomGeometry: () => inside ? { colliders: inside.int.colliders, bounds: inside.int.bounds } : null,
    /** LD2.0-C: the home with a floor plan the player is in (src/housing/apartment.ts): its plan, the room, the doors, the light, the hole; null elsewhere. */
    home: () => (inside?.int.describe?.() ?? null),
    seatsHere: () => seats.inSpace(interactSpace()).map(s => ({ id: s.id, x: s.x, z: s.z, top: s.top, yaw: s.yaw, kind: s.kind, occupant: s.occupant, table: s.table ?? null })),
    sit(id: string) { const s = seats.get(id); if (s) sitOn(s); return seated?.id ?? null; },
    /** Debug: « S'asseoir » as the player does it (walks round the furniture to the seat first). */
    sitWalk(id: string) { const s = seats.get(id); if (!s || !goSit(s)) return false; mode = 'busy'; input.enabled = false; return true; },
    stand() { standUp(); },
    /** Debug: where the player sat down from (the spot beside the seat), or null. */
    sitOrigin: () => sitOrigin ? { x: +sitOrigin.x.toFixed(2), z: +sitOrigin.z.toFixed(2) } : null,
    /** « Encourager » from a place in the stands (true if the player rose to cheer). */
    cheer(s?: number) { return cheer(s); },
    more() { openMore(); },
    clip: () => playerBody?.clipName ?? null,
    presenceLook: () => presence.appearance ?? null,
    /** The checks: a body and a look as « Modifier mon personnage » would save them (the presence reconnects with the look). */
    character: (avatar: StudioResult['avatar'], appearance: StudioResult['appearance']) => { applyCharacter({ name: null, avatar, appearance, portrait: null, arrive() {} }); saveNow(); return makePlayerBody(); },
    avatar: () => ({ identity: state.data.avatar, appearance: state.data.appearance, drawn: playerBody?.appearance ?? null, body: playerBody?.body ?? null, expected: bodyOf(state.data.avatar), stand: ngembBody?.body ?? null }),
    activity: () => { const c = activities.current; return c ? { id: c.spec.id, step: c.step.label, index: c.index, scores: c.scores, t: +c.t.toFixed(2), seconds: c.step.seconds ?? 0 } : null; },
    gesture: () => gestures.info(),
    stride: () => ({ stamina: Math.round(stride.stamina), max: stride.maxStamina(), running: stride.running, sprinting: stride.sprinting, gait: stride.gait, winded: stride.winded, forme: stride.forme, speed, run: stride.runSpeed(), why: stride.whyNot(), toggle: strideUi.runToggle }),
    strideToggle: (on: boolean | 0 | 1 | 2) => { strideUi.level = on === true ? 1 : on === false ? 0 : on; },
    /** Checks that test something else than the gesture itself finish it at once with this score. */
    gestureFinish: (score = 1) => gestures.finishNow(score),
    /** Procedural arm and torso gestures on the player's body (src/actors/gesture.ts), for the checks. */
    ik: { reach, bodyPoint, mouth, bend, nod, grip },
    placeList: () => places.all().map(p => ({ id: p.id, type: p.type, name: p.name, space: p.space, anchors: p.anchors.map(a => a.id) })),
    inventory: () => inventory.list(),
    roomInteractables: () => inside ? inside.int.interactables.map(i => ({ id: i.id, name: i.name, x: i.x, z: i.z })) : [],
    travelTo: (h: HubId) => doTravel(h),
    rel, beats: () => ({ ...state.data.beats }), flags: () => [...state.data.flags],
    suggestion: () => suggestion(rel, state)?.id ?? null,
    hudTicks: () => hudTicks,
    /** The quiet screen (docs/UI_V2_PLAN.md §0 C): the middle, the overlays over it, transient lines and moment cards. */
    quiet: () => hud.measureQuiet(),
    /** The quiet log (the phone's Notifications): unseen count and the latest entries. */
    quietLog: () => ({ unread: quietLog.unread, entries: quietLog.entries.slice(0, 12).map(e => e.text) }),
    playBeat(id: string, choice: string) { const b = BEATS.find(x => x.id === id)!; const c = b.choices.find(x => x.id === choice)!; return applyChoice(b, c, rel, state); },
    /** The city day (the shared clock), for the checks. */
    cityDay: () => cityTimeAt(presence.serverNow()).day,
    /** Social between real players (checks): the last emote this device made, the glyphs shown, the seats taken by peers. */
    social: () => ({ emo: emoter.emo, players: mapBridge.playersNow(), glyphs: remoteAvatars.glyphs(), peerSeats: seats.all().filter(s => s.occupant?.startsWith('peer:')).map(s => ({ id: s.id, by: s.occupant })), hidden: [...presence.peers.values()].filter(p => remoteAvatars.hidden(p)).map(p => p.id) }),
    socialEmote(kind: 'salut' | 'merci' | 'bravo' | 'rire', to?: string) { return emoter.make(kind, to, performance.now()); },
    npcWhere: (id: string) => npcLife.where(id), npcSheet: (id: string) => npcLife.sheet(id),
    npcSettle: () => npcLife.settle(), npcAudit: () => npcLife.audit(), npcSlots: (h: number) => npcLife.slotsAt(h), people: () => npcLife.openPeople(),
    openNpc(id: string) { const it = world?.interactables.find(i => i.npc === id); if (it) openActions(it); },
    scene(kind: SceneKind) { const a = [...ACTIONS.arena, ...ACTIONS.ecurie].find(x => x.special === kind); if (a) runSpecial(a); else startScene(kind); },
    wrestlerReady: () => humanoidReady(),
    body: () => playerBody,
    faceCamera() { follow.pin(); follow.yaw = facing + Math.PI; },
    portrait(dist = 2.2, h = 1.5, side = 0.35) { camOverride = dist > 0 ? { dist, h, side } : null; },
    /** A body walking from (x, z) along `yaw` at `speed` m/s for `len` m, then again from the start. */
    addWalker(x: number, z: number, yaw: number, speed: number, len = 60) { const h = new Humanoid({ ...randomLookDbg(), style: 'tee', hat: undefined, female: false }); h.group.rotation.y = yaw; extra.add(h.group); debugWalkers.push({ h, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed, x0: x, z0: z, t: 0, run: len / speed }); return debugWalkers.length - 1; },
    walkerPos: (i: number) => { const w = debugWalkers[i]; return w ? { x: w.h.group.position.x, z: w.h.group.position.z } : null; },
    clearWalkers() { for (const w of debugWalkers) w.h.group.removeFromParent(); debugWalkers.length = 0; },
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
    /** Checks: answer each call of the drill being played right, as it opens (see LambDuel.debugDrillAnswer). */
    duelDrillAnswer(on = true) { if (lambScene instanceof LambDuel) lambScene.debugDrillAnswer(on); },
    /** Checks: start an écurie drill by its action id (drill_frappe, drill_saisies, drill_force) — played with ?lamb2. */
    drillStart(actionId: string) {
      const it = world?.interactables.find(i => i.actions.some(a => a.id === actionId)), a = it?.actions.find(x => x.id === actionId);
      if (it && a) { nearest = it; runAction(a, it.npc, it); }
    },
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
    enter(kind: 'home' | 'gargote' | 'maiga') { const it = world?.interactables.find(i => i.id.includes(`:${kind}:`)); if (it) enterInterior(it); },
    exit() { exitInterior(); },
    look(yaw: number, pitch?: number) { follow.pin(); follow.yaw = yaw; if (pitch !== undefined) follow.pitch = pitch; },
    /** `y` (LD2.0-D, indoors in a home on several levels): the height of the floor to stand on (0 the ground floor, 3.4 upstairs…). */
    place(x: number, z: number, yaw: number, y?: number) { pos.set(x, 0.1 + (inside ? indoorGround(inside.int, x, z, 0.1 + (y ?? pos.y - 0.1)) : world?.heightAt(x, z) ?? 0), z); facing = yaw; follow.snapBehind(yaw); },
    cam(p: [number, number, number] | null, t?: [number, number, number]) { freeCam = p && t ? { p: new THREE.Vector3(...p), t: new THREE.Vector3(...t) } : null; },
    /** Pause the game loop (true) or let it run (false); while paused, `step(dt, n)` advances it by n frames of dt seconds. */
    pause(on: boolean) { stepping = on; },
    step(dt = 1 / 60, n = 1) { for (let i = 0; i < n; i++) frameStep(performance.now(), dt, false); return { x: pos.x, y: pos.y, z: pos.z, yaw: facing, speed }; },
    /** Draw the frame again (after `cam` while paused). */
    render() { if (freeCam) { camera.position.copy(freeCam.p); camera.lookAt(freeCam.t); } renderer.render(scene, camera); },
    /** The player's gait (src/actors/gait.ts) and the soles' points in the world: heel and ball of each foot. */
    gait() {
      const b = playerBody; if (!b) return null;
      b.group.updateMatrixWorld(true);
      const sole = (side: 'L' | 'R') => {
        const f = b.group.getObjectByName(`foot${side}`); if (!f) return null;
        const p = (v: [number, number, number]) => new THREE.Vector3(...v).applyMatrix4(f.matrixWorld).toArray().map(n => +n.toFixed(4));
        return { heel: p([...GAIT_SOLE.heel]), ball: p([...GAIT_SOLE.ball]) };
      };
      return { ...b.gaitInfo(), clip: b.clipName, hold: b.hold, L: sole('L'), R: sole('R') };
    },
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
