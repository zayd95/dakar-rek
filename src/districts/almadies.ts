import type { GameCtx, GameModule } from '../game/modules';
import type { Affordance, Target, TargetSource } from '../interact/types';
import type { HubWorld } from '../world/types';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { hourStamp, recordFreeService, recordVisit } from '../social/memory';
import { Relations, PLAYER } from '../social/relations';
import { conversation, type Choice } from '../venues/venue';
import { dishActivity, rooftopHere } from '../venues/rooftop';
import {
  AL, AWA_ID, AWA_LINES, AWA_NAME, AWA_TITLE, TOAST_CHOICES, awaTalk, chooseToast, clubOpen, endEvening, eveningOf, giftReady, gifted, noteCounter, stages, talked,
} from './almadiesRules';

/**
 * Almadies · Ngor, M4 « One Evening Out » (docs/districts/M4-ALMADIES.md): Awa Sy keeps the house at the Terrasse de Ngor (src/venues/rooftop.ts) and
 * sends the guest on to La Vague (src/venues/club.ts). This module stands her on the terrace, speaks for her, remembers the evening through the
 * activities' own counters, and shows one card when the evening is over. The meal, the club entry and the dance are the existing activities, unchanged.
 */
const LOOK: PersonLook = { skin: 0x5b3420, style: 'dress', top: 0x0f6f8f, pattern: 'wax', accent: 0xf2d38a, female: true, hat: 'headwrap', hatColor: 0xf2d38a, shoes: 0x3a2a1e };
const CLUB_ID = 'almadies:venue:club';
const CLUB_SPACE = CLUB_ID;
/** The neighbourhood directory's entry for La Vague (src/world/city.ts): what the walking marker points to. */
const CLUB_PLACE = 'almadies:city:club';
const DANSES = `club:${CLUB_ID}:danses`;
/** Her place on the terrace (in the room's own frame), west end of the bar, facing the stairs. */
const SPOT = { dx: -0.8, z: -3.4, yaw: 0 };

let h: Humanoid | null = null;
let here = false, space = 'street', pollT = 0, greeted = -1;
let spot: { x: number; z: number; doorId: string } | null = null;
const log = { talks: 0, cards: 0, said: [] as string[], gifts: 0 };

const night = (ctx: GameCtx) => eveningOf(ctx.day(), ctx.hour());
const data = (ctx: GameCtx) => ctx.state.data;
function say(ctx: GameCtx, line: string) { ctx.toast(`${AWA_NAME} : « ${line} »`); log.said.push(line); }

/** The evening is over: one card, if something was done and it was not shown yet. */
function end(ctx: GameCtx, why: 'club' | 'leave') {
  const d = data(ctx), n = night(ctx);
  if (why === 'club' && !(stages(d, n) & 4)) return;                       // leaving the club without having danced is not the end of the evening
  const card = endEvening(d, n);
  if (!card) return;
  log.cards++;
  ctx.hud.moment(card, 11000); ctx.save();
}

function poll(ctx: GameCtx) {
  const d = data(ctx), n = night(ctx);
  noteCounter(d, n, 'dine', d.counters.terrasse ?? 0);
  noteCounter(d, n, 'dance', d.counters[DANSES] ?? 0);
}

function openGift(ctx: GameCtx) {
  const r = rooftopHere(); if (!r) return false;
  const coffee = { ...r.def.menu[r.def.menu.length - 1], price: 0 };
  if (!ctx.activities.start(dishActivity(r.def, coffee, r.bar), { place: r.def.name })) return false;
  gifted(data(ctx), night(ctx)); log.gifts++; ctx.save();
  return true;
}

