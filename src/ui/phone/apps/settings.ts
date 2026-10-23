import type { Screen, PhoneApi } from '../types';
import type { Quality } from '../../phone';
import type { Input } from '../../../core/input';
import { btn, esc, more, note, row, rows, section, seg, toggle } from '../kit';
import { isMuted, setMuted } from '../../../core/audioSettings';
import { canVibrate, hapticsOn, setHaptics } from '../../../transport/haptics';
import { mapBridge } from '../../minimap';
import { theme, type ThemeMode } from '../../theme';
import { glossesShown, setGlossesShown } from '../../../i18n/wolof';
import { radio, VOLUMES } from '../../../transport/radio';
import { hudPrefs } from '../../hudPrefs';
import { devMode } from '../../devMode';
import { phoneHooks } from '../../phoneHooks';
import { mountSoundTest, soundTestHtml, type TestKit } from '../../soundTest';
import { bindSaveCard, saveCardHtml } from '../../saveCard';
import { betaFooter, reportText } from '../../betaInfo';

/**
 * Réglages, in five short groups (Affichage, Graphismes, Son, Caméra, Partie). Each setting is one control; its one-line explanation is the current
 * choice's, not a paragraph per option. Everything is kept on the device (localStorage), never in the save. « Partie » keeps a marked slot for the
 * save card (`<section data-slot="save">`, wired by the save module).
 */
export const QUALITY_LABEL: Record<Quality, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute' };
const SENSITIVITY: [number, string][] = [[0.6, 'Lente'], [1, 'Normale'], [1.5, 'Rapide']];
const SENS_KEY = 'dakarrek.camera.sensitivity';
const store = () => { try { return window.localStorage; } catch { return null; } };
/** The camera sensitivity kept on this device (read when the phone is built). */
export function restoreSensitivity(input: Input) { const s = Number(store()?.getItem(SENS_KEY)); if (SENSITIVITY.some(([v]) => v === s)) input.sensitivity = s; }

const THEME_NOTE: Record<ThemeMode, string> = { auto: 'L’écran s’assombrit avec la nuit de la ville (19 h – 6 h).', day: 'L’écran reste clair, même la nuit.', night: 'L’écran reste sombre, même le jour.' };
const QUALITY_NOTE: Record<Quality, string> = { low: 'La plus fluide sur les petits téléphones.', medium: 'L’équilibre entre fluidité et détails.', high: 'Ombres et détails : pour les téléphones récents.' };

function html(api: PhoneApi): string {
  const q = api.ctx.quality(), sens = api.ctx.input.sensitivity, tm = theme.mode, gloss = glossesShown();
  const vol = VOLUMES.find(v => Math.abs(radio.volume - v.v) < 0.01)?.v ?? -1;
  return section('Affichage', `${seg('theme', [['auto', 'Auto'], ['day', 'Jour'], ['night', 'Nuit']], tm)}${note(THEME_NOTE[tm])}
      ${rows([
        toggle('hudcompact', 'HUD compact', hudPrefs.compact, 'L’essentiel seulement pendant le jeu', ['Activé', 'Désactivé']),
        toggle('minimap', 'Mini-carte', mapBridge.enabled, 'Le petit rond : où tu es, les lieux autour', ['Affichée', 'Masquée']),
        toggle('gloss', 'Traduction du wolof', gloss, gloss ? 'Français, expressions en wolof : « Jërëjëf (merci) »' : 'Français, expressions en wolof : « Jërëjëf » seul', ['Affichée', 'Masquée']),
      ])}`)
    + section('Graphismes', `${seg('q', (['low', 'medium', 'high'] as Quality[]).map(k => [k, QUALITY_LABEL[k]]), q)}${note(QUALITY_NOTE[q])}`)
    + section('Son', `${rows([
        toggle('sound', 'Son du jeu', !isMuted(), '', ['Activé', 'Coupé']),
        ...(canVibrate() ? [toggle('haptics', 'Vibrations', hapticsOn(), 'Chocs et klaxon', ['Activées', 'Coupées'])] : []),
        row({ icon: '🔊', label: 'Tester le son', sub: 'Moteur, klaxon, chocs', act: 'soundtest' }),
      ])}<p class="pk-label">Radio de la voiture</p>${seg('radio', VOLUMES.map(v => [String(v.v), v.label]), String(vol))}`)
    + section('Caméra', `<p class="pk-label">Vitesse quand tu glisses pour tourner</p>${seg('sens', SENSITIVITY.map(([v, l]) => [String(v), l]), String(sens))}`)
    + section('Partie', `<section data-slot="save">${phoneHooks.saveCard ? saveCardHtml() : btn('Sauvegarder maintenant', { act: 'save', icon: '💾' })}</section>
      ${rows([
        ...(phoneHooks.openPresence ? [row({ icon: '🌐', label: 'Jouer en ligne', sub: 'Pseudo, tenue, inviter un ami', act: 'presence' })] : []),
        row({ icon: '💡', label: 'Aide et commandes', app: 'aide' }),
        row({ icon: '📝', label: 'Signaler un problème', sub: 'Copie la version, ton écran et l’endroit pour ton message', act: 'report' }),
      ])}
      <textarea class="ph-code" data-report readonly rows="6" hidden aria-label="Infos pour ton message"></textarea>
      ${btn('Nouvelle partie', { act: 'new', kind: 'quiet', sub: 'Efface la partie de cet appareil' })}
      ${note(betaFooter())}`)
    + more('Avancé', rows([toggle('devmode', 'Mode développeur', devMode.on, 'Outils de test (parcours, version)', ['Activé', 'Désactivé'])]), 'st-adv');
}

