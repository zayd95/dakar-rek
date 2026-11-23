# UI consistency pass

`scripts/check-ui-consistency.mjs` audits the HUD on foot, eleven phone screens and two HUD sheets at 390 × 844. It checks five rules on each surface:
- every visible control is at least 44 px tall (the phone kit's `--pk-tap` token);
- no text is under 11 px;
- one type family is used;
- nothing sticks out sideways, except rows that scroll sideways by design;
- every sheet and screen has a way out.

**Before: 65 / 70.**
- Carte:
  - the Quartier / Ville tabs were 30 px tall;
  - « Filtres » was 36 px;
  - the zoom and recentre buttons were 38 × 38;
  - the strip of places was 40 px.
- Profil: the streak pill was 36 px, and the « j » of the milestones was 10 px.
- HUD: the event tag (« Gala ce soir ») and the streak chip's « Série » were 10.5 px.

**After: 70 / 70.**
- The map controls, the strip, the filter chips and the streak pill use `--pk-tap` (44 px).
- The map's pop-up and status line moved below the taller top row.
- The three small texts are now 11 px.
- Landscape phones (max-height 560 px) keep their compact map controls.

Separate fix: lying in bed, the action button now reads « Se lever · Au lit » instead of « Assis ».
