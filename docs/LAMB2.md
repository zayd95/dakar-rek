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
Pape », « … · Saliou », « … · Ousmane », « … · Malick » ou « … · Daouda » (un lutteur pour chacun des six styles). Le soir, ton combat de la soirée (entrée des lutteurs → coin → cercle) se joue aussi avec
frappe. **Pour apprendre** : l'Entraînement à l'écurie de Pikine devient la leçon guidée de Coach Ablaye (plus bas).
Sans `?lamb2`, rien ne change.

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

### Ton combat de gala, avec frappe : les tribunes et l'annonceur

Le chemin du lutteur (classement de la carrière → appelé à l'arène → « Entrée des lutteurs » → coin → cercle,
`src/arena/fighter.ts`) se lutte **avec frappe** avec `?lamb2` (`ctx.startBout` → `startDuel(…, 'avec_frappe')`), contre
l'adversaire désigné par la carrière, lui-même (son style, son niveau, sa ligne). Ses moments (`LambDuel.onMoment` :
`strike`, `stagger`, `fall`, `arm`, `result`) passent par **un seul plan** (`src/arena/frappeMoments.ts`, testé),
appliqué par le module de l'arène pour ton combat comme pour le combat regardé — les mêmes réactions de la foule, la même
réaction à la chute (`fallSplit`) :

- **frappe nette** : le côté de celui qui frappe crie (grosse frappe) ou applaudit un peu (frappe rapide) ;
- **il vacille** (l'équivalent d'un knock-down) : le côté de celui qui a frappé se lève, les virages crient, et
  l'annonceur : « Gora vacille ! Il n'est pas tombé : le combat continue. » (pas deux fois en six secondes) — ce n'est
  **pas** la chute ;
- **la chute qui finit le combat** : les tribunes se partagent (le côté du vainqueur fête, les autres mains sur la tête) ;
  au temps, elles se lèvent ;
- **l'arbitre lève le bras du vainqueur** : l'annonceur donne le résultat (« … l'emporte par projection ! · Le public :
  « Daan na ! » ») ; puis le plan de résultat des tribunes.

Au combat regardé, le résultat reste annoncé par la soirée elle-même (sa phase « résultat ») ; les frappes, les
déséquilibres et la chute y sont les mêmes. Pas de moment à l'écurie (leçon, exercices). Vérification :
`LAMB2=1 node scripts/check-arena-fighter.mjs` (combat avec frappe, un déséquilibre annoncé).

## Les lutteurs de la ville sont eux-mêmes

Avec frappe, l'adversaire est **un lutteur du classement de la ville** (`src/career/roster.ts`, données de la lane
carrière, lues seulement) : le combat classé désigné par la carrière, ou Gora, Pape et Saliou au combat amical. Une
seule table (`src/lamb/opponents.ts`, testée) relie son style à sa façon de lutter — debout (comment il lit les frappes
et y répond) et dans l'empoignade (ses mouvements préférés, son goût pour la projection) — et son **niveau** décale ses
attributs (±6 par niveau autour de 3), toujours dans la règle des ±20 %. Il est présenté en une ligne avant le combat,
dans l'en-tête et dans le bilan : « Face à toi : Gora, costaud indépendant, 7-2 » (bilan de la saison sur le classement
de la ville). Sans `?lamb2`, rien ne change.

## Les six styles (spec §12)

Avec frappe, chaque lutteur a l'un des **six styles de la spec**. Un style est **une entrée de données** : son IA debout
(`STAND_STYLES`, `src/lamb/stand.ts`), ses préférences dans l'empoignade et son goût pour la projection
(`CLINCH_STYLES`, `src/lamb/clinch.ts`), la forme de ses attributs, et le mot qui le dit (`STYLE_MAP`,
`src/lamb/opponents.ts`). Aucun n'a tous ses attributs au-dessus d'un autre : ce sont les rencontres qui font les
stratégies.

