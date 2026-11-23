# Performance: before and after the unified beta

**Read this first.** These numbers come from headless Chromium with SwiftShader, a CPU software renderer, on a loaded 4-core container.
- They compare two builds of the game on the same machine and the same scene.
- They are **not** phone measurements: no frame rate here says anything about an iPhone or an Android phone.
- Draw calls and triangles do not depend on the renderer: those are what transfers to a phone.

**The builds:**
- **Before:** `6c583af`, the beta's starting point (PR #64's head with PR #62 merged once).
- **After:** the integration branch, with every lane merged (phone, HUD, cockpit, VTC, world, activities, mosque, audio, saves).
- Both are served the same way, with quality « Basse » (low) unless noted.

## Static scenes (`scripts/perf.mjs`, low quality, two runs each)

Desktop is 1280 × 720 (landscape); phone is 390 × 844 (portrait, touch).

| Scene | fps before | fps after | draw calls before → after | triangles before → after |
|---|---|---|---|---|
| desktop Pikine 13 h | 1.9 / 1.5 | 1.8 / 2.3 | 159 → 157 | 151 593 → 150 523 |
| desktop Pikine 21 h | 1.2 / 1.2 | 1.6 / 2.3 | 194 → 194 | 161 701 → 163 027 |
| desktop Plateau 13 h | 2.6 / 2.5 | 2.3 / 2.2 | 129 → 128 | 97 850 → 97 430 |
| phone Pikine 13 h | 3.5 / 4.0 | 4.2 / 3.9 | 138 → **119** | 150 079 → 139 891 |
| phone Pikine 21 h | 2.9 / 3.2 | 2.1 / 3.4 | 140 → 143 | 145 437 → 146 467 |
| phone Plateau 13 h | 4.2 / 3.6 | 3.4 / 3.5 | 95 → 96 | 83 270 → 84 544 |

**Loading:**
- Desktop: 4.4–5.0 s before, 4.8–4.9 s after.
- Phone: 3.5 s before, 3.9–4.3 s after.
- Downloaded: 7 724 kB before, 7 885 kB after (+161 kB, +2 %).
- What was added: the phone app modules, the cockpit and cabin code, the save card, the build id and the job markers.

## Busy street with 12 vehicles (`scripts/perf-vehicles.mjs`)

A fixed rush hour of 4 car rapides and 8 cars, in the same place in both builds. The VTC lane added see-through glass and cabin fitting; the cockpit lane added a car interior.

| Scene | draw calls before → after | vehicle draw calls | triangles before → after |
|---|---|---|---|
| desktop high, Plateau 10 h | 158 → 158 | 18 → 18 | 178 981 → 173 942 |
| desktop high, Plateau 21 h | 157 → 170 | 23 → 32 | 171 174 → 174 268 |
| desktop high, Pikine 10 h | 140 → 129 | 18 → 18 | 218 985 → 209 131 |
| desktop high, Pikine 21 h | 188 → 170 | 26 → 14 | 318 468 → 303 375 |
| phone medium, Pikine 10 h | 83 → 76 | 23 → 17 | 166 122 → 160 851 |
| phone medium, Pikine 21 h | 141 → 129 | 20 → 18 | 241 224 → 239 071 |
| phone low, Plateau 21 h | 91 → 92 | 25 → 27 | 87 259 → 85 635 |
| phone low, Pikine 21 h | 105 → 104 | 17 → 17 | 168 354 → 167 275 |

The full rows are in `docs/beta/proof/perf/`.

**Reading:**
- Draw calls and triangles are the same or lower in every scene but one.
- The exception is desktop high Plateau at night: +13 draw calls, from the cars' night lights at that distance.
- The frame rates move within the noise of a software renderer on a shared machine (the two runs of one build differ by as much as the builds do).

## What the beta does to stay light
- **The phone:**
  - It renders one screen at a time; a small update re-renders only that screen, with its scroll kept.
  - Each app's listeners are cleaned up when it unmounts (`src/ui/phone.ts`).
  - The MapLibre « Ville » map is built only when its tab opens, and `map.remove()` releases its WebGL context, workers and tiles when it closes (`src/ui/geoMap.ts`).
- **Audio:**
  - The in-car radio is one stream, stopped on leaving the car (`radio.leave()` in `getOff`).
  - Plaza and La Vague music play only near their venue.
  - A stream that fails gets at most one plain-element fallback and one reconnect, then the station says it is unavailable; no synthetic noise is played in its place (`src/transport/radio.ts`).
- **Roadside life:**
  - The flower sellers are merged into their road chunk's meshes, so they add no draw call of their own (`src/road/chunks.ts`).
  - They stream with the road; on Low they have fewer pots, no customer and no flower heads.
  - VTC passengers are one body per ride, removed once they have walked off.
- **Saves:**
  - Written on the existing autosave and leave events.
  - The second extras backup is a few hundred bytes.
- **Quality:**
  - The low preset and the staged hub streaming are unchanged.
  - The low preset still loads the light avatar files (`body_*_low.glb`).

Not measured here: real-device frame rate, battery and thermal throttling. These need the external beta on phones (docs/beta/BETA.md).
