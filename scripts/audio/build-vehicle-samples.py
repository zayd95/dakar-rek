#!/usr/bin/env python3
"""
Builds the vehicle sample set (public/assets/audio/vehicles/*.mp3 + manifest.json) from the CC0 sources documented in docs/audio/VEHICLE_SAMPLES.md.
Needs ffmpeg and numpy. Usage: build-vehicle-samples.py KENNEY_RACING_DIR PMNDRS_RACING_DIR OGA_DIR [OUT_DIR]
  KENNEY_RACING_DIR  a checkout of https://github.com/KenneyNL/starter-kit-racing   (audio/*.ogg, CC0)
  PMNDRS_RACING_DIR  a checkout of https://github.com/pmndrs/racing-game            (public/sounds/*.mp3, "CC0 assets only")
  OGA_DIR            the OpenGameArt download of "Car Sound Effects Pack (Low Quality)" unzipped in a folder named car-sound-effects-pack-low-quality (see docs/audio/VEHICLE_SAMPLES.md)
Every file is mono, peak-normalised to -3 dBFS, loops are cross-faded so that they close without a click, and everything is encoded small (MP3 decodes everywhere, iPhone Safari included).
"""
import json, os, subprocess, sys, tempfile, wave, hashlib
import numpy as np

K, P, O = sys.argv[1], sys.argv[2], sys.argv[3]
OUT = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'audio', 'vehicles')
os.makedirs(OUT, exist_ok=True)
TMP = tempfile.mkdtemp()
SR = 32000

def decode(path, sr=SR, af=None, a=None, b=None):
    wav = os.path.join(TMP, os.path.basename(path) + f'.{a}.{b}.wav')
    seg = (['-ss', str(a)] if a is not None else []) + (['-to', str(b)] if b is not None else [])
    cmd = ['ffmpeg', '-v', 'error', '-y'] + seg + ['-i', path, '-ac', '1', '-ar', str(sr)] + (['-af', af] if af else []) + [wav]
    subprocess.run(cmd, check=True)
    with wave.open(wav) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768

def loop(x, sr, fade=0.15):
    """Equal-power cross-fade of the tail into the head: the result loops with no seam."""
    f = int(sr * fade); head = x[:f]; tail = x[-f:]; t = np.linspace(0, np.pi / 2, f)
    y = x[:-f].copy(); y[:f] = head * np.sin(t) + tail * np.cos(t)
    return y

def norm(x, peak_db=-3.0):
    return x * (10 ** (peak_db / 20) / max(1e-9, np.abs(x).max()))

def fade_out(x, sr, ms):
    n = int(sr * ms / 1000); x = x.copy(); x[-n:] *= np.linspace(1, 0, n) ** 2; return x

manifest = {}
def write(name, x, sr=SR, kbps=56, loop_info=None, source=''):
    wav = os.path.join(TMP, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    out = os.path.join(OUT, name + '.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', f'{kbps}k', '-ac', '1', out], check=True)
    manifest[name] = {'seconds': round(len(x) / sr, 3), 'bytes': os.path.getsize(out), 'loop': bool(loop_info), 'source': source, 'sha256': hashlib.sha256(open(out, 'rb').read()).hexdigest()[:16]}
    print(f'{name:14s} {len(x)/sr:5.2f}s {os.path.getsize(out)/1024:5.1f} KB  {source}')

# ---- engines: the loops are played faster or slower with the revs (src/transport/vehicleAudio.ts)
a = decode(f'{K}/audio/engine.ogg'); write('car-idle', norm(loop(a, SR, 0.2)), kbps=48, loop_info=True, source='Kenney racing/audio/engine.ogg')
a = decode(f'{P}/public/sounds/engine.mp3'); write('car-rev', norm(loop(a, SR, 0.15)), kbps=48, loop_info=True, source='pmndrs racing-game/public/sounds/engine.mp3')
a = decode(f'{K}/audio/engine-motorcycle.ogg'); write('moto-idle', norm(loop(a, SR, 0.2)), kbps=48, loop_info=True, source='Kenney racing/audio/engine-motorcycle.ogg')

# ---- ignition (the motorbike plays it pitched up)
a = decode(f'{O}/car-sound-effects-pack-low-quality/Car_Engine_Start_Up.ogg'); write('start-car', norm(fade_out(a, SR, 150)), kbps=56, source='OGA car-sound-effects-pack-low-quality / Car_Engine_Start_Up.ogg')

# ---- horns: a car\'s (steady, looped for as long as the button is held) and a motorbike\'s (pitched up, the lower reed removed: a smaller, single, reedier note)
h = decode(f'{P}/public/sounds/honk.mp3', 44100)
h3 = h[: 44100 * 3]; write('horn-car', norm(loop(h3, 44100, 0.1)), sr=44100, kbps=64, loop_info=True, source='pmndrs racing-game/public/sounds/honk.mp3')
hm = decode(f'{P}/public/sounds/honk.mp3', 44100, 'asetrate=44100*1.5,aresample=44100,highpass=f=480,bandreject=f=590:width_type=q:w=5,volume=1.4')[: 44100 * 3]
write('horn-moto', norm(loop(hm, 44100, 0.1)), sr=44100, kbps=64, loop_info=True, source='pmndrs racing-game/public/sounds/honk.mp3 (pitched x1.5, lower reed removed)')

# ---- collisions: a metallic crash (cut into hits and a scrape texture at run time), a body thud, a tyre squeal
c = decode(f'{P}/public/sounds/crash.mp3', 44100); write('crash', norm(fade_out(c, 44100, 80)), sr=44100, kbps=96, source='pmndrs racing-game/public/sounds/crash.mp3')
t = decode(f'{K}/audio/impact.ogg', 44100); write('thud', norm(fade_out(t, 44100, 30)), sr=44100, kbps=64, source='Kenney racing/audio/impact.ogg')
s_ = decode(f'{K}/audio/skid.ogg', 44100); write('squeal', norm(loop(s_, 44100, 0.12)), sr=44100, kbps=64, loop_info=True, source='Kenney racing/audio/skid.ogg (Landeplage, CC0)')

json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print('total KB', round(sum(m['bytes'] for m in manifest.values()) / 1024, 1))
