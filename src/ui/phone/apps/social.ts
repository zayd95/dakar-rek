import type { Screen } from '../types';
import { empty, esc } from '../kit';
import { quietLog, ago } from '../../quiet';
import { journalView } from '../../journal';

/**
 * Contacts and activity: the Notifications (what the game noted without stopping the player) and the Carnet (the next lead, the people met, how the
 * neighbourhood knows itself). Messages and Habitants are the chat and NPC modules' own apps (phoneHooks).
 */
/** Notifications: the quiet log (src/ui/quiet.ts), newest first; opening it marks them seen. */
export const notifsScreen: Screen = {
  title: 'Notifications',
  mount(page) {
    const list = quietLog.entries, now = Date.now(), unseen = quietLog.unread;
    page.innerHTML = list.length ? `<ul class="ph-log">${list.map((e, i) => `<li class="${i < unseen ? 'new' : ''}${e.kind === 'warn' ? ' warn' : ''}"><span>${esc(e.text)}</span><small>${ago(now - e.at)}</small></li>`).join('')}</ul>`
      : empty('🔔', 'Rien de nouveau. Achats, paies et conseils arrivent ici sans t’arrêter.');
    quietLog.markRead();
  },
};

export const carnetScreen: Screen = {
  title: 'Carnet',
  mount(page, api) { const j = journalView(api.ctx.rel, api.ctx.state); page.innerHTML = `<p class="pk-note">${esc(j.subtitle)}</p><div class="ph-journal">${j.html}</div>`; },
};

