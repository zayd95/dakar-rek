import type { PresenceClient, Profile } from './client';
import { nickname, lookIndex } from './protocol';
import { SHIRT_COLORS } from './avatars';
import type { Hud } from '../ui/hud';
import type { HubId } from '../core/types';
import './style.css';

export class PresenceUi {
  readonly button = document.createElement('button');
  constructor(private presence: PresenceClient, private hud: Hud, private storage: Storage | null, private hub: () => HubId | null, private onProfile: (profile: Profile) => void, private onOpen: () => void) {
    this.button.id = 'presenceBtn'; this.button.className = 'card'; this.button.type = 'button'; this.button.setAttribute('aria-label', 'Multijoueur et profil');
    this.button.addEventListener('pointerdown', e => e.stopPropagation());
    this.button.addEventListener('click', () => this.open());
    document.getElementById('ui')!.appendChild(this.button); this.update();
  }
  update() {
    const p = this.presence;
    const text = p.status === 'solo' ? 'Mode solo' : p.status === 'offline' ? 'Hors connexion' : p.status === 'reconnecting' ? 'Reconnexion…' : 'Connexion…';
    // « 👥 ● 466 en ligne »: the people icon, a green dot, the count and its word (the word goes on a very narrow phone)
    this.button.innerHTML = '<svg class="pr-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.4 2.7-6 6-6s6 2.6 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.2c2.6.3 4.5 2.4 4.5 5.3"/></svg><i class="pr-dot"></i>'
      + (p.status === 'online' ? `<span><b>${p.count}</b><span class="pr-lbl"> en ligne</span></span>` : `<span>${text}</span>`);
    this.button.setAttribute('aria-label', p.status === 'online' ? `En ligne · ${p.count} ${p.count > 1 ? 'joueurs' : 'joueur'}. Multijoueur et profil` : `${text}. Multijoueur et profil`);
    this.button.dataset.state = p.status;
    this.button.title = p.room ? `Groupe ${p.room} · Profil et invitation` : 'Profil et connexion';
  }
  private open() {
    this.onOpen();
    const p = this.presence; let look = p.profile.look;
    const editor = `<label class="presence-label">Ton pseudo<input id="presenceName" maxlength="24" autocomplete="nickname" enterkeyhint="done"></label>
      <p>Ta tenue</p><div class="swatches" id="presenceLooks"></div><p id="presenceFeedback" role="status"></p>`;
    this.hud.openMenu('Ville partagée', p.status === 'online' ? `Groupe ${p.room} · ${p.count} joueur(s) dans ce quartier` : 'Tu peux continuer à jouer pendant la connexion.', [
      { label: 'Enregistrer mon profil', onPick: () => {
        const profile = { name: nickname((document.getElementById('presenceName') as HTMLInputElement).value), look: lookIndex(look) };
        try { this.storage?.setItem('dakarrek.presence.profile', JSON.stringify(profile)); } catch { /* session-only profile */ }
        p.setProfile(profile); this.onProfile(profile); this.hud.closeModal();
      } },
      { label: 'Copier le lien pour un ami', detail: 'Le même quartier et le même groupe', disabled: p.status !== 'online', onPick: async () => {
        const hub = this.hub(); if (!hub || !p.room) return;
        const url = new URL(location.href); url.search = ''; url.hash = ''; url.searchParams.set('hub', hub); url.searchParams.set('room', String(p.room));
        try { await navigator.clipboard.writeText(url.href); this.hud.toast('Lien copié : invite ton ami à te rejoindre.'); }
        catch { const feedback = document.getElementById('presenceFeedback'); if (feedback) { feedback.textContent = url.href; feedback.style.userSelect = 'text'; } }
      } },
    ], editor, panel => {
      (panel.querySelector('#presenceName') as HTMLInputElement).value = p.profile.name;
      const colors = panel.querySelector('#presenceLooks')!;
      SHIRT_COLORS.forEach((color, index) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = look === index ? 'on' : ''; b.style.backgroundColor = `#${color.toString(16).padStart(6, '0')}`;
        b.setAttribute('aria-label', `Tenue ${index + 1}`); b.setAttribute('aria-pressed', String(look === index));
        b.addEventListener('click', () => { look = index; for (const child of colors.children) { child.classList.toggle('on', child === b); child.setAttribute('aria-pressed', String(child === b)); } }); colors.appendChild(b);
      });
    });
  }
}
