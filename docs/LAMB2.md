# Làmb 2.0 — la lutte avec frappe, étape par étape

Spec de Habib du 10 oct. 2026 (`docs/SPEC_SIGNATURE_2026-10-10.md`, §7–12) : pas de boxe avec une barre de vie. Le cœur,
c'est **distance → frappe → entrée → saisie → avantage de position → déséquilibre → projection / chute**. Construit par
étapes, chacune jouable avant la suivante, sans physique expérimentale. La lutte **sans frappe** actuelle (soirée de
l'arène, écurie, combats amicaux et classés) reste intacte à chaque étape.

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Debout : distance et déplacement, frappe rapide / grosse frappe (la grosse ratée ouvre), garde avec un coût, équilibre et sang-froid au lieu d'une vie, « il vacille » | **jouable** (drapeau `lamb2`) |
| 2 | Entrée dans le clinch : l'avantage de saisie dépend de l'équilibre et de l'ouverture | à faire |
| 3 | Clinch jouable : pousser, tirer, pivoter, changer de prise, casser | à faire |
| 4 | Équilibre / posture dans le clinch : on sent la position glisser | à faire |
| 5 | Tentative de projection et contre | à faire |
| 6 | Chute : posture, équilibre, contacts, force, réponse → ralenti court → arbitre → foule → résultat | à faire |

## Essayer

`?lamb2` dans l'adresse (ou `localStorage['dakarrek.lamb2'] = '1'`), puis à l'arène de Pikine : **Combat amical** →
« Avec frappe · Gora / Pape / Saliou ». Non compté dans les classements tant que la discipline est en construction
(ses compteurs `lamb_af_*` sont réservés). Sans le drapeau, rien ne change.

Commandes : déplacement (joystick, ZQSD/WASD/flèches), **Frappe** (J ou C), **Grosse frappe** (K ou V), **Saisir**
(E/Espace), **Garde** maintenue (G/Maj), **Reculer** (X ; dans l'empoignade, X dégage comme avant). Sur téléphone, cinq
boutons à droite.

## Étape 1 — le combat debout (`src/lamb/stand.ts`)

Trois états par lutteur, **aucun point de vie** :

- **Endurance** (partagée avec l'empoignade) : chaque effort la coûte ; fatigué, on récupère moins vite son équilibre
  et on perd son sang-froid.
- **Équilibre / posture** (0–100) : les frappes l'entament, il revient tout seul. À zéro, le lutteur **vacille** :
  1,1 s sans pouvoir agir ni se garder, et une saisie sur lui passe directement en empoignade. Dans l'empoignade,
  l'équilibre qu'on y apporte compte (jusqu'à +2 de force).
- **Sang-froid** (0–100) : entamé par les coups et la fatigue ; sous pression les frappes partent plus lentement
  (jusqu'à +25 %) et l'adversaire réagit moins bien.

| Frappe | Arrive en | Portée | Coût | Équilibre pris (touchée) | Si elle rate | Si elle est parée |
| --- | --- | --- | --- | --- | --- | --- |
| Rapide | 0,18 s | 1,65 m | 5 | 11 | ouvert 0,25 s | — |
| Grosse | 0,52 s (armée visible) | 1,85 m | 14 | 34 | **ouvert 1,1 s**, −16 d'équilibre | ouvert 0,55 s |

- Une frappe **touchée interrompt** une frappe en train d'être armée : la rapide répond à la grosse.
- Un lutteur ouvert ou qui vacille prend 40 % de plus.
- **Garde** : bloque les frappes contre de l'endurance (rapide −3, grosse −11, moins avec une bonne Défense) et un peu
  d'équilibre ; pas de récupération et −2/s tant qu'elle est tenue ; on se déplace à 45 % ; on ne peut ni frapper ni
  saisir.
- **Reculer** : un pas en arrière qui fait rater la frappe en cours.
- Arbitre au temps : les parades, saisies et dégagements comptent comme avant, plus **un point par adversaire mis à
  vaciller**.

**Attributs** (8, de 0 à 100, 50 = moyen) : Force, Équilibre, Technique, Explosivité, Endurance, Frappe, Défense,
Sang-froid. Chacun change un nombre de ±20 % au plus : aucune statistique ne garantit la victoire. Le joueur est moyen
partout pour l'instant (l'entraînement les fera bouger, spec §13).

**Adversaires** (même casting fictif) : Gora le *puissant* (garde la distance courte, grosses frappes, fort et stable),
Pape le *rapide* (entre et sort, frappes rapides, recule beaucoup, peu d'endurance), Saliou le *défensif* (garde
beaucoup, fait rater, répond par des frappes rapides). L'IA voit venir les frappes du joueur (garde, recul ou frappe
rapide la première) selon sa Défense, son sang-froid et sa fatigue ; elle saisit un joueur qui vacille ou qui est
ouvert.

**Présentation** : garde, frappe rapide, grosse frappe armée puis lancée, recul sous le coup et vacillement sont des
poses du haut du corps posées sur la garde animée (`src/lamb/strikeRig.ts`) — des mouvements provisoires de notre jeu,
pas la reproduction d'une technique réelle. Son sourd sur un coup, claquement sur une parade, souffle sur un raté ; la
foule réagit aux grosses frappes et quand un lutteur vacille.

## Code et vérifications

- `src/lamb/stand.ts` — règles pures du combat debout (testées : `tests/lamb2.test.ts`).
- `src/lamb/duel.ts` — `discipline: 'avec_frappe'` branche le combat debout ; `'sans_frappe'` (par défaut) est inchangé.
- `src/lamb/strikeRig.ts` — poses de frappe sur le squelette.
- `scripts/check-lamb2.mjs` — navigateur (bureau + téléphone), captures dans `docs/screenshots/lamb2/`.
