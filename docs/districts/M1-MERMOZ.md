# M1 · Mermoz / Sacré-Cœur: « After Work »

The first Living District: a fifth playable hub (`mermoz`) reached from the Corniche by road, with one authored job, one recurring person and a reason to come back.
How it fits with Living Dakar 2.0 is in [`CONTRACT.md`](CONTRACT.md).

## The geography (condensed)

The real route runs Corniche Ouest → Fann → Point E → the VDN → the Sacré-Cœur interchange → Sacré-Cœur / Ancienne Piste, with the BRT → Mermoz. The game keeps that order and the character of each stretch, shortened about 3×. The road is `corniche-mermoz` in `src/road/routes.ts`, about 1.4 km.

| Stretch (profile) | What the player sees |
|---|---|
| Corniche → Fann (`coast`, `artery`) | The sea road climbing inland, then the junction at Fann · Point E. |
| The VDN (`vdn`) | A divided artery: one lane each way with a wide shoulder, a planted median with kerbs, bougainvillea and double-arm lamps. Billboards, palms, 6–10-storey blocks set back, the odd crane. No centre dashes, and no overtaking across the median. |
| Échangeur de Sacré-Cœur | One side arm off the VDN, then the commercial `sacrecoeur` profile: 3–6 storeys close to the road, shop boards and awnings, stalls and lamps. |
| Rond-point de Sacré-Cœur (`src/road/roundabout.ts`, `src/road/brt.ts`) | The BRT corridor crosses the road at right angles **through a roundabout**, as on the owner's reference photo, so it is never a lane down the VDN. The red busway runs straight across the ring and splits the planted island in two. Cars go round the island anticlockwise (the road's lanes swing out around it) and give way at the splitter islands, which have zebras, chevrons and brick pavements. Beyond the ring the busway runs between separator kerbs to its own island station (canopy, gates, a ticket machine, people waiting) and underpass portals at both ends. Signals stop the ring's traffic either side of the busway when a bus asks for its phase. The busway is not ground, so neither the player nor GPS can drive down it. |
| Autopont de Mermoz (`src/road/autopont.ts`) | Just before Mermoz a flyover crosses above the road, modelled on the owner's reference: ochre leaning blade piers on a cap beam, a grey fascia with V panels, a railing and lamps on the deck, and a green name board. Its deck is 6.4 m up with 4.6 m clear under the board. One or two cars cross on it (scenery: the player cannot drive onto it). |
| Mermoz (the hub) | Mostly gated villas and mid-rise flats under shade trees whose crowns lean over the road, and sandy verges. The district's west street, Rue de Sacré-Cœur, is commercial: Café Touba · Sacré-Cœur, and the Boulangerie. Rue de Sacré-Cœur is the district's busy street: the crowd, parasol stalls and cantines on its pavements, and lines of Jakarta motorbikes and taxis at its kerbs. |

**The BRT's two buses** (SUNUBRT articulated electric livery) run one per direction:

1. A bus approaches and stops at the line.
2. It asks for its phase. The signals go main → amber → all red → bus.
3. It crosses, stops at its platform and dwells 9–14 s.
4. It leaves into the portal and comes back 35–60 s later.

A bus waits for anything in its path. The road's traffic stops at the main road's red, and the player's car is never stopped by force. There are no fares and no timetable.

## The golden path

1. **The Corniche, after work.** The phone's « Courses VTC » lists *Campus de l’université → Résidence Les Filaos* (Aminata Ndiaye) first, then the ordinary rides. The player may take it, take another, or ignore them all.
2. **The pick-up** at the campus kerb, through the existing VTC flow (door, seat, marker).
3. **The drive** out by the Corniche's east mouth, then the VDN and Sacré-Cœur. The car crosses the BRT at its signals and enters Mermoz with no loading screen.
4. **The drop-off** at the kerb bay by the Filaos' gate (a quiet villa street at x = 60).
5. **Payment** by the existing payment, once: one wallet line, guarded by `vtc.done`. The existing completion card follows.
6. **Pape Diouf**, the gardien at his gate, thanks the driver about 3 s after the card. His line is said once per ride.
7. **A later visit.** At least 2 city hours later, on a new arrival in Mermoz, the player comes up to the gate. Pape recognises them (once per city day) and, the first time, passes on Mme Ndiaye's ride *Résidence Les Filaos → Banque Teranga · Plateau*. It is on the phone until it is paid, once.
8. **Free roaming.** The player drives home or keeps exploring. Everything above is optional; the road, the BRT and the district work with no job in hand.

**The everyday counter** is Café Touba · Sacré-Cœur, the existing kiosk with its actions.

## Rules (`src/districts/mermozRules.ts`, tested in `tests/mermoz.test.ts`)

- The authored first ride is offered on the Corniche only, until it is paid. It is never offered again, so it can't be farmed.
- The bank ride is offered in Mermoz only, after Pape's first recognition, until it is paid. It is offered once ever.
- Pape's thanks: `first` the first time a ride ends at his gate, `again` after that. These are lines only; no money or item comes from him.
- Recognition: never on the arrival where they met; at least `LATER_HOURS` (2) city hours after the thanks; once per city day.

## Memory (existing save fields only, no schema change)

| Key | Kind | Meaning |
|---|---|---|
| `mz_first_ride` | flag | The first ride was paid. |
| `mz_filaos_rides` | counter | Paid rides that ended at the Filaos (any passenger). |
| `mz_pape_met` | counter | City-hour stamp + 1 when Pape first thanked the driver. |
| `mz_pape_seen_day` | counter | City day + 1 of the last recognition. |
| `mz_ndiaye_offer` | flag | Pape passed on the bank ride. |
| `mz_ndiaye_ride` | flag | The bank ride was paid. |
| `visit_pape_filaos`, `seen_pape_filaos` | counters | Shared NPC memory (`src/social/memory.ts`), consumed as-is. |
| `rel["pape_filaos\|player"]` | relation | +3 for meeting him, +1 for each later drop at his gate, +2 for each recognition. |

## Scope kept

- One connection from the existing road system (the Corniche's east mouth).
- One divided artery, one BRT segment and station with 2 buses through one roundabout, one autopont (scenery), and one district street loop.
- Two job addresses, one counter and one recurring NPC.
- Traffic per the existing corridor system.

## Checks

- `tests/mermoz.test.ts`: the rules.
- `src/road/chunks.test.ts`: « the VDN: a divided artery », « the BRT crossing at Sacré-Cœur », « the rond-point of Sacré-Cœur, the BRT through it », « the autopont at the way into Mermoz ».
- `src/road/graph.test.ts`, `network.test.ts`: the road graph.
- `scripts/check-mermoz-journey.mjs`: the golden path, driven with real touch in one session (video).

## Known limits

- The next city day in the journey check is a labelled debug shortcut. A real « later visit » needs 2 city hours, which is 2 real minutes.
- A save with a vehicle parked in Mermoz, loaded by a client older than this branch, puts the car at the same coordinates in that client's fallback hub. This only happens on a rollback.
- The multiplayer room `mermoz` only exists on a worker built from this branch.
