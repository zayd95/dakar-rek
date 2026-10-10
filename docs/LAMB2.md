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
| 4 | Équilibre / posture dans le clinch : on sent la position glisser | **jouable** |
| 5 | Tentative de projection et contre | **jouable** |
| 6 | Chute : posture, équilibre, contacts, force, réponse → ralenti court → arbitre → foule → résultat | **jouable** |

## Comment jouer (Habib)

**Lancer.** Ajoute `?lamb2` à l'adresse du jeu. À l'arène de Pikine : **Combat amical** → « Avec frappe · Gora », « … ·
Pape » ou « … · Saliou ». Le soir, ton combat de la soirée (entrée des lutteurs → coin → cercle) se joue aussi avec
frappe. Sans `?lamb2`, rien ne change.

| | Clavier | Téléphone |
| --- | --- | --- |
| Se déplacer | ZQSD / WASD / flèches | joystick à gauche |
| Frappe rapide | J (ou C) | **Frappe** |
| Grosse frappe | K (ou V) | **Grosse frappe** |
| Garde (maintenue) | G (ou Maj) | **Garde** (garder le doigt) |
| Reculer | X | **Reculer** |
| Saisir | E / Espace | **Saisir** (gros bouton jaune) |
| **Dans l'empoignade** | | les boutons changent de nom |
| Pousser | E / Espace | **Pousser** |
| Tirer | G | **Tirer** |
| Pivoter | J | **Pivoter** |
| Casser (se dégager) | X | **Casser** |
| Projeter / Contrer | K | **Projeter** — devient **Contrer** (vert) quand il tente sa projection |

**Debout.** Trois barres par lutteur : endurance (vert), équilibre (bleu), sang-froid (orange) — pas de vie. La frappe
rapide est sûre ; la grosse prend beaucoup d'équilibre mais, ratée ou parée, elle t'ouvre. Une frappe rapide qui
touche coupe sa grosse frappe. La garde arrête les frappes mais pas une saisie : contre un adversaire qui se garde,
saisis-le. Équilibre à zéro : il **vacille** — saisis-le tout de suite.

**Dans l'empoignade.** Regarde son corps : penché en avant il **pousse**, assis en arrière il **tire**, tourné il
**pivote**. Réponds avec ce qui le bat : **Tirer bat Pousser, Pivoter bat Tirer, Pousser bat Pivoter**. Chaque échange
gagné fait glisser sa prise et son équilibre. Si sa prise est trop forte, ton équilibre s'use tout seul (bord de
l'écran ambre puis rouge, « Tu glisses… ») : gagne un échange ou **Casse**. Quand il glisse, **Projette** ; quand
il tente la sienne, **Contre** (le bouton devient vert).

**Bilan.** À part de la lutte sans frappe (`lamb_af_amical_v/d/n/ab`) ; les totaux `combats`/`victoires` comptent les
deux, et le combat est rapporté à la carrière (`GameModule.lamb`, `discipline: 'avec_frappe'`).

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

## Étape 4 — sentir la position glisser

Une prise nettement contre soi (au-delà de −25) **use l'équilibre même entre les mouvements**, d'autant plus vite
qu'elle est mauvaise (jusqu'à 9 par seconde), et l'équilibre ne revient plus : il faut gagner un échange ou casser
avant qu'il ne tombe. Le joueur le sent avant la chute : « Tu glisses : sa prise t'use, reprends-la ! », le bord de
l'écran devient ambre puis rouge (« Tu vas tomber : contre ou casse ! », avec une note grave), la barre d'équilibre
clignote, le corps part en arrière. Côté adversaire : « Il glisse ! », puis « Il va tomber : pousse ! » et la foule
qui monte.

L'adversaire lit le mouvement du joueur et y répond par celui qui le bat (plus avec la Technique, moins quand il
perd son sang-froid), casse quand sa prise est perdue, sinon joue son style : Gora pousse, Pape pivote, Saliou tire.

## Étape 5 — la projection et le contre

**Projeter** (12 d'endurance) se prépare 0,55 s — le corps se penche, l'autre le voit venir — puis tombe. Elle met
l'autre au sol **si la position le permet** : son équilibre (plus il est bas, plus c'est facile), la prise (les
contacts), l'équilibre du lanceur, sa Force et sa Technique, et un lutteur pris au milieu d'un mouvement se projette
mieux. Sinon elle rate : le lanceur perd 20 d'équilibre et 15 de prise. Jamais « force > défense » : la même
projection passe ou rate selon la position (les meilleurs attributs ne font pas tomber un homme stable).

Pendant qu'elle se prépare, l'autre peut **Contrer** (8 d'endurance) : avec assez d'équilibre, de prise et de
technique il la retourne et c'est le lanceur qui tombe ; sinon il la bloque seulement (le lanceur perd 10
d'équilibre). L'adversaire tente sa projection quand la position est bonne (Gora plus que les autres) et voit venir
celle du joueur selon sa lecture, sa Technique et son sang-froid.

## Étape 6 — la chute

Quand la chute décisive arrive (projection réussie, contre qui retourne, ou équilibre à zéro dans l'empoignade) :
un **ralenti court** (0,9 s, caméra basse et proche sur le lutteur qui tombe), puis la caméra recule ;
**l'arbitre** arrive de son côté du cercle (vers le tunnel des lutteurs) jusqu'à côté du vainqueur et **lui lève le
bras** ; **la foule explose** (et les spectateurs de la scène se lèvent) ; le vainqueur célèbre ; puis le résultat.
« L'arbitre lève ton bras : victoire ! » ou « L'arbitre lève le bras de Gora ». Au temps, pas de ralenti : l'arbitre
lève le bras du vainqueur aux points. Les **tribunes de la soirée** réagissent (`LambDuel.onMoment` → `LambEvent`
« moment » → le module de l'arène, avec les réactions de la lane foule) : à la chute, le côté de l'écurie du vainqueur
fête pendant que l'autre côté et les virages se lèvent, mains sur la tête ; au résultat, le plan de résultat des
tribunes.

## Les lutteurs de la ville sont eux-mêmes

Avec frappe, l'adversaire est **un lutteur du classement de la ville** (`src/career/roster.ts`, données de la lane
carrière, lues seulement) : le combat classé désigné par la carrière, ou Gora, Pape et Saliou au combat amical. Une
seule table (`src/lamb/opponents.ts`, testée) relie son style à sa façon de lutter — debout (comment il lit les frappes
et y répond) et dans l'empoignade (ses mouvements préférés, son goût pour la projection) — et son **niveau** décale ses
attributs (±6 par niveau autour de 3), toujours dans la règle des ±20 %. Il est présenté en une ligne avant le combat,
dans l'en-tête et dans le bilan : « Face à toi : Gora, costaud indépendant, 7-2 » (bilan de la saison sur le classement
de la ville). Sans `?lamb2`, rien ne change.

## Code et vérifications

- `src/lamb/stand.ts` — règles pures du combat debout (testées : `tests/lamb2.test.ts`).
- `src/lamb/duel.ts` — `discipline: 'avec_frappe'` branche le combat debout ; `'sans_frappe'` (par défaut) est inchangé.
- `src/lamb/clinch.ts` — entrée et empoignade (pures, testées dans `tests/lamb2.test.ts`).
- `src/lamb/opponents.ts` — les lutteurs du classement en adversaires avec frappe (table style → IA, niveau → attributs).
- `src/lamb/strikeRig.ts` — poses de frappe et d'empoignade sur le squelette.
- `scripts/check-lamb2.mjs` — navigateur (bureau + téléphone), captures dans `docs/screenshots/lamb2/`.