| Style (spec) | Dit | Debout | Dans l'empoignade | Attributs forts | Lutteurs |
| --- | --- | --- | --- | --- | --- |
| Puissant — met la pression | costaud | s'avance et se tient près (1,4 m), grosse frappe, saisit volontiers | pousse surtout, projette souvent, lâche peu | Force | Babacar, Gora |
| Technique — cherche les contres | technicien | distance moyenne, laisse l'autre s'engager, répond à la grosse frappe par une rapide plus que tous | lit et répond le mieux, tire et pivote | Technique, Sang-froid | Ousmane, Ndiaga |
| Rapide — utilise le mouvement | rapide | frappes rapides, recule devant la frappe plus que tous | décide le plus vite, pivote | Explosivité | Lamine, Pape |
| Défensif — fatigue l'autre | défensif | garde la plus longue distance (1,9 m), se garde le plus | tire, se dégage quand ça tourne mal | Défense, Endurance | Assane, Saliou |
| Bon frappeur — crée des ouvertures | bon frappeur | à distance de frappe, frappe le plus, grosses frappes comprises | veut en sortir pour refrapper (se dégage le plus) | Frappe | Malick, Birame |
| Grand lutteur de saisie — ferme vite la distance | grand lutteur de saisie | ferme la distance (1,2 m), saisit le plus, ne recule jamais | chez lui : pousse, projette le plus, ne lâche jamais | Force, Équilibre, Technique (peu de Frappe) | Daouda, Pathé |

Les douze lutteurs du classement sont répartis deux par style (`ROSTER_STYLE6`). Chaque style affine son style de
carrière (technicien → défensif, bon frappeur → rapide, grand lutteur de saisie → costaud) : les fiches de la carrière
restent justes. « Face à toi : Ousmane, technicien de l'écurie Baobab, 4-3 ». Testé style par style
(`tests/lamb2Styles.test.ts`) : chacun est mesuré contre les cinq autres sur ce qui le définit (par tirages semés : qui
saisit, frappe, se garde, recule, contre, lit, se dégage, projette le plus).

### L'arbitre presse un combat qui ne va nulle part

- **Debout** : après 7 s sans empoignade, « L'arbitre presse les lutteurs : saisissez-vous ! » — ils se rapprochent et
  saisissent davantage, pleinement à 14 s (`URGE`).
- **Dans l'empoignade** : après 3 s, chacun se contente d'une position moins bonne pour projeter, plus souvent,
  pleinement à 7 s (`URGE_CLINCH`). Une projection tentée trop tôt rate plus souvent et déséquilibre son auteur.
- **La fatigue** (spec §8) : à bout d'endurance (sous 6) dans l'empoignade, un lutteur ne tient plus son équilibre, il
  glisse (plus encore si la prise est contre lui). Celui qui s'est épuisé le premier tombe — l'arme du défensif.
- **La séparation** : l'arbitre sépare une empoignade stérile à 9 s, mais pas quand un lutteur va tomber (posture
  « chute ») : il laisse finir, 4 s de plus au plus. Après une séparation, il continue de presser.
- **La cloche** termine aussi le temps dans l'empoignade (une projection déjà lancée retombe d'abord).

Ces réglages valent aussi pour l'adversaire du joueur, avec frappe seulement.

## Le combat de la soirée, avec frappe (IA contre IA)

