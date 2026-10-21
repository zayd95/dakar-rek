import { isMuted } from '../core/audioSettings';
import { PROFILES, vehicleAudio } from '../transport/vehicleAudio';
import { SAMPLE_NAMES } from '../transport/vehicleSamples';

/**
 * « Tester le son » (phone › Réglages › Son): each button plays one of the vehicles' sounds through the very path the game uses while driving (the same recordings, the same
 * engine, horn and impact voices, the vehicles' bus, its limiter and the sound setting), with nothing driven. Under the buttons, what the page knows about its sound, in plain words:
 * whether the phone let it start, whether the recordings are decoded, whether the silent switch can be got round, and the level actually sent to the speaker. When a sound is not
 * heard, the panel says which of those is the cause, or that the page did send it (then it is the phone's volume, its silent switch or a Bluetooth route).
 */
export type SoundCheck = 'start' | 'idle' | 'accel' | 'horn' | 'tap' | 'impact' | 'bip';
export const SOUND_CHECKS: [SoundCheck, string][] = [['start', 'Démarrage'], ['idle', 'Ralenti'], ['accel', 'Accélération'], ['horn', 'Klaxon'], ['tap', 'Petit choc'], ['impact', 'Gros choc'], ['bip', 'Bip']];
export type TestKit = 'sedan' | 'moto';

/** Why nothing can be played right now, in words (null: it can). */
export function soundBlocked(busy: boolean): string | null {
  if (isMuted()) return 'Le son du jeu est coupé (Réglages › Son) : active-le, puis réessaie.';
  const i = vehicleAudio.info();
  if (!i.gestured) return 'Le téléphone n’autorise le son qu’après un geste : touche l’écran une fois, puis réessaie.';
  if (!busy && i.running) return 'Un moteur tourne déjà : descends du véhicule pour tester.';
  return null;
}

class SoundTest {
  /** The check now playing, if any. */
  busy: SoundCheck | null = null;
  last = '';
  private timer = 0;
  private ownsEngine = false;

  /** Plays one check with the car's or the Jakarta's voices. Returns what happened, in words (also kept in `last`). */
  play(k: SoundCheck, kit: TestKit = 'sedan'): string {
    this.stop();
    const why = soundBlocked(false); if (why) return this.tell(why);
    if (k === 'bip') return this.tell(vehicleAudio.beep() ? 'Bip joué (880 Hz, par le même chemin que le klaxon).' : 'Bip refusé.');
    if (k === 'tap' || k === 'impact') { vehicleAudio.impact(k === 'tap' ? 1.4 : 9); return this.tell(k === 'tap' ? 'Petit choc joué (un accrochage de parking).' : 'Gros choc joué (une vraie collision).'); }
    if (k === 'horn') {
      vehicleAudio.hornOn(kit);
      if (!vehicleAudio.hornHeld) {
        vehicleAudio.hornOff();
        const lost = vehicleAudio.info().samples.failed.includes(kit === 'moto' ? 'horn-moto' : 'horn-car');
        return this.tell(lost ? 'L’enregistrement du klaxon n’a pas pu être chargé (réseau) : recharge la page.' : 'Le klaxon n’est pas encore prêt (enregistrement en cours de décodage) : réessaie dans une seconde.');
      }
      this.busy = 'horn'; this.timer = window.setTimeout(() => this.stop(), 900); return this.tell('Klaxon joué (0,9 s).');
    }
    // the engine: the ignition (Démarrage), then the loops pitched by the revs as when driving; nothing else touches it while the phone is open
    const prof = PROFILES[kit], vmax = kit === 'moto' ? 16 : 22, plan: [number, number, number][] = k === 'start' ? [[3.2, 0, 0]] : k === 'idle' ? [[4, 0, 0]] : [[1.2, 0, 0], [5, 1, 0.9], [1.6, 0.35, 0.9], [2.2, 0, 0]];
    const delay = k === 'start' ? vehicleAudio.start(prof) : 0;
    vehicleAudio.run(prof, delay); this.ownsEngine = true; this.busy = k;
    let t = 0, step = 0, speed = 0, last = performance.now();
    this.timer = window.setInterval(() => {
      const now = performance.now(), dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt;
      if (!vehicleAudio.running) { if (t < 3) vehicleAudio.run(prof, 0); else { this.stop(); this.tell('Les enregistrements du moteur ne sont pas prêts (voir « Enregistrements » ci-dessous).'); } return; }
      while (step < plan.length && t > plan[step][0]) { t -= plan[step][0]; step++; }
      if (step >= plan.length) { this.stop(); return; }
      const [, thr, top] = plan[step], want = vmax * top;
      speed += (want - speed) * Math.min(1, dt * (want > speed ? 0.55 : 0.9));
      vehicleAudio.update(dt, speed, vmax, thr);
    }, 33);
    return this.tell(k === 'start' ? 'Démarrage : le démarreur, le moteur qui prend, puis le ralenti.' : k === 'idle' ? 'Ralenti (4 s).' : 'Accélération : ralenti, montée en régime, croisière, puis le moteur retombe.');
  }

