import type { GameState } from '../core/state';
import { CAST } from '../social/cast';
import { Relations } from '../social/relations';
import { BEATS, nextLead, openWelcome } from '../social/beats';

export const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]!));

/**
 * Carnet: the next lead, Tonton Ibou's welcome while it is still to do (optional: it is never forced on the HUD once
 * the first moments are over; done, it is gone for good), the player's relations and the neighbourhood's own links
 * (phone › Carnet).
 */
export function journalView(rel: Relations, state: GameState): { subtitle: string; html: string } {
  const met = CAST.filter(c => rel.level(c.id) !== 0 || BEATS.some(b => b.npc === c.id && rel.beatDone(b.id)));
  const next = nextLead(rel, state), welcome = openWelcome(rel);
  const html = `<h3>Prochaine piste</h3><div class="kv">${next ? esc(next.hint) : 'Aucune pour l’instant.'}</div>
    ${welcome ? `<h3>Facultatif</h3><div class="kv opt">${esc(welcome.hint)}</div>` : ''}
    <h3>Tes relations</h3><div class="rel">${met.length ? met.map(c => `<span>${esc(c.name)} · ${esc(c.title)}</span><em>${Relations.label(rel.level(c.id))}</em>`).join('') : '<span>Personne encore.</span><em></em>'}</div>
    <h3>Le quartier se connaît</h3><div class="rel">${rel.links().map(l => `<span>${esc(l.a)} ↔ ${esc(l.b)}</span><em>${esc(l.note)}</em>`).join('')}</div>`;
  return { subtitle: `${Object.keys(state.data.beats).length} histoire(s) vécue(s)`, html };
}
