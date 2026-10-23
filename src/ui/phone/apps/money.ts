import type { Screen, PhoneApi } from '../types';
import { badge, btn, card, empty, esc, more, row, rows, section } from '../kit';
import { debtsNow } from '../selectors';
import { phoneHooks, type LedgerEntry } from '../../phoneHooks';
import { fcfa } from '../../hud';

/**
 * Argent: the balance (one line at any size), what the player owes and when the next repayment falls, income and charges, the last movements (the
 * full history on a tap), and the money apps (Crédits, Biens, Affaires).
 */
function when(at: number): string {
  const d = new Date(at);
  return Number.isFinite(d.getTime()) ? d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
const signed = (n: number) => (n < 0 ? '−' : '+') + fcfa(Math.abs(n));
const ledgerRows = (list: LedgerEntry[]) => rows(list.map(r => row({ label: r.label, sub: when(r.at), value: signed(r.amount), tone: r.amount < 0 ? '' : 'gain' })));

function balance(api: PhoneApi): string {
  const cash = api.ctx.state.wallet, full = fcfa(cash), w = phoneHooks.wealth?.();
  const size = full.length > 17 ? 'xl' : full.length > 13 ? 'l' : '';
  return `<div class="ph-balance"><small>Solde</small><b class="${size}">${esc(full)}</b><span>FCFA · monnaie de jeu, sans valeur réelle</span>
    ${w ? `<div class="mn-worth"><span>Fortune totale</span><b>${esc(fcfa(cash + w.assets))}</b></div>` : ''}</div>`;
}

export const moneyScreen: Screen = {
  title: 'Argent',
  mount(page, api) {
    const s = api.ctx.state, debt = debtsNow(s), w = phoneHooks.wealth?.(), ledger = phoneHooks.ledger?.();
    const debtHtml = debt ? section('Crédits', card(`<div class="mn-debt"><span><small>Reste à rembourser</small><b>${esc(fcfa(debt.left))}</b></span>${debt.late > 0 ? badge('En retard', 'warn') : debt.next > 0 && debt.inDays <= 0 ? badge('Dû aujourd’hui', 'sun') : ''}</div>
        ${debt.next > 0 ? `<p class="mn-next">Prochain remboursement : <b>${esc(fcfa(debt.next))}</b> ${debt.inDays <= 0 ? 'aujourd’hui' : debt.inDays === 1 ? 'demain' : `dans ${debt.inDays} jours`}</p>` : ''}
        ${phoneHooks.openCredits ? btn('Rembourser', { act: 'credits', kind: debt.late > 0 || debt.inDays <= 0 ? 'primary' : 'secondary' }) : ''}`)) : '';
    const flows = w ? section('Revenus et charges', rows([
      row({ icon: '📈', label: 'Revenus', sub: 'Par heure en ville, pendant que tu joues', value: '+' + fcfa(w.perHour), tone: 'gain' }),
      ...(w.charges ? [row({ icon: '📉', label: 'Loyers et charges', sub: 'Par heure en ville', value: '−' + fcfa(w.charges) })] : []),
      row({ icon: '🏷️', label: 'Valeur de tes biens', value: fcfa(w.assets) }),
    ]) + (w.polyvalence ? more('Polyvalence', `<p>${esc(w.polyvalence)}</p>`) : '')) : '';
    const apps = [
      phoneHooks.openCredits ? row({ icon: '💳', label: 'Crédits', sub: debt ? `${debt.count} en cours` : 'Aucune dette', act: 'credits' }) : '',
      phoneHooks.openAssets ? row({ icon: '🔑', label: 'Biens', sub: 'Logements, terrains, panneau, annonces', app: 'biens' }) : '',
      phoneHooks.openBusiness ? row({ icon: '🏢', label: 'Affaires', sub: 'Acheter et voir les revenus', app: 'affaires' }) : '',
    ].filter(Boolean);
    const recent = ledger === undefined ? empty('🧾', 'L’historique des gains et des dépenses arrive avec les métiers.')
      : ledger.length === 0 ? empty('🧾', 'Aucune opération pour l’instant.')
        : (() => { const list = ledger.slice().sort((a, b) => b.at - a.at); return ledgerRows(list.slice(0, 5)) + (list.length > 5 ? more(`Tout l’historique (${list.length})`, ledgerRows(list.slice(5)), 'mn-all') : ''); })();
    page.innerHTML = `${balance(api)}${debtHtml}${flows}${apps.length ? section('Gérer', rows(apps)) : ''}${section('Derniers mouvements', recent)}`;
    page.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act="credits"]');
      if (b && phoneHooks.openCredits) api.launch(phoneHooks.openCredits);
    });
  },
  tick(page, api) {
    const b = page.querySelector('.ph-balance > b'), t = fcfa(api.ctx.state.wallet);
    if (b && b.textContent !== t) { b.textContent = t; b.className = t.length > 17 ? 'xl' : t.length > 13 ? 'l' : ''; }   // in place: the list keeps its scroll
  },
};