  /** Ends whatever is playing (the phone closing, another button). */
  stop() {
    if (this.timer) { clearInterval(this.timer); clearTimeout(this.timer); this.timer = 0; }
    if (this.busy === 'horn') vehicleAudio.hornOff();
    if (this.ownsEngine) { vehicleAudio.stop(); this.ownsEngine = false; }
    this.busy = null;
  }

  private tell(s: string) { this.last = s; return s; }

  /** The state of the page's sound, line by line, for the panel. */
  status(): { label: string; value: string; ok: boolean | null }[] {
    const i = vehicleAudio.info(), m = vehicleAudio.meter(), n = SAMPLE_NAMES.length;
    const ctx = i.state === 'running' ? ['Actif', true] : i.state === 'none' ? ['Pas encore démarré (touche l’écran)', false] : i.state === 'suspended' || i.state === 'interrupted' ? ['En veille : la prochaine touche le réveille', false] : [i.state, false];
    const rec = i.samples.failed.length ? [`${i.samples.loaded}/${n} prêts · échec : ${i.samples.failed.join(', ')}`, false] : i.samples.loaded >= n ? [`${n}/${n} prêts`, true] : [`${i.samples.loaded}/${n} (décodage après le premier geste)`, false];
    const sess = i.session === 'unsupported' ? ['Non géré par ce navigateur : le bouton silencieux de l’iPhone coupe le jeu', false] : [`Géré (${i.session === 'playback' ? 'lecture, en conduite' : i.session})`, true];
    const lvl = m && m.peakDb > -90 ? [`${m.peakDb} dB crête · ${m.speakerDb} dB au haut-parleur`, true] : ['Rien en ce moment', null];
    return [
      { label: 'Son du jeu', value: i.muted ? 'Coupé' : 'Activé', ok: !i.muted },
      { label: 'Audio du téléphone', value: String(ctx[0]), ok: !!ctx[1] },
      { label: 'Enregistrements', value: String(rec[0]), ok: !!rec[1] },
      { label: 'Mode silencieux', value: String(sess[0]), ok: !!sess[1] },
      { label: 'Envoyé au haut-parleur', value: String(lvl[0]), ok: lvl[1] as boolean | null },
    ];
  }
}

export const soundTest = new SoundTest();

/** The screen's HTML (the phone renders it; `mountSoundTest` wires it and refreshes the state). */
export function soundTestHtml(kit: TestKit): string {
  return `<p class="ph-note">Chaque bouton joue le vrai son du jeu, par le même chemin qu’en conduite. Monte le volume du téléphone.</p>
    <div class="seg" role="group" aria-label="Véhicule"><button type="button" data-kit="sedan" class="${kit === 'sedan' ? 'on' : ''}" aria-pressed="${kit === 'sedan'}">Voiture</button><button type="button" data-kit="moto" class="${kit === 'moto' ? 'on' : ''}" aria-pressed="${kit === 'moto'}">Jakarta</button></div>
    <div class="ph-sound">${SOUND_CHECKS.map(([k, l]) => `<button type="button" class="ph-btn" data-check="${k}">${l}</button>`).join('')}</div>
    <p class="ph-note ph-sound-said" aria-live="polite"></p>
    <div class="ph-rows ph-sound-state"></div>
    <p class="ph-note">Rien entendu ? Si « Envoyé au haut-parleur » bouge, le jeu a bien joué le son : vérifie le volume, le bouton silencieux (iPhone) et le Bluetooth. Si le « Bip » s’entend mais pas le moteur, ce sont les enregistrements.</p>`;
}

export function mountSoundTest(s: HTMLElement, onKit: (k: TestKit) => void, kit: TestKit): () => void {
  const said = s.querySelector<HTMLElement>('.ph-sound-said'), state = s.querySelector<HTMLElement>('.ph-sound-state');
  const draw = () => { if (said && soundTest.last && said.textContent !== soundTest.last) said.textContent = soundTest.last; if (state) state.innerHTML = soundTest.status().map(r => `<div><span>${r.label}</span><em class="${r.ok === null ? '' : r.ok ? 'pos' : 'neg'}">${r.value}</em></div>`).join(''); };
  s.querySelectorAll<HTMLButtonElement>('[data-check]').forEach(b => b.addEventListener('click', () => { soundTest.play(b.dataset.check as SoundCheck, kit); draw(); }));
  s.querySelectorAll<HTMLButtonElement>('[data-kit]').forEach(b => b.addEventListener('click', () => onKit(b.dataset.kit as TestKit)));
  soundTest.last = ''; draw(); const t = window.setInterval(draw, 300);                       // what a check says later (the recordings not ready) shows too
  return () => { window.clearInterval(t); soundTest.stop(); };
}