export const settingsScreen: Screen = {
  title: 'Réglages',
  mount(page, api) {
    page.innerHTML = html(api);
    bindSaveCard(page, () => api.rerender());
    page.addEventListener('click', e => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('button'); if (!t) return;
      const d = t.dataset;
      if (d.q) { const q = d.q as Quality; if (q !== api.ctx.quality()) { api.ctx.setQuality(q); api.notify('Qualité : ' + QUALITY_LABEL[q]); } api.rerender(); return; }
      if (d.theme) { theme.setMode(d.theme as ThemeMode); api.rerender(); return; }
      if (d.radio) { radio.setVolume(Number(d.radio)); api.rerender(); return; }
      if (d.sens) { api.ctx.input.sensitivity = Number(d.sens); try { store()?.setItem(SENS_KEY, d.sens); } catch { /* session only */ } api.rerender(); return; }
      switch (d.act) {
        case 'hudcompact': hudPrefs.setCompact(!hudPrefs.compact); api.rerender(); break;
        case 'minimap': mapBridge.setEnabled(!mapBridge.enabled); api.rerender(); break;
        case 'sound': setMuted(!isMuted()); api.rerender(); break;
        case 'haptics': setHaptics(!hapticsOn()); api.rerender(); break;
        case 'gloss': setGlossesShown(!glossesShown()); api.rerender(); break;
        case 'soundtest': api.go('sontest'); break;
        case 'save': { const ok = api.ctx.save(); api.notify(ok ? 'Partie sauvegardée' : 'Sauvegarde impossible sur ce navigateur', ok ? 'ok' : 'warn'); break; }
        case 'new': api.go('nouvelle'); break;
        case 'devmode': devMode.set(!devMode.on); api.rerender(); break;
        case 'presence': if (phoneHooks.openPresence) api.launch(phoneHooks.openPresence); break;
        case 'report': {                          // the lines a tester pastes at the top of a report (src/ui/betaInfo.ts): shown, and copied where allowed
          const d0 = api.ctx.state.data, text = reportText({ hub: api.ctx.hub(), x: d0.x, z: d0.z, quality: api.ctx.quality(), playedMin: Math.floor(d0.playedMs / 60000) });
          const box = page.querySelector<HTMLTextAreaElement>('[data-report]'); if (box) { box.value = text; box.hidden = false; box.onfocus = () => box.select(); }
          try { navigator.clipboard.writeText(text).then(() => api.notify('Infos copiées : colle-les dans ton message', 'ok'), () => api.notify('Sélectionne les infos affichées et copie-les')); } catch { api.notify('Sélectionne les infos affichées et copie-les'); }
          break;
        }
      }
    });
  },
};

/** « Nouvelle partie »: one clear question, « Annuler » first. */
export const newGameScreen: Screen = {
  title: 'Nouvelle partie',
  mount(page, api) {
    page.innerHTML = `<div class="pk-confirm"><i aria-hidden="true">⚠️</i><p>Effacer la partie enregistrée sur cet appareil ? Argent, relations et progression seront perdus. Cette action est définitive.</p>
      ${btn('Annuler', { act: 'cancel', kind: 'secondary' })}${btn('Effacer et recommencer', { act: 'wipe', kind: 'danger' })}</div>`;
    page.addEventListener('click', e => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
      if (a === 'cancel') api.back(); else if (a === 'wipe') api.ctx.newGame();
    });
  },
};

/** « Tester le son » (src/ui/soundTest.ts): its own screen, the vehicle kept between visits. */
let testKit: TestKit = 'sedan';
export const soundTestScreen: Screen = {
  title: 'Test du son',
  mount(page, api) {
    page.innerHTML = soundTestHtml(testKit);
    return mountSoundTest(page, k => { testKit = k; api.rerender(); }, testKit);
  },
};
export { esc };
