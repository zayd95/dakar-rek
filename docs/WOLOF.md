# Le wolof dans Dakar Rek

**Décision de Habib (9 octobre 2026).** « Je t'autorise à enrichir ton langage, librairie en wolof. We will go only with
Wolof for now. » — « C'est notre jeu, on crée nos règles. »

Le jeu parle comme on parle à Dakar : en **français**, avec le **wolof de tous les jours** glissé dedans (la
salutation, un merci, un mot du marché ou de l'attaya). Les textes des personnages, du carnet et des histoires sont
les textes du jeu : plus d'étiquette « brouillon ». **Pas de pulaar, de sérère ni de diola pour l'instant** : une fiche
peut dire en français qu'un personnage les parle en famille (« Pulaar en famille, wolof avec les clients »), mais il
salue ses clients en wolof.

## La librairie : `src/i18n/wolof.ts`

- **Lexique** : `LEXICON`, 102 entrées `{ wo, fr, tags, reply? }`.
  - `wo` : le wolof, en orthographe CLAD. Une phrase commence par une majuscule (« Na nga def ? »), un mot seul est en
    minuscules (« xaalis »).
  - `fr` : la glose française, courte, montrée entre parenthèses au joueur quand elle aide.
  - `tags` : `greeting`, `reply`, `thanks`, `farewell`, `yesno`, `ask`, `news`, `invite`, `market`, `food`, `attaya`,
    `work`, `money`, `encourage`, `lamb`, `weather`, `family`, `blessing`, `chat`, `proverb`, `sea`, `morning`,
    `evening`, `night`, `word`.
  - `reply` : la réponse habituelle (« Salaam aleekum » → « Maleekum salaam », « Jërëjëf » → « Ñoo ko bokk »).
- **Thèmes couverts** : salutations et réponses, remerciements, au revoir, oui / non, questions, invitations, marché et
  marchandage, repas et attaya, travail et argent, encouragements, làmb et arène, chaleur et météo, famille,
  bénédictions de tous les jours sans formule religieuse (« Dalal ak jàmm », « Fanaanal ak jàmm », « Jàmm rekk »),
  réactions rapides du chat, deux proverbes très connus.
- **Aides** :
  - `greetingAt(heure)` : « Na nga fanaane ? » de 5 h à 12 h, « Na nga def ? » de 12 h à 17 h, « Na nga yendoo ? »
    ensuite ; `farewellAt(heure)` : « Ba ci kanam », ou « Fanaanal ak jàmm » après 20 h ;
    `greetingPair(heure)` : la salutation et sa réponse ; `replyTo(phrase)`.
  - `pick(tag, graine)` : une expression au hasard mais toujours la même pour la même graine (par ex. l'id d'un
    personnage) ; `byTag(tag)`, `find(phrase)`, `lex(phrase)`.
  - `say('Jërëjëf')` → « Jërëjëf (merci) » ; `quote('Wàññi ko tuuti')` → « « Wàññi ko tuuti » (baisse un peu) » ;
    `wo(texte, fr)` pour un texte libre.
  - `HOUR_GREETING` (`SALUT` dans les fiches) : remplacé par la salutation de l'heure quand le personnage parle
    (`src/social/memory.ts`).
  - `QUICK_CHAT` : les phrases rapides du chat.

## Orthographe

Orthographe latine standard du wolof (CLAD, décret de 2005) :

- Voyelles : `a à e é ë i o ó u`. `ë` (« Jërëjëf »), `à` (« jàmm », « làmb »), `é` (« liggéey », « Déedéet »),
  `ó` (« góor-góorlu »).
- Consonnes : `ñ` (« Ñaata la ? »), `ŋ`, `x` (« xaalis », « Dama xiif »), `c` (« ceebu jën »), `j` (« jàpp »).
  Prénasales : `mb`, `nd`, `ng`, `nj` (« mbër », « Ndank ndank », « ngemb »).
- Voyelles longues doublées (`aa`, `ee`, `oo`, `uu`, `ée`) : « Waaw », « xaalis », « Toogal », « suukar ».
- Consonnes géminées doublées : « liggéey », « Dama sonn », « jàpp », « Wàññi ».
- Jamais d'orthographe à la française : pas de `ou`, `ch`, `dj`, `gn`, ni « Nanga def » en un mot
  (`tests/wolof.test.ts` le vérifie sur tout le lexique).
- Ponctuation française dans les textes du jeu : espace avant `?` et `!` (« Na nga def ? »).

## Registre

- Du wolof de Dakar, courant, court. Quand on hésite, on ne l'écrit pas.
- Pas d'insultes, pas de récitation religieuse, rien de sexuel ni de politique. « Salaam aleekum » est la salutation
  de tous les jours.
- Pas d'accent comique : on décrit une façon de parler, on ne l'écrit pas phonétiquement.

## Écrire une réplique

```ts
import { quote, say } from '../i18n/wolof';
line: `${say('Kaay lekk')}, ${say('sama doom')} ! Assieds-toi, ça mange bien chez Mame Diarra.`
// → « Kaay lekk (viens manger), sama doom (mon enfant) ! Assieds-toi, ça mange bien chez Mame Diarra. »
```

- Chaque expression vient du lexique : on l'ajoute d'abord dans `LEXICON`, puis on l'utilise. `tests/wolof.test.ts`
  vérifie que chaque `say(…)`, `quote(…)`, `lex(…)` et `ex(…)` des sources existe dans le lexique.
- La salutation et quelques mots en wolof, le reste en français.
- La glose suit l'expression moins évidente (« Toogal (assieds-toi) »). Les mots que tout le monde connaît restent
  sans glose : « Salaam aleekum », « attaya », « ceebu jën ».
- Une phrase rapportée se met entre guillemets avec `quote` : « Tu vas me dire « Wàññi ko tuuti » (baisse un peu) ? »

## Traduction affichée ou masquée

Téléphone › Réglages › Langue : « Français, expressions en wolof », et l'interrupteur **« Traduction des expressions
wolof : affichée / masquée »** (gardé sur l'appareil, clé `dakarrek.wolof.gloss`, accès au stockage protégé par
try/catch). La glose voyage dans le texte entre deux marques invisibles et elle est résolue à l'affichage
(`glossed`, appelé par les menus et les toasts du HUD) : l'interrupteur s'applique donc à toutes les répliques, même
celles écrites au chargement.

## Où le wolof est utilisé

| Endroit | Fichier | Exemples |
| --- | --- | --- |
| Fiches des personnages (3–4 expressions chacun, montrées dans Habitants › fiche, « Sa façon de parler ») | `src/social/profiles.ts`, `src/social/npcLife.ts` | Ibou : « Na nga fanaane ? », « Toogal », « Nit nitay garabam » ; Mamadou : « Dalal ak jàmm », « Mburu ak meew », « Yomb na » |
| Salutations des personnages, selon l'heure et ce qu'ils retiennent | `src/social/profiles.ts`, `src/social/memory.ts` | « Dalal ak jàmm ! Entre, regarde. » (Mamadou, à la place de « Jaaraama ») |
| « Discuter » : chaque personnage prend des nouvelles à sa façon (`pick('news', id)`) | `src/social/npcLife.ts` | « Lu bees ? », « Ana waa kër gi ? », « Naka liggéey bi ? » |
| Histoires | `src/social/beats.ts` | Accueil d'Ibou, « Daan naa ! » de Babacar, l'étal d'Adja |
| Situations (Maïga, attaya) | `src/social/situations.ts` | « Dama xiif… », « Toogal », « Ba ci kanam » |
| Lieux de la ville | `src/world/city.ts`, `src/world/cityContent.ts` | « Jën bu bees ! », « Dalal ak jàmm », « Kaay naan attaya » |
| Chat : réactions rapides | `src/multiplayer/chat.ts` | Na nga def ?, Jërëjëf, Waaw, Déedéet, Amul solo, Ba beneen yoon |
| Réglages › Langue | `src/ui/phone.ts` | interrupteur de traduction |

Hors périmètre pour l'instant : les noms des gestes et des danses de l'arène (« Mbakkou » garde son orthographe
actuelle) attendent la relecture des pratiquants de la làmb, comme les règles du combat.

## À vérifier d'un coup d'œil

Choix faits sans locuteur natif à côté. Tout le reste du lexique est du wolof très courant.

| Expression | Ce qui mérite un coup d'œil |
| --- | --- |
| « Na nga yendoo ? » (salutation du soir) | L'orthographe (yendu + e → yendoo) ; certains disent « Naka nga yendoo ? ». |
| « Ñu ngi fa » (réponse à « Ana waa kër gi ? ») | Réponse courte choisie ; on entend aussi « Ñu ngi fa rekk » ou « Ñu ngi la nuyu ». |
| « Ñibbil ak jàmm » (rentre bien) | Présent dans le lexique, pas encore utilisé dans une réplique. |
| « Kaay naan attaya » (viens boire l'attaya) | Formé sur « Kaay lekk » ; remplace l'ancien « Ñu naan attaya ». |
| « Gaawal » (dépêche-toi) | Forme impérative de « gaaw ». |
| « Daan naa » (j'ai gagné) | Littéralement « j'ai terrassé » : est-ce bien ce que dit un lutteur après sa victoire ? |
| « góor-góorlu » (se débrouiller) | Trait d'union et accents ; pas encore utilisé dans une réplique. |
| « bitig » (boutique) | Orthographe ; pas encore utilisé dans une réplique. |
| « Nit nitay garabam » | Découpage des mots (on voit aussi « Nit nit ay garabam »). |
| « Ndank ndank mooy jàpp golo ci ñaay » | Orthographe du proverbe. |
| Gloses « Dama sonn » = « je n'en peux plus », « Maleekum salaam » = « la paix sur toi aussi », « naaj » = « le soleil qui tape », « géew » = « le cercle de l'arène » | Gloses choisies pour rester courtes (et neutres en genre pour « Dama sonn »). |
| « ce xaalis », « la làmb », « un vrai mbër » | Article français devant un mot wolof : choix de style pour le mélange à la dakaroise. |

## Vérifications

- `tests/wolof.test.ts` : chaque entrée a `wo`, `fr` et des tags ; pas de doublon ; les réponses existent ;
  alphabet CLAD ; aucune trace des marques pulaar / sérère / diola retirées (« Jaaraama », TODO) ni des étiquettes
  « brouillon » dans `src/` ; la salutation selon l'heure ; le tirage avec graine ; la glose affichée et masquée ;
  chaque expression utilisée dans le code existe dans le lexique.
- `tests/npc.test.ts` : chaque fiche a des expressions du lexique ; Mamadou salue en wolof ; la salutation d'Ibou suit
  l'heure.
- `scripts/check-npc.mjs` : la fiche montre « Sa façon de parler » avec les gloses ; `scripts/check-phone.mjs` :
  l'interrupteur de traduction.
- Captures : `docs/screenshots/wolof/`.
