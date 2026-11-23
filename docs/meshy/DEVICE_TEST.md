# Device test: the Meshy player bodies on a real phone

Nothing in the repository can measure a phone's GPU. The headless numbers in `docs/meshy/proof/perf-avatar.json` (SwiftShader, CPU throttled 4× and 6×) say how the three bodies compare and how much JavaScript room there is; whether a given phone holds its frame rate has to be read on the phone. This takes about 15 minutes and no account.

## Setup (Android + Chrome, USB)

1. On the computer: `npx vite build && npx vite preview --port 4310 --host 127.0.0.1` (or `npx vite --port 4310`).
2. Phone: USB debugging on, plugged in. Computer: Chrome → `chrome://inspect` → *Port forwarding* → add `4310` → `localhost:4310`. (`localhost` is a test host: the `?avatar=` link works there and nowhere else.)
3. On the phone open `http://localhost:4310/?debug&avatar=v4` — then the same link with `avatar=homme` and `avatar=femme`. Without `?avatar=` a new game shows the real choice screen.
4. For each of the three: in *Réglages* choose the quality the phone would get (Low / Medium / High; note which one the game picks by itself), then in the console of the inspected page paste `docs/meshy/device_frame_probe.js` and, during the 20 s, walk, run, turn, and stop several times in the Pikine street (the heaviest hub at 18:00–21:00: use `__dakar.setHour(19)`).

## What to send back

For each of v4 / homme / femme × the quality used: the `FRAME PROBE` line. Also: the phone model and Android/Chrome version, battery saver on or off, and whether the phone was warm (repeat the first run at the end: a throttled phone shows it).

## Reading the result (agreed before measuring, not after)

* **Pass**: a Meshy body has a median frame time within 10 % of v4 on the same phone and quality, and `over33ms_pct` no more than 3 points above v4.
* **Concern**: more than that on High only → ship with the full body on High, the light file (`body_*_low.glb`) on Medium and Low (this is already how the game loads them: Low uses the light file; see `src/actors/playerBody.ts`).
* **Blocker**: more than that on Low → the light body is still too heavy for that phone: do not ship the choice until a lighter variant exists.

The same probe works on iPhone only through Safari's Web Inspector on a Mac; Safari has no `performance.memory`, so the heap line will be absent.