Avec `?lamb2`, le combat que regardent les spectateurs au gala (l'affiche du soir, deux lutteurs du classement) se
lutte **avec frappe, IA contre IA**, avec les mêmes étapes : frappes, empoignade, glissade, projection, contre, chute,
arbitre — et les tribunes réagissent (à la chute, le côté du vainqueur fête, l'autre se tient la tête). Le côté
« joueur » du duel est piloté par la même IA que l'autre (lecture des frappes, mouvements de l'empoignade,
projections et contres, `DuelOptions.autopilot`), chacun avec son style et son niveau.

Le combat reste **le même pour tous les spectateurs** : il est semé par la soirée (`boutSeed(hub, jour)`) et joué par
pas fixes de 1/60 s (lane « arena together »). Tous les tirages viennent du `rand` semé du duel — aucun `Math.random`,
pas de temps réel — ; testé : la même graine donne deux fois le même combat et le même résultat, des jours différents
donnent des combats différents (`tests/lamb2Watch.test.ts`). Pour un spectateur assis, ni ralenti ni caméra
rapprochée : sa vue reste celle de sa place ; l'arbitre vient lever le bras du vainqueur. Sans `?lamb2`, le combat
regardé est inchangé.

Réglages de l'IA (valables aussi contre le joueur) : chaque style **s'avance pour saisir** quand il est près (Gora et
les puissants plus que les défensifs) — la lutte reste le cœur, les frappes ouvrent, les saisies concluent ;
l'équilibre revient un peu moins vite (12/s) pour que les échanges pèsent ; au temps, l'arbitre compte aussi les
frappes nettes (1 point) et les déséquilibres (2 points).

**Les préliminaires** (vague 5, `src/arena/undercard.ts`) se luttent aussi avec frappe, IA contre IA : la paire est
le programme « frappe » du combat regardé (`prelimBout`). Les jeunes lutteurs du quartier (noms génériques, pas du
classement) reçoivent chacun un style des six tiré de la graine du préliminaire (`prelimSeed`, `localPair`) — le même
pour tous les spectateurs ; celui de droite garde le style de sa fiche (ses couleurs). Testé
(`tests/lamb2Prelims.test.ts`) : même graine, même combat ; sur 60 soirées (181 préliminaires), tous finis dans leur
manche de 30 s, 179 par projection.

Le combat regardé est une **manche courte de 30 s** (`WATCHED_ROUND`) : avec la présentation et la chute, il est fini
en 40 s au plus. Presque tous finissent avant, par une chute. Testé sur toutes les paires du classement
(`tests/lamb2Styles.test.ts`, 132 paires × 3 soirs = 396 combats) : tous finis en 40 s ou moins, 394 par projection,
1 décision, 1 égalité ; le plus long 36 s, la moitié en moins de 17 s ; chaque style gagne et perd.

## La leçon de Coach Ablaye, avec frappe

Avec `?lamb2`, l'**Entraînement** de l'écurie (Coach Ablaye, Babacar en partenaire) devient une leçon guidée de la lutte
avec frappe. Une étape à la fois, chacune **terminée en la faisant** (`src/lamb/lesson.ts`) :

1. **Distance** — s'approcher à un bras (le partenaire attend : c'est toi qui avances).
2. **Frappe rapide**, puis **grosse frappe** — et son prix : ratée ou parée, elle t'ouvre (le coach le dit).
3. **Garde** — Babacar arme lentement une grosse frappe : la parer.
4. **Saisir** — l'empoignade (la garde n'arrête pas une saisie).
5. **Pousser / Tirer / Pivoter** — lire son corps (il pousse lentement) et gagner un échange en répondant.
6. **Sentir la glissade** — sa prise est forte, ton équilibre s'use (bord de l'écran), puis **Casser**.
7. **Projeter** — il glisse et tu tiens la prise ; puis **Contrer** sa projection quand le bouton devient vert.

Le partenaire montre tout **lentement** (×1,8) ; dans la leçon personne ne tombe vraiment (on se relève). Chaque étape
a sa phrase de Coach Ablaye : une expression du lexique avec sa traduction, puis la consigne en français — « Kaay fi ! »
(viens ici), « Gaawal ! » (dépêche-toi), « Ndank ndank » (petit à petit), « Bul tiit ! » (n'aie pas peur), « jàpp »
(saisir), « Xaaral tuuti » (attends un peu), « Benn, ñaar, ñett ! » (un, deux, trois), « Waaw kay ! » (bien sûr),
« Baax na ! » (c'est bien). **Passer** (bouton, ou P) saute l'étape ; Échap abandonne comme avant. Sur téléphone, les
boutons de l'étape (ou le joystick) sont **surlignés en vert**. À la fin, le bilan d'entraînement habituel : rien de
plus que l'effet d'entraînement existant (compétence de lutte +1). Sans `?lamb2`, l'entraînement sans frappe est
inchangé.

## Les exercices de l'écurie, joués

Avec `?lamb2`, les trois exercices de l'écurie de la carrière (`src/career/module.ts`, dans « ⋯ » chez Coach Ablaye) ne
sont plus une barre d'attente de 5 s : ce sont de **courts exercices joués** avec les commandes avec frappe, appelés par
Coach Ablaye comme dans sa leçon (`src/lamb/drills.ts`). Babacar est le partenaire, lent (×1,8), et ne fait que ce que
l'exercice demande.

| Exercice | Ce qu'on fait | Appels | Compteur → attributs (règles de la carrière) |
| --- | --- | --- | --- |
| Sac de frappe | Babacar tient les paos : à « Rapide ! » une frappe rapide (J), à « Fort ! » une grosse (K), à temps et à portée | 8 | `entr_frappe` → Frappe, Explosivité |
| Travail des saisies | dans l'empoignade, il arme lentement un mouvement : répondre avec celui qui le bat (Tirer bat Pousser…) | 6 | `entr_saisies` → Technique, Équilibre |
| Gainage | dans l'empoignade, il pousse encore et encore : tenir en poussant avec lui, au moment où il pousse ; le souffle compte | 6 | `entr_force` → Force, Explosivité |

- **Le score vient de ce que tu fais, jamais du hasard** : les appels sont une suite fixe (aucun tirage). Un appel est
  réussi ou non (en retard, mauvaise réponse, trop loin, battu) ; une réponse sans appel est une faute (« Attends mon
  appel »). Score = réussites − fautes (jamais sous 0), sur le nombre d'appels. Mot de fin de Coach Ablaye selon le
  score : « Baax na ! », « Ndank ndank. » ou « Bul tiit ! » (avec leur traduction).
- **Le gain d'attributs est celui de la carrière, sans nombre inventé** : un exercice terminé compte **une fois**, comme
  l'exercice minuté (ses besoins, son compteur, l'activité), quel que soit le score ; abandonné (Échap), il ne compte
  rien. La carrière lit le compteur (`fighterAttributes`) : chaque exercice rapporte un peu moins que le précédent,
  jusqu'à 100 au plus. Il n'y a **pas de plafond par jour** dans les règles de la carrière : c'est l'énergie (chaque
  exercice en coûte 7 à 9, il en faut 12) qui limite le nombre d'exercices dans une journée. Pas de série, pas de bonus.
- **Ce qui change se voit** : le bilan de l'exercice et le message de fin donnent la vraie variation (« Frappe 34 → 36 »),
  calculée par `fighterAttributes` — les mêmes valeurs que la fiche Profil (application Arène du téléphone).
- Sans `?lamb2`, les exercices minutés sont inchangés.

## La bascule (préparée, pas faite)

Une seule constante décide : `LAMB2_DEFAULT` dans `src/lamb/flag.ts`, **false** aujourd'hui. La basculer à `true` (une
ligne, plus le premier test de `tests/lamb2Flag.test.ts`) fait de Làmb 2.0 la lutte du jeu. Ensuite `?lamb1` dans
l'adresse (ou `localStorage['dakarrek.lamb2'] = '0'`) force l'ancienne lutte ; `?lamb2` (ou `'1'`) force la nouvelle.
L'adresse passe avant le choix enregistré, `?lamb1` avant `?lamb2` (`resolveLamb2`, testé).

