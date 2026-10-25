import type { GameCtx, GameModule } from '../game/modules';
import type { Affordance, Target, TargetSource } from '../interact/types';
import type { HubWorld } from '../world/types';
import { Humanoid, humanoidReady, type PersonLook } from '../actors/humanoid';
import { vtcHooks } from '../transport/vtc';
import { hourStamp, recordVisit } from '../social/memory';
import { Relations, PLAYER } from '../social/relations';
import {
  MZ, PAPE_ID, PAPE_LINES, PAPE_NAME, PAPE_SPOT, mermozRequests, onPaid, recognise, recognition,
} from './mermozRules';

/**
 * Mermoz · Sacré-Cœur, M1 « After Work » (docs/districts/M1-MERMOZ.md): Pape Diouf at the gate of Résidence Les Filaos, the two rides he is part of on
 * the phone's « Courses VTC » (src/transport/vtc.ts vtcHooks: same acceptance, same single payment), his thanks when a ride ends at his gate, and his
 * recognition on a later visit. The rules are src/districts/mermozRules.ts; this module stands him there and speaks for him.
 */
const LOOK: PersonLook = { skin: 0x3d2416, style: 'boubou', top: 0x6f7f5a, bottom: 0x3a3a34, hat: 'kufi', hatColor: 0xece6d6, shoes: 0x2a2018, beard: 0x2a2620, heavy: 0.25 };
const SAY_DELAY = 2.8;         // after the completion card has come up
const NOTICE = 7;              // metres: he sees the driver at his gate

let h: Humanoid | null = null;
let here = false, metThisLoad = false, checked = false;
let pending: { line: string[]; t: number } | null = null;
const log = { said: [] as string[], recognised: 0, thanked: 0 };

const spot = () => ({ x: PAPE_SPOT.x, z: PAPE_SPOT.z });
function speak(ctx: GameCtx, line: string) {
  ctx.toast(`${PAPE_NAME} · gardien : « ${line} »`); log.said.push(line);
}
function faceTo(x: number, z: number) {
  if (h) h.group.rotation.y = Math.atan2(x - PAPE_SPOT.x, z - PAPE_SPOT.z);
}

function talk(ctx: GameCtx) {
  const d = ctx.state.data, met = (d.counters[MZ.met] ?? 0) > 0;
  faceTo(ctx.player.pos.x, ctx.player.pos.z);
  recordVisit(ctx.state, PAPE_ID, hourStamp(ctx.day(), ctx.hour()));
  const line = d.flags.includes(MZ.offer) && !d.flags.includes(MZ.offerDone) ? PAPE_LINES.pending : met ? PAPE_LINES.idleMet : PAPE_LINES.idle;
  speak(ctx, line); ctx.save();
}

const target: Target = {
  id: 'mermoz:pape', name: `${PAPE_NAME} · gardien des Filaos`, kind: 'person', space: 'street', x: PAPE_SPOT.x, y: 1.9, z: PAPE_SPOT.z, radius: 2.6, bias: 0.4,
  affordances: () => aff,
};
let aff: Affordance[] = [];
const source = (ctx: GameCtx): TargetSource => ({
  name: 'mermoz:pape',
  collect(space, x, z, out) {
    if (!h || space !== 'street' || ctx.player.seated()) return;
    if (Math.hypot(PAPE_SPOT.x - x, PAPE_SPOT.z - z) > 6) return;
    out.push(target);
  },
});

/** The first time near his gate on this arrival: does he recognise the driver (a later visit, once a day)? */
function notice(ctx: GameCtx) {
  if (checked || metThisLoad) return;
  const p = ctx.player.pos;
  if (Math.hypot(p.x - PAPE_SPOT.x, p.z - PAPE_SPOT.z) > NOTICE) return;
  checked = true;
  const d = ctx.state.data, day = ctx.day(), r = recognition(d, day, hourStamp(day, ctx.hour()));
  if (!r) return;
  recognise(d, day, r.reveal);
  recordVisit(ctx.state, PAPE_ID, hourStamp(day, ctx.hour()));
  new Relations(d).change(PLAYER, PAPE_ID, 2);
  log.recognised++;
  faceTo(p.x, p.z);
  pending = { line: r.reveal ? [PAPE_LINES.recognise, PAPE_LINES.reveal] : [PAPE_LINES.recognise], t: 0.4 };
  ctx.save();
}

export const mermozModule: GameModule = {
  name: 'mermoz',
  init(ctx) {
    ctx.interactions.add(source(ctx));
    aff = [{ id: 'parler', verb: 'talk', label: `Parler à ${PAPE_NAME.split(' ')[0]}`, icon: '🤝', run: () => talk(ctx) }];
    vtcHooks.extra.push(hub => mermozRequests(hub, ctx.state.data));
    vtcHooks.paid.push(t => {
      const d = ctx.state.data, said = onPaid(d, t, hourStamp(ctx.day(), ctx.hour()));
      if (!said) return;
      new Relations(d).change(PLAYER, PAPE_ID, said === 'first' ? 3 : 1);
      log.thanked++;
      if (said === 'first') metThisLoad = true;
      if (here) { faceTo(t.dropoff.x, t.dropoff.z); pending = { line: [said === 'first' ? PAPE_LINES.first : PAPE_LINES.again], t: SAY_DELAY }; }
    });
  },
  hubLoaded(ctx, hub: HubWorld) {
    if (h) { h.group.removeFromParent(); h.dispose(); h = null; }
    here = hub.id === 'mermoz'; metThisLoad = false; checked = false; pending = null;
    if (!here || !humanoidReady()) return;
    h = new Humanoid(LOOK); h.hold = 'Idle';
    h.group.position.set(PAPE_SPOT.x, 0.1, PAPE_SPOT.z); h.group.rotation.y = PAPE_SPOT.yaw;
    ctx.extra.add(h.group);
  },
  update(ctx, dt) {
    if (!h) return;
    const p = ctx.player.pos, near = Math.hypot(p.x - PAPE_SPOT.x, p.z - PAPE_SPOT.z) < 80;
    h.group.visible = near;
    if (near) h.animate(dt, 0);
    notice(ctx);
    if (pending && (pending.t -= dt) <= 0) {
      const [line, ...rest] = pending.line;
      speak(ctx, line);
      pending = rest.length ? { line: rest, t: 2.8 } : null;
    }
  },
  debug: ctx => ({
    /** Mermoz's M1: Pape at his gate, what he has said, and what the save remembers (flags and counters, no other field). */
    mermoz: {
      info: () => ({
        pape: h ? { ...spot(), visible: h.group.visible } : null, said: [...log.said], recognised: log.recognised, thanked: log.thanked,
        flags: ctx.state.data.flags.filter(f => f.startsWith('mz_')),
        counters: Object.fromEntries(Object.entries(ctx.state.data.counters).filter(([k]) => k.startsWith('mz_') || k.endsWith(PAPE_ID))),
        rel: new Relations(ctx.state.data).level(PAPE_ID),
      }),
      talk: () => talk(ctx),
    },
  }),
};