function talk(ctx: GameCtx) {
  const d = data(ctx), n = night(ctx), toast0 = d.counters[AL.toast] ?? 0, mask0 = d.counters[AL.lastMask] ?? 0;
  const kind = awaTalk(d, n), gift = giftReady(d, n);
  const t = talked(d, n, hourStamp(ctx.day(), ctx.hour()));
  recordVisit(ctx.state, AWA_ID, hourStamp(ctx.day(), ctx.hour()));
  recordFreeService(ctx.state, AWA_ID, hourStamp(ctx.day(), ctx.hour()));
  if (t.kind !== 'again') new Relations(d).change(PLAYER, AWA_ID, t.kind === 'first' ? 2 : 1);
  if (t.moment) ctx.state.adjust({ social: 8, moral: 3 });                   // a real word, once an evening: asking again gives nothing
  log.talks++;
  const hint = AWA_LINES.club(clubOpen(ctx.hour()));
  const toClub = () => { ctx.walkTo(CLUB_PLACE); return hint; };
  const bye: Choice = { label: 'À tout à l’heure', icon: '👋', pick: () => { say(ctx, AWA_LINES.bye); return null; } };
  const club: Choice = { label: 'Et après le dîner ?', icon: '🌙', pick: toClub };
  const coffee: Choice[] = gift ? [{ label: 'Un café Touba', icon: '☕', pick: () => { if (!openGift(ctx)) return 'Termine d’abord ce que tu fais, je ne bouge pas.'; return null; } }] : [];
  if (kind === 'first') {
    const toasts: Choice[] = TOAST_CHOICES.map(c => ({ label: c.label, icon: c.icon, pick: () => { chooseToast(d, c.id); ctx.save(); return `${AWA_LINES.toast[c.id - 1]} ${toClub()}`; } }));
    conversation(ctx, `${AWA_NAME} · ${AWA_TITLE}`, AWA_LINES.first, [...toasts, club, bye]);
  } else if (kind === 'recognise') {
    conversation(ctx, `${AWA_NAME} · ${AWA_TITLE}`, AWA_LINES.recognise(toast0, mask0), [...coffee, { label: 'Oui, ça va bien', icon: '🙂', pick: () => AWA_LINES.gift }, club, bye]);
  } else {
    conversation(ctx, `${AWA_NAME} · ${AWA_TITLE}`, AWA_LINES.again, [...coffee, club, bye]);
  }
  ctx.save();
}

let aff: Affordance[] = [];
const target = (): Target | null => spot ? ({
  id: 'almadies:awa', name: `${AWA_NAME} · ${AWA_TITLE}`, kind: 'person', space: spot.doorId, x: spot.x, y: 1.9, z: spot.z, radius: 2.6, bias: 0.5, affordances: () => aff,
}) : null;
const source = (ctx: GameCtx): TargetSource => ({
  name: 'almadies:awa',
  collect(sp, x, z, out) {
    const t = target(); if (!h || !t || sp !== t.space || ctx.player.seated()) return;
    if (Math.hypot(t.x - x, t.z - z) > 6) return;
    out.push(t);
  },
});

export const almadiesModule: GameModule = {
  name: 'almadies',
  init(ctx) {
    ctx.interactions.add(source(ctx));
    aff = [{ id: 'parler', verb: 'talk', label: `Parler à ${AWA_NAME.split(' ')[0]}`, icon: '🤝', run: () => talk(ctx) }];
  },
  hubLoaded(ctx, hub: HubWorld) {
    const wasHere = here;
    if (h) { h.group.removeFromParent(); h.dispose(); h = null; }
    spot = null; here = hub.id === 'almadies'; space = 'street'; pollT = 0;
    if (wasHere && !here) end(ctx, 'leave');                                  // a taxi, a drive out of Almadies: the evening is over
    if (!here || !humanoidReady()) return;
    const r = rooftopHere(); if (!r) return;
    spot = { x: r.ox + SPOT.dx, z: SPOT.z, doorId: r.doorId };
    h = new Humanoid(LOOK); h.hold = 'Idle';
    h.group.position.set(spot.x, 0.1, spot.z); h.group.rotation.y = SPOT.yaw;
    r.group.add(h.group);
    poll(ctx);                                                               // adopts the counters as they are: a loaded save invents no stage
  },
  update(ctx, dt) {
    if (!here) return;
    const was = space; space = ctx.space();
    if (was === CLUB_SPACE && space !== CLUB_SPACE) end(ctx, 'club');
    if (h && spot && space === spot.doorId) {
      h.animate(dt, 0);
      if (was !== space) {                                                     // walked up the stairs: a later evening, she remembers
        const d = data(ctx), n = night(ctx);
        if (awaTalk(d, n) === 'recognise' && greeted !== n) { greeted = n; say(ctx, AWA_LINES.recognise(d.counters[AL.toast] ?? 0, d.counters[AL.lastMask] ?? 0)); }
      }
    }
    if ((pollT -= dt) <= 0) { pollT = 0.5; poll(ctx); }
  },
  debug: ctx => ({
    almadies: {
      info: () => ({
        here, awa: h && spot ? { x: spot.x, z: spot.z, doorId: spot.doorId } : null, night: night(ctx), stages: stages(data(ctx), night(ctx)), said: [...log.said], talks: log.talks, cards: log.cards, gifts: log.gifts,
        counters: Object.fromEntries(Object.entries(data(ctx).counters).filter(([k]) => k.startsWith('al_') || k === 'terrasse' || k === DANSES)),
        rel: new Relations(data(ctx)).level(AWA_ID),
      }),
      talk: () => talk(ctx),
      end: (why: 'club' | 'leave' = 'leave') => end(ctx, why),
    },
  }),
};