**Ce qui bascule** (tout ce qui lit `lamb2On()`) :

- **Combat amical** : les six « Avec frappe » (Gora, Pape, Saliou, Ousmane, Malick, Daouda) s'ajoutent ; les combats
  sans frappe du menu restent.
- **Le chemin du lutteur** (Petit combat de quartier, Place au gala, Combat pour le titre) : avec frappe, contre
  l'adversaire de la carrière lui-même ; les tribunes et l'annonceur réagissent à ses moments.
- **Le menu « Combat classé »** de l'arène : avec frappe, contre le lutteur du classement désigné par la carrière, lui-même
  (« Affronter Ousmane · Technicien · niveau 4 »). Il compte au classement de la carrière **exactement** comme un combat
  classé sans frappe (la même entrée `mode: 'classe'`, les mêmes points et le même cachet, `src/career/career.ts` ;
  aucun champ ni nombre nouveau), et dans son propre bilan `lamb_af_classe_*`, comme les amicaux.
- **L'écurie** : la séance de Coach Ablaye devient la leçon guidée avec frappe ; les trois exercices sont joués.
- **La soirée regardée** : le combat principal et les préliminaires avec frappe, IA contre IA (manches de 30 s).
- **Les bilans** : ces combats comptent dans `lamb_af_*` (et `combats`/`victoires`) ; la carrière reçoit
  `discipline: 'avec_frappe'` (qu'elle n'enregistre pas : un combat classé est un combat classé).
- Les descriptions des actions de l'arène et de l'écurie disent quelle lutte elles proposent.

**Ce qui ne bascule pas** (à décider à part) : les combats amicaux sans frappe restent au menu ; le classement de la
ville mélange les deux disciplines dans un même bilan de saison (voulu : mêmes points) ; le combat joueur contre joueur
avec frappe (arbitrage serveur) n'existe pas.

**Les vérifications** : sans `LAMB2=1`, les scripts chargent le jeu sans drapeau — après la bascule ils testeraient
donc la lutte avec frappe. Pour garder la couverture sans frappe, ils devront charger `?lamb1` : `check-lamb` en entier,
`check-arena-visit`, `check-evening` et `check-arena-fighter` sans `LAMB2`, et l'étape téléphone « sans le drapeau » de
`check-lamb2`. **Les amis dans les tribunes** voient le même combat tant qu'ils ont le même réglage : la graine est la
même, mais un ami en `?lamb1` verrait l'autre lutte.

