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
    const place = document.getElementById('place');
    if (place) {
      const position = () => { this.button.style.top = `${Math.max(66, place.getBoundingClientRect().bottom + 8)}px`; };
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(position).observe(place);
      addEventListener('resize', position); position();
    }
  }
  update() {
    const p = this.presence;
    const label = p.status === 'online' ? `En ligne · ${p.count} ${p.count > 1 ? 'joueurs' : 'joueur'}`
      : p.status === 'solo' ? 'Mode solo' : p.status === 'offline' ? 'Hors connexion' : p.status === 'reconnecting' ? 'Reconnexion…' : 'Connexion…';
    this.button.textContent = label; this.button.dataset.state = p.status;
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
