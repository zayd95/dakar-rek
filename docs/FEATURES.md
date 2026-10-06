# Dakar Rek — feature status

Legend: **Implemented** = works and was verified. **Partial** = a first working version with stated limits. **Pending** = not started. Placeholders are never listed as implemented.

Last updated: milestone 1 (v0.1).

## Implemented (milestone 1)

| Feature | Notes |
| --- | --- |
| Vite + TypeScript + Three.js project | `npm run dev`, `npm run build`, `npm test` |
| Four hubs reachable | Plateau · Médina, Corniche · Fann · Mamelles, Almadies · Ngor · Yoff, Pikine · Guédiawaye · Parcelles; each generated from its own spec with its own look |
| Travel between hubs | Car rapide station in every hub; costs FCFA and a little fatigue; fade transition |
| Third-person camera | Behind and slightly above, character low-centre, drag to rotate, pulls in near buildings, wider in portrait |
| Mobile and desktop movement | Virtual joystick + drag on touch; WASD/ZQSD/arrows + mouse drag on desktop |
| Contextual action button | Appears near interactable places and people; opens a short list of choices |
| Interaction foundation | Data-driven actions (cost, gain, needs, duration, requirements) |
| Needs and mood | Faim, Énergie, Moral, Social, Hygiène; drain with personal played time |
| Guest save | Device-local, versioned, validated and migrated; autosave; unit-tested |
| Shared city clock | One city day = 24 real minutes; day/night lighting |

## Partial

| Feature | What exists | What is missing |
| --- | --- | --- |
| City clock | Computed from the device clock | Server time (backend not built) |
| First session | Start in Pikine, Tonton Ibou, a first paid job in each hub | Guided introduction, starter-room interior |
| Jobs | One simple paid activity per hub (market, port, garage, training) | Tiak Tiak, clando and Yango driving jobs |
| Food venues | Order and eat at gargotes, restaurant and café Touba stands | Seating, interiors, Maïga-style spot, dibiterie, nightlife |
| NPCs | Background walkers and one named character (Tonton Ibou) | Routines, recurring cast, relationships |
| Decorative traffic | Visual-only cars with no gameplay collisions | Shared interactive vehicles |
| Quality settings | Low / Medium / High (resolution, shadows, crowd, traffic) | Automatic choice from measured device performance |
| Landmarks | Mosque, market, monument, outdoor gym, pitch, port, arena, écurie as scenery | Interiors, activities at the mosque, arena and écurie |

## Pending

Driving (Tiak Tiak, clando, Yango) · vehicle radio · shared vehicles and anti-blocking · interiors · Maïga-style spot, dibiterie, nightlife and dance areas · social actions and shared meals · multiplayer (presence, chat, home visits, invitations) · social money (gifts, loans) · personal bills and tontines · housing progression · mosque and collective prayer · Quran reading · làmb combat and arena social life · traits, wishes, aspiration · skills · city evolution and milestones · photo mode · live statistics page · accounts, server ledger, migrations (Supabase + Drizzle) · session servers (Durable Objects) · asset CDN · monitoring.
