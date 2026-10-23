# Arena soundscape and car radio (audio lane, 2026-10-23)

Two complaints from the owner: the car radio's browser-made stations « sound like noise », and the wrestling arena's ambience is generic.
Both are replaced. The approved vehicle sounds and their mix are unchanged.

## 1. The car radio: real Senegalese stations

`src/transport/radio.ts`. The 📻 button by « Vue » goes off → **RFM 94.0** → **Sud FM 98.5** → **Rewmi FM 97.5** → off; the toast and the dashboard screen name the station. The three synthesised stations are gone; there is no synthetic fallback anywhere.

| Station | Zeno.FM page | Stream | Checked from the sandbox (2026-10-23) |
|---|---|---|---|
| RFM 94.0 (Radio Futurs Médias) | `zeno.fm/radio/radiofuturmedia-rfm/` | `stream.zeno.fm/2h77qvxhq9duv` | page titled « Radio Futurs Medias - RFM 94.0 Senegal », country Senegal, links to the station's Facebook page; stream 302 → `stream-2xx.surfernetwork.com/…?zt=<token>` with `access-control-allow-origin: *` |
| Sud FM 98.5 | `zeno.fm/radio/sudfmsenegal/` | `stream.zeno.fm/y763bdfn3reuv` | page « Sud FM 98.5 Senegal live », links to `sudfmsenradio.com` and the station's Facebook; 302 as above |
| Zik FM 89.7 Dakar | `zeno.fm/radio/zikfmdakar/` | `stream.zeno.fm/suhh98yy1xmtv` | page « ZIK FM DAKAR 89.7 FM », Senegal; 302 as above. A second page (`zikfmdakar897`) also exists; neither carries the station's own links, so whether this relay is the broadcaster's own could not be confirmed |
| Rewmi FM 97.5 Dakar | `zeno.fm/radio/radiorewmi/` | `stream.zeno.fm/smw7kg16t8quv` | page « Radio Rewmi FM 97.5 Dakar », the station's address in Dakar, links to `rewmi.com` and its official Facebook/YouTube; 302 as above |

All four 302s carry `access-control-allow-origin: *` when asked with an `Origin`; an unknown mount answers 404 on `stream.zeno.fm`, so the 302s show the mounts exist. The audio bytes themselves come from `surfernetwork.com`, which this sandbox cannot reach: **the real stations could not be listened to from here.** `rfm.sn` only redirects to igfm.sn (not reachable).

