import './avatarPick.css';
import type { Avatar } from '../core/types';
import { previewUrl } from '../actors/playerBody';

const CARDS: { id: Avatar; label: string; line: string }[] = [
  { id: 'homme', label: 'Homme', line: 'Tee bleu, jean et baskets' },
  { id: 'femme', label: 'Femme', line: 'Blouson kaki, haut jaune et jean' },
];

/**
 * New Game: the player chooses their body once; the choice is kept for the whole save (SaveData.avatar). A layer of its
 * own over the page, with no close button, no tap-outside and no Escape: the game starts when one card is picked.
 */
export function pickAvatar(parent: HTMLElement = document.body): Promise<Avatar> {
  return new Promise(resolve => {
    const root = document.createElement('section');
    root.id = 'avatarPick'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'apTitle');
    root.innerHTML = `<h1>Dakar Rek</h1><h2 id="apTitle">Qui es-tu ?</h2>
      <p>Choisis ton personnage. Ce choix est définitif pour cette partie : il ne change qu’avec une nouvelle partie.</p>
      <div class="ap-cards">${CARDS.map(c => `<button type="button" class="ap-card" data-id="${c.id}" aria-label="${c.label} : ${c.line}"><img src="${previewUrl(c.id)}" alt="" width="240" height="360" decoding="async"><b>${c.label}</b><small>${c.line}</small></button>`).join('')}</div>
      <p class="ap-note">Pour l’instant, les autres joueurs en ligne te voient avec l’apparence standard.</p>`;
    root.querySelectorAll<HTMLButtonElement>('.ap-card').forEach(b => b.addEventListener('click', () => {
      root.remove(); resolve(b.dataset.id as Avatar);
    }, { once: true }));
    parent.appendChild(root);
    root.querySelector<HTMLButtonElement>('.ap-card')?.focus({ preventScroll: true });
  });
}
