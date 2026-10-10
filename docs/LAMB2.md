# Làmb 2.0 — la lutte avec frappe, étape par étape

Spec de Habib du 10 oct. 2026 (`docs/SPEC_SIGNATURE_2026-10-10.md`, §7–12) : pas de boxe avec une barre de vie. Le cœur,
c'est **distance → frappe → entrée → saisie → avantage de position → déséquilibre → projection / chute**. Construit par
étapes, chacune jouable avant la suivante, sans physique expérimentale. La lutte **sans frappe** actuelle (soirée de
l'arène, écurie, combats amicaux et classés) reste intacte à chaque étape.

| Étape | Contenu | État |
| --- | --- | --- |
| 1 | Debout : distance et déplacement, frappe rapide / grosse frappe (la grosse ratée ouvre), garde avec un coût, équilibre et sang-froid au lieu d'une vie, « il vacille » | **jouable** (drapeau `lamb2`) |
| 2 | Entrée dans le clinch : l'avantage de saisie dépend de l'équilibre et de l'ouverture | **jouable** |
| 3 | Clinch jouable : pousser, tirer, pivoter, casser ; la prise et l'équilibre bougent | **jouable** |
| 4 | Équilibre / posture dans le clinch : on sent la position glisser | à faire |
| 5 | Tentative de projection et contre | à faire |
| 6 | Chute : posture, équilibre, contacts, force, réponse → ralenti court → arbitre → foule → résultat | à faire |

## Essayer

`?lamb2` dans l'adresse (ou `localStorage['dakarrek.lamb2'] = '1'`), puis à l'arène de Pikine : **Combat amical** →
« Avec frappe · Gora / Pape / Saliou ». Non compté dans les classements tant que la discipline est en construction
(ses compteurs `lamb_af_*` sont réservés). Sans le drapeau, rien ne change.

Commandes debout : déplacement (joystick, ZQSD/WASD/flèches), **Frappe** (J ou C), **Grosse frappe** (K ou V),
**Saisir** (E/Espace), **Garde** maintenue (G/Maj), **Reculer** (X). Dans l'empoignade, les mêmes boutons deviennent
**Pousser** (E/Espace), **Tirer** (G), **Pivoter** (J), **Casser** (X) ; **Projeter** (K) arrive à l'étape 5. Sur
téléphone, cinq boutons à droite, qui changent de nom dans l'empoignade.

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

## Étape 2 — l'entrée dans l'empoignade (`src/lamb/clinch.ts`)

La façon dont une saisie devient une empoignade donne l'**avantage de saisie** (affiché en mots : égale, avantage,
gros avantage) : saisie simple +0, saisie arrivée au bout de sa fenêtre +10, **sous la garde** +12 (mains hautes pour
les frappes, le corps est ouvert), **sur une ouverture** +18, **pendant qu'il vacille** +32 ; plus 15 pour celui qui
saisit, plus l'écart d'équilibre (×0,3), de Technique et de Force. Avec frappe, la garde arrête les frappes mais pas
une saisie : **la frappe bat la saisie qui arrive, la garde bat la frappe, la saisie bat la garde** ; reculer fait
rater les deux.

## Étape 3 — l'empoignade se joue

Trois mouvements, chacun **se voit dans le corps** pendant qu'il se prépare (penché en avant, assis en arrière,
tourné), puis s'applique. Quand un mouvement arrive, ce que l'autre prépare à ce moment décide de l'échange :

- **Tirer bat Pousser** (il pousse dans le vide : le pousseur perd beaucoup d'équilibre),
- **Pivoter bat Tirer** (on tourne hors de sa traction),
- **Pousser bat Pivoter** (on ne fait pas tourner un homme qui vous pousse),
- même mouvement des deux côtés : la force (pousser), la technique (tirer), rien (pivoter) ;
- contre un lutteur qui ne fait rien, chaque mouvement prend un peu d'équilibre ou de prise.

Gagner un échange déplace aussi la **prise** (la barre de l'empoignade). Les effets grandissent avec la prise qu'on
tient (jusqu'à ±50 %), l'attribut du mouvement (Force pour pousser, Technique pour tirer et pivoter) et diminuent avec
l'Équilibre de celui qui subit. L'empoignade coûte 3 d'endurance par seconde à chacun, chaque mouvement 5 à 6 ;
l'équilibre y revient lentement (5/s). **Casser** coûte 20 et ne marche pas si la prise est nettement contre soi.
L'arbitre sépare une empoignade qui ne mène à rien après 9 s. **Un lutteur dont l'équilibre tombe à zéro dans
l'empoignade va au sol** (l'étape 5 ajoutera la tentative de projection et le contre, l'étape 6 la chute elle-même).

L'adversaire lit le mouvement du joueur et y répond par celui qui le bat (plus avec la Technique, moins quand il
perd son sang-froid), casse quand sa prise est perdue, sinon joue son style : Gora pousse, Pape pivote, Saliou tire.

## Code et vérifications

- `src/lamb/stand.ts` — règles pures du combat debout (testées : `tests/lamb2.test.ts`).
- `src/lamb/duel.ts` — `discipline: 'avec_frappe'` branche le combat debout ; `'sans_frappe'` (par défaut) est inchangé.
- `src/lamb/clinch.ts` — entrée et empoignade (pures, testées dans `tests/lamb2.test.ts`).
- `src/lamb/strikeRig.ts` — poses de frappe et d'empoignade sur le squelette.
- `scripts/check-lamb2.mjs` — navigateur (bureau + téléphone), captures dans `docs/screenshots/lamb2/`.