## Décision à prendre (Habib) : quand la lutte avec frappe devient-elle la règle ?

Aujourd'hui tout est derrière `?lamb2`. Ce qui est **prêt** : le combat debout, l'entrée et l'empoignade jouée, la
glissade, la projection et le contre, la chute (arbitre, foule), les lutteurs du classement avec leur style et leur
niveau, le bilan à part (`lamb_af_*`) et la carrière, le combat de la soirée avec frappe (le même pour tous), la leçon
de Coach Ablaye, le téléphone (cinq boutons, portrait et paysage).

Ce qui **manque** avant d'en faire la lutte par défaut :

- **La validation en jeu** : les parties complètes au navigateur (file de l'intégrateur) et surtout **des parties
  jouées par des gens**, sur téléphone, pour régler la difficulté (l'IA lit-elle trop bien ? la fenêtre de « Contrer »
  est-elle jouable au pouce ?).
- **Les animations** : frappes, empoignade et chute sont des poses provisoires posées sur le squelette (pas de vraie
  animation de projection ni de chute dirigée) — à remplacer par des animations Blender.
- **Le classé** : le menu « Combat classé » et le chemin du lutteur sont avec frappe avec le drapeau, aux mêmes points
  que sans frappe ; le classement de la ville (carrière) compte les deux disciplines dans un même bilan de saison.
- **Le multijoueur** : un combat joueur contre joueur avec frappe demande l'arbitrage serveur (spec §20), pas fait.
- **L'équilibrage des styles** (spec §12) : les six styles sont écrits et chacun gagne et perd entre IA ; leur
  difficulté contre un joueur reste à régler avec des parties réelles (Ousmane et Daouda sont niveau 4 au combat
  amical).

Options : (a) garder « sans frappe » par défaut et proposer « avec frappe » à côté (amical, soirée) dès maintenant ;
(b) basculer la soirée et l'entraînement par défaut d'abord, le classé ensuite ; (c) tout basculer d'un coup après
une semaine de parties réelles. Recommandation : **(b)**, après une passe de parties sur téléphone — la soirée et la
leçon montrent le mieux la nouvelle lutte, et le classé garde son bilan tant que la carrière ne sépare pas les deux.

## Code et vérifications

- `src/lamb/stand.ts` — règles pures du combat debout (testées : `tests/lamb2.test.ts`).
- `src/lamb/duel.ts` — `discipline: 'avec_frappe'` branche le combat debout ; `'sans_frappe'` (par défaut) est inchangé.
- `src/lamb/clinch.ts` — entrée et empoignade (pures, testées dans `tests/lamb2.test.ts`).
- `src/lamb/opponents.ts` — les lutteurs du classement en adversaires avec frappe (table des six styles → IA, niveau → attributs ; `ROSTER_STYLE6`).
- `tests/lamb2Styles.test.ts` — les six styles, l'arbitre qui presse, la fatigue, toutes les paires IA contre IA en 40 s.
- `tests/lamb2Prelims.test.ts` — les préliminaires avec frappe (styles tirés de la graine, déterminisme, durée) et les six adversaires du combat amical.
- `src/lamb/lesson.ts` — la leçon de Coach Ablaye (étapes, ce qui les termine, ses phrases ; testée, y compris dans le duel sans navigateur).
- `src/lamb/drills.ts` — les exercices de l'écurie joués (appels, score, mots du coach ; `tests/lamb2Drills.test.ts`, y compris dans le duel sans navigateur). Point de contrôle : `__dakar.drillStart('drill_frappe' | 'drill_saisies' | 'drill_force')`.
- `src/lamb/strikeRig.ts` — poses de frappe et d'empoignade sur le squelette.
- `src/arena/bout.ts` — le combat regardé ; avec frappe, le duel joue les deux côtés (IA contre IA).
- `scripts/check-arena-visit.mjs`, `scripts/check-evening.mjs` — avec `LAMB2=1` : le combat de la soirée avec frappe (arbitre, tribunes).
- `scripts/check-lamb2.mjs` — navigateur (bureau + téléphone), captures dans `docs/screenshots/lamb2/`. Ses étapes 4–5
  (glissade, projection) se jouent adversaire, chrono et arbitre tenus immobiles (`__dakar.duelHold`, `duelClock` ;
  même mise en place sans navigateur : `tests/lamb2Hold.test.ts`).