**How it plays.** One `<audio>` element per page, `crossOrigin = 'anonymous'`, wired once into Web Audio (`MediaElementSource` → gain → the vehicles' bus): the game's mute, the first-tap rule, the volume (Réglages › Son: Bas / Moyen / Fort) and the ducking (horn, knock, phone, the job card, a little under the engine when accelerating) all apply — on an iPhone too, where `element.volume` is read-only. If that load fails with an error (a stream without CORS headers), or the graph receives only exact zeros for 5 s (a silenced cross-origin stream), the station plays on a **plain element** instead with `volume` set (+6 dB, the bus limiter's make-up gain, so it sounds the same). *iPhone limitation:* a plain element cannot have its volume set there; it plays at the phone's volume and is only muted under the horn and the phone. The station is remembered as « plain » for the session.

**Failure.** An error on both ways, no start within 12 s, or a stall that a reconnection does not cure (9 s, one reconnection; a stream that plays again gets a new chance) → one toast « 📻 RFM indisponible », silence; the next tap moves on. A `play()` refused by the browser (no gesture yet) waits for the next tap. A private Claude preview blocks external media (CSP): that is an immediate error, handled the same way.

**No hidden bandwidth.** The element is emptied (`pause`, `removeAttribute('src')`, `load()` — the download is aborted) when the radio is off, out of the car, with the game's sound off, when the page is hidden, and while the audio context is suspended/interrupted (a phone call on iOS); it reconnects to the live broadcast when sound returns.

**For the phone's settings (another lane's UI):** `VOLUMES`, `radio.volume`, `radio.setVolume(v)` as before, plus `radioSettings()` (stations, the one on, its state, the volumes).

**Level.** `RADIO_LEVEL = 0.1`: measured through the bus with a stand-in mastered at −14 LUFS, about −30 dB rms on « Moyen » (−27 « Fort », −34 « Bas »), some 10 dB over the cabin's idle engine (−39 dB in the same film), under the horn (−11 dB) and the arena's drums.

## 2. The arena: an authored làmb soundscape

`scripts/audio/render-arena.mjs` renders everything offline (Node, no dependency, deterministic; ffmpeg encodes) into `public/assets/audio/arena/` — **1.9 MB** of MP3 plus `manifest.json`. No recordings, nothing downloaded.

* **Drums** (`drums-*.mp3`, 44.1 kHz mono 96 kbit/s, 8 bars + 1.2 s tail each): a sabar ensemble — lead (*nder*), two accompaniment drums (*mbëng-mbëng*), a bass drum and a *tama* — one loop per moment: `street` (gathering, 112 bpm), `entrance` (120), `bakk` (132, groove bars alternating with unison figures), `bout` (116, sparse, the tama « asking »), `fete` (138). Strokes are modal membrane synthesis (circular-membrane mode ratios, a pitch that falls from the strike as the skin relaxes, excitation by contact time so a hand rounds the tone and a stick reaches the upper modes, the slap's noise, the stick's click, the tall shell's air resonance, light saturation on hard strokes); the tama's notes are bent (rising, falling, rolls). Swing, per-drummer lean, timing and velocity humanisation; the crowd's claps (each clapper their own hands and timing) and group « ho ! / hé ! » shouts are in time with the drums. A small FDN reverberation (street / arena). These are patterns *in the style* of sabar, not transcriptions of named rhythms.
* **Crowd beds** (`bed-*.mp3`, 22.05 kHz mono 48 kbit/s, 20–24 s + 2 s crossfade tail): `street`, `stands`, `hype`, `tension`, `roar` — 30 to 54 voices each (a band-limited glottal pulse through three moving formants; syllables, pauses, falling intonation, laughs, consonants on their own filters), each at a distance (level, air absorption, reverberation), with cheering groups, whistles, ululations and claps where they belong. Vowels only: no words of any language. Spectrum checked to follow speech (500 Hz band highest, 2 kHz −14…−17 dB, 4 kHz −27…−37 dB): a crowd, not a hiss.
* **One-shots** (`shot-*.mp3`): two cheers, a big roar, a gasp, applause, the referee's whistle, ululations.

`src/arena/soundscape.ts` plays them on the existing graph (under the master gain and the first-tap rule):
* **one drum loop and one crowd bed at a time**; copies are started exactly one period apart, the file's tail playing under the next copy (no gap at the seam whatever the MP3 decoder adds); a change of rhythm waits for the bar line (the drummers change on the bar); beds crossfade over 1.6 s;
* by phase: gathering groove + street crowd outside; inside the walls the stands by show phase (`stands` filling/preliminaries, `hype` entrance and bàkk, `tension` bout, `roar` result/fête), as loud as the stands are full and roused; the bàkk, the player's preparations and walk to the ring, his own fête follow the existing cues (`drumRhythm`, `arenaFighter`, `partyDrums`);
* spatial: the drums by distance (existing rules; inside the walls during a show they carry over the arena), panned to the drummers' side, muffled through the wall; the stands heard muffled over the wall from the street;
* moments: the arena's existing `crowdCheer` calls now play the one-shots chosen by the moment that called them (a roar and the referee's whistle at a fall, ululations at an entrance and a result, a short cheer at a clinch);
* **no leaks**: nothing indoors, muted, beyond ~45 m of the wall or in another hub (loops released after 2.5 s of silence); the cheers, the announcer's chime and a watched bout's strikes — which used to be heard anywhere in the hub — now follow how much of the stands the player hears; a bout's or a cinematic scene's own drums (`Percussion`) use the same loops and never play over the evening's drummers.

## Levels (headless Chromium, the page's own output after the master gain; not a phone)

Arena, same moments on the base commit `6c583af` and on this branch (`scripts/capture-arena-av.mjs`, 13 s each):

| Phase | Before: peak / rms (dBFS) | After: peak / rms (dBFS) | After: drums · crowd |
|---|---|---|---|
| Gathering (street, 8 m from the drummers) | −3.3 / −19.0 (an earlier take clipped at +0.5) | −5.7 / −21.7 | street groove · street crowd |
| Entrance (inside the walls) | −7.1 / −28.6 | −7.2 / −22.4 | entrance · roused stands |
| Ceremony (bàkk) | −8.9 / −24.4 | −7.1 / −22.0 | bàkk · roused stands, cheer + ululation |
| Bout | −2.2 / −20.2 | −8.5 / −24.8 | bout · held murmur |
| Celebration (result, fête) | −2.3 / −19.7 | −6.4 / −20.3 | fête · roar, roar/whistle/ululation shots |

Radio (`scripts/capture-radio-av.mjs`, film `radio-standin-streams.mp4`): engine idle, radio off −39.2 rms · RFM stand-in through the graph, « Moyen » −29.8 rms (peak −15.4) · horn held over it −11.1 rms (radio ducked to 0.35×) · RFM after the horn −29.9 · Sud FM refused: −39.2 (silence, « Sud FM indisponible ») · Rewmi 4 s then stalled → −30.7 then −39.1 (« Rewmi FM indisponible »). Real URLs (`radio-real-stations-unreachable.mp4`): never above −38 dB rms after the radio is turned on — the engine alone, four « indisponible » toasts within a second each.

## Films (MP4, H.264 + AAC, play anywhere) — `docs/audio/films/`

* `arena-gathering.mp4`, `arena-entrance.mp4`, `arena-ceremony.mp4`, `arena-bout.mp4`, `arena-celebration.mp4` — the five phases on this branch.
* `arena-before-after.mp4` — each phase, 6 s on the base commit then 6 s on this branch.
* `radio-standin-streams.mp4` — the radio with **local stand-in streams** (not the real stations): RFM via CORS/Web Audio, the horn over it, Sud FM refused, Zik FM without CORS on the plain element (it plays outside Web Audio, so the recording does not hold it; its state is in the log), Rewmi FM stalling → unavailable, off.
* `radio-real-stations-unreachable.mp4` — the real station URLs through the sandbox's proxy: each 302 is followed to the broadcaster's host, refused here, and the radio says so and stays silent.

The game draws well under a frame a second in this shared headless renderer: the pictures are near-still, the sound is real-time.

## Reproduce

```
node scripts/audio/render-arena.mjs                      # the arena files (≈1 min), --preview <dir> for phase mixes + spectrograms
npx vite build --outDir <dist>; node <static server> <dist> 4671
node scripts/capture-arena-av.mjs http://127.0.0.1:4671/ <out> after
node scripts/capture-radio-av.mjs http://127.0.0.1:4671/ <out> <stand-in.mp3> standin,real
```

## Limits

* The real streams' audio could not be fetched from the sandbox (the broadcaster's host is blocked): loudness, codec and whether that host sends CORS headers are unverified. If it does not, the radio falls back to the plain element (and on an iPhone loses its volume control, keeping on/off and the mute under the horn/phone).
* Zik FM's relay page has no link to the broadcaster: at integration it was left out of the station list (only streams shown to be the station's own are played). The capture above was made before that, with four stations.
* The arena audio is synthesised; it was checked by measurement (spectra, levels, onset structure, the loops' seams) and recorded from the game, not judged by ear on a phone.
* No offline « Cassette » station and no Corniche plaza ambience were added.
