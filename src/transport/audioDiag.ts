import { vehicleAudio } from './vehicleAudio';
import { ridePad } from './ridePad';

/**
 * The sound diagnostics for a real phone (`?audiodebug`): a small panel that says, in numbers, what the page's sound is doing: whether the context runs (or sleeps, or was « interrupted »), the audio
 * session (is the silent switch muting us?), whether any gesture reached it, whether a thumb's touch reached the Klaxon button, and the level of what the vehicles' bus plays right now. « Bip » plays
 * a test tone through the same path: if the bip is heard and the horn is not, the problem is the horn; if neither, it is the phone's audio path (the silent switch, the volume, the context).
 * Nothing in it is drawn unless the address asks for it.
 */
export function mountAudioDiag(parent: HTMLElement = document.body) {
  if (typeof document === 'undefined' || !new URLSearchParams(location.search).has('audiodebug') || document.getElementById('audiodiag')) return;
  const el = document.createElement('div'); el.id = 'audiodiag';
  el.style.cssText = 'position:fixed;top:calc(8px + env(safe-area-inset-top,0px));left:8px;z-index:60;max-width:calc(100vw - 16px);padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.72);color:#aef;font:11px/1.35 ui-monospace,monospace;white-space:pre;pointer-events:none';
  const txt = document.createElement('div'); el.appendChild(txt);
  const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Bip';
  b.style.cssText = 'pointer-events:auto;margin-top:4px;padding:4px 12px;border-radius:999px;border:0;background:#f59e0b;color:#111;font:700 12px system-ui';
  b.addEventListener('click', () => { const ok = vehicleAudio.beep(); txt.dataset.bip = ok ? 'started' : 'refused (muted, or no gesture yet)'; });
  el.appendChild(b); parent.appendChild(el);
  const draw = () => {
    const i = vehicleAudio.info(), m = vehicleAudio.meter(), t = ridePad.touches, vib = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    txt.textContent = [
      `context ${i.state} · session ${i.session} · gesture ${i.gestured ? 'yes' : 'NO'} · muted ${i.muted ? 'YES' : 'no'}`,
      `resumes ${i.nudges} (last: ${i.nudgedBy || '-'}) · engine ${i.running ? 'on' : 'off'} · horn ${i.horn ? 'ON' : 'off'}`,
      `klaxon touches: down ${t.hornDown} up ${t.hornUp} cancel ${t.hornCancel}`,
      `level: peak ${m?.peakDb ?? '-'} dB · rms ${m?.rmsDb ?? '-'} dB · speaker band ${m?.speakerDb ?? '-'} dB · >800 Hz ${m ? Math.round(m.high * 100) + ' %' : '-'}`,
      `vibration API: ${vib ? 'yes' : 'no'} · bip: ${txt.dataset.bip ?? '-'}`,
    ].join('\n');
  };
  draw(); window.setInterval(draw, 250);
}
