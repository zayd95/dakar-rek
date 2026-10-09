# Le wolof dans Dakar Rek

**Décision de Habib (9 octobre 2026).** « Je t'autorise à enrichir ton langage, librairie en wolof. We will go only with
Wolof for now. » — « C'est notre jeu, on crée nos règles. » Précision du même jour : le wolof est **contextuel**
(salutations selon l'heure, à la dibiterie, au marché, dans le car rapide, avec les voisins), **court et naturel** ; le
chat reste libre avec ses protections actuelles (bloquer, rendre muet, signaler) ; aucun texte religieux inventé.

Le jeu parle comme on parle à Dakar : en **français**, avec le **wolof de tous les jours** glissé dedans (la
salutation, un merci, un mot du marché ou de l'attaya). **Pas de pulaar, de sérère ni de diola pour l'instant** : une
fiche peut dire en français qu'un personnage les parle en famille (« Pulaar en famille, wolof avec les clients »), mais
il salue ses clients en wolof.

## Ce que le joueur voit et entend

| Où | Ce qui se dit | Fichier |
| --- | --- | --- |
| N'importe quel passant (« Saluer ») | Toi : « Salaam aleekum ! » · Awa : « Maleekum salaam ! », puis, pour la plupart des gens, la salutation de l'heure : « Na nga fanaane ? » (bien dormi ?) le matin, « Na nga def ? » l'après-midi, « Na nga yendoo ? » le soir — ou « Jàmm nga am ? » — et ta réponse « Jàmm rekk. ». Chaque personne répond toujours à sa façon (graine = son id). Resalué : la salutation de l'heure et sa réponse (« Maa ngi fi rekk. » ou « Jàmm rekk. ») | `src/interact/people.ts`, `src/i18n/lines.ts` |
| « Demander son nom » | « Naka nga tudd ? » — « Maa ngi tudd Awa. » ou « Awa laa tudd. » | idem |
| « Parler avec Awa » | Nouvelles (« Lu bees ? » — « Dara. », « Ana waa kër gi ? » — « Ñu ngi fa. », « Naka liggéey bi ? » — « Ndank ndank. »), la chaleur l'après-midi (« Dafa tàng ! » — « Dëgg la. »), l'invitation à manger aux heures des repas (« Kaay lekk ! » — « Jërëjëf, dama suur. ») | idem |
| « Dire au revoir » (après avoir salué) | « Maa ngi dem. Ba ci kanam ! » — « Ba beneen yoon ! » le jour ; « Fanaanal ak jàmm ! » — « Ba suba ! » la nuit | idem |
| Étal de Sandaga (« Vendre au marché ») | Une cliente : « Ñaata la ? » · Toi : « 1 500 F. Yomb na ! », ou « Seer na ! Wàññi ko tuuti. » · « Déedéet, 1 500 F rekk. » | `src/world/content.ts` |
| Marché au poisson de Soumbédioune (« Commander du poisson grillé ») | Le prix se discute avec la vendeuse, puis « Neex na ! » à la première bouchée | `src/world/cityContent.ts` |
| Boutique Diallo (« Pain et lait ») | « Ñaata la ? » — « 400 F. » (on ne marchande pas le pain) | idem |
| Recettes de lieux (Dibi, gargote, mosquée, plage, arrêt) | Dibi : « Xaaral tuuti ! » pendant la grillade, « Neex na ! », le patron « Dalal ak jàmm ! Toogal. », « Kaay fi ! » au grill. Gargote : « Kaay lekk ! ». Mosquée : seulement « Salaam aleekum. » — « Maleekum salaam. Jàmm nga am ? ». Mareyeuses : le prix se discute avant d'acheter ou de vendre ; « Jën bu bees ! ». Pêcheurs : « Kaay fi ! Gaawal ! ». Arrêt : « Vers Colobane, Petersen » et l'apprenti « Colobane ! Nanu dem ! » | `src/activity/templates.ts` (utilisé par les lanes lieux / transport) |
| Apprentis des cars rapides | Bulles : « Colobane ! Colobane ! », « Petersen ! Nanu dem ! », « Fan nga dem ? » | `src/actors/apprenti.ts` |
| Chat de lieu (version en ligne) | Phrases rapides selon le lieu et l'heure : « Salaam aleekum », salutation de l'heure, « Jërëjëf », « Waaw », « Déedéet », « Amul solo », au revoir de l'heure, plus deux qui vont avec le lieu (« Neex na », « Dama suur » dans une gargote ; « Ñaata la ? », « Wàññi ko tuuti » au marché ; « Nanu dem », « Maa ngi ñëw » dans un car rapide ; « Lu bees ? », « Maa ngi ñëw » dans la rue). Mosquée : salutation, merci, au revoir seulement. Envoyées telles quelles, glose en info-bulle. Aucune modération ajoutée ; bloquer / muet / signaler inchangés | `src/multiplayer/chat.ts` |
| Personnages (fiches, salutations, histoires, situations) | 3–4 expressions par fiche (« Sa façon de parler »), salutation de l'heure dans les répliques, Ibou « Dalal ak jàmm » et « Nit nitay garabam », Mamadou « Dalal ak jàmm ! », Adja « Wàññi ko tuuti ? Déedéet ! » | `src/social/*` |
| Lieux de la ville | « Jën bu bees ! », « Dalal ak jàmm », « Kaay naan attaya », « Mburu ak meew » | `src/world/city.ts`, `cityContent.ts` |
| Réglages › Langue | « Traduction des expressions wolof : affichée / masquée » | `src/ui/phone.ts` |

## La librairie

### Lexique : `src/i18n/wolof.ts`

- `LEXICON` : 104 entrées `{ wo, fr, tags, reply?, known? }` en orthographe CLAD. Une phrase commence par une
  majuscule (« Na nga def ? »), un mot seul est en minuscules (« xaalis »). `fr` est la glose courte ; `reply` la
  réponse habituelle ; `known` marque ce que tout joueur connaît (« Salaam aleekum », « Maleekum salaam », « attaya »,
  « ceebu jën ») : dit sans glose.
- Tags : `greeting`, `reply`, `thanks`, `farewell`, `yesno`, `ask`, `news`, `invite`, `market`, `food`, `attaya`,
  `work`, `money`, `encourage`, `lamb`, `weather`, `family`, `blessing`, `chat`, `proverb`, `sea`, `morning`,
  `evening`, `night`, `word`, `transport`.
- Aides : `greetingAt(heure)` (5–12 h « Na nga fanaane ? », 12–17 h « Na nga def ? », ensuite « Na nga yendoo ? »),
  `farewellAt(heure)` (« Fanaanal ak jàmm » de 20 h à 5 h, sinon « Ba ci kanam »), `greetingPair`, `replyTo`,
  `pick(tag, graine)`, `seedHash` (FNV-1a + mélange murmur : des graines proches se répartissent bien), `find`, `lex`,
  `byTag`, `say('Jërëjëf')` → « Jërëjëf (merci) », `quote(…)`, `wo(texte, fr)`, `glossOf`, `HOUR_GREETING` /
  `withHourGreeting` (le `SALUT` des fiches).

### Répliques : `src/i18n/lines.ts`

- `utter(phrases)` : une personne qui parle, « … », puis les gloses des phrases moins évidentes. Une phrase donnée en
  texte **doit** être une entrée du lexique (avec sa ponctuation : « Seer na ! ») ; une phrase avec un prix ou un
  prénom se donne en `{ wo, fr }`. `exchange([qui, phrases], …)` : « Toi : « … » · Awa : « … » ».
- Typographie française (`typo`) : espace fine insécable avant ? ! ; et insécable avant : et dans « » — un téléphone ne
  sépare jamais « Na nga def » de son « ? ».
- Passants : `greetLines`, `nameLines`, `smallTalkLines`, `farewellLines` (renvoient les lignes à montrer l'une après
  l'autre ; `People` les enchaîne toutes les 2,6 s).
- Prix : `haggleLine('buy' | 'sell', montant, graine, qui, marchander = true)`, `haggler(…)` (une ligne nouvelle à
  chaque fois), `price(n)` (même format que le HUD).
- Hôtes : `hostLine('dibi' | 'cook' | 'imam' | 'mareyeuse' | 'pecheur')`, `hostSays(…)`, `waitLine`, `tasteLine`,
  `comeLine`.
- Apprentis : `apprentiCalls(destinations)` (texte simple pour les bulles dessinées), `apprentiLine(destinations)`.
- Chat : `chatPlace(espace)` (`street`, `food`, `market`, `transport`, `mosque`, `club`, `home`), `quickChat(espace,
  heure)`.
- Horloge : `cityHour()` ; le module wolof la branche sur `GameCtx.hour` (le `setHour` de debug s'applique).

### Dans le cadre d'activités

- `Step.line` (`src/activity/types.ts`) : ce qui est dit quand l'étape commence (affiché comme un toast par le runner).
  Texte fixe ou fonction (une ligne nouvelle à chaque fois).
- Primitives (`src/activity/primitives.ts`) : `line` sur toute activité (première étape), `eatLine` pour `order`,
  `haggle` pour `buy` / `sell` (une étape « On discute le prix » avant), `talkFirst(activité, ligne)`.
- Les primitives restent sans langue : ce sont les recettes et le contenu qui choisissent les lignes.

### Gloses affichées ou masquées

Téléphone › Réglages › Langue : « Traduction des expressions wolof : affichée / masquée » (clé
`dakarrek.wolof.gloss`, accès au stockage protégé par try/catch). La glose voyage dans le texte entre deux marques
invisibles (U+2063 … U+2064). **Un seul endroit la résout pour toute la page** : le module wolof
(`src/i18n/module.ts`, inscrit dans `src/game/modules.ts`) installe un `MutationObserver` (`src/i18n/dom.ts`) qui
résout chaque texte avant qu'il soit peint — toasts, menus, invites, barre de progression, téléphone — sans qu'aucun
fichier d'interface ait besoin de connaître les gloses (`src/ui/hud.ts` n'est pas modifié). Les bulles dessinées sur
canvas (apprentis) sont écrites sans glose.

## Orthographe

Orthographe latine standard du wolof (CLAD, décret de 2005) :

- Voyelles : `a à e é ë i o ó u`. `ë` (« Jërëjëf »), `à` (« jàmm », « làmb »), `é` (« liggéey », « Déedéet »),
  `ó` (« góor-góorlu »).
- Consonnes : `ñ` (« Ñaata la ? »), `ŋ`, `x` (« xaalis »), `c` (« ceebu jën »), `j` (« jàpp »). Prénasales : `mb`,
  `nd`, `ng`, `nj`.
- Voyelles longues et consonnes géminées doublées : « Waaw », « Toogal », « liggéey », « Wàññi ».
- Jamais d'orthographe à la française : pas de `ou`, `ch`, `dj`, `gn`, ni « Nanga def » en un mot.
- Ponctuation française : espace avant `?` et `!` (« Na nga def ? »).
- Les noms propres gardent leur graphie d'usage (Banque Teranga, écurie Teranga, Ouakam, Guédiawaye, Aïssatou) ; ce ne
  sont pas des répliques wolof.

## Registre

- Du wolof de Dakar, courant, court. Quand on hésite, on ne l'écrit pas.
- Pas d'insultes, rien de sexuel ni de politique, pas d'accent comique.
- **Mosquée et religion** : la salutation de tous les jours seulement (« Salaam aleekum », « Jàmm nga am ? »). Aucun
  verset, aucune invocation, aucune formule religieuse (pas de « alxamdulilaay », « inshaa Allaah », etc.) ; les
  étapes ablutions et prière ne disent rien. Un test le vérifie.

## Écrire une réplique

```ts
import { exchange, haggler } from '../i18n/lines';
import { say } from '../i18n/wolof';
line: `${say('Kaay lekk')}, ${say('sama doom')} ! Assieds-toi.`          // « Kaay lekk (viens manger), sama doom (mon enfant) ! »
line: () => exchange(['Le patron', ['Dalal ak jàmm !', 'Toogal.']])      // Le patron : « Dalal ak jàmm ! Toogal. » (bienvenue · assieds-toi)
P.buy({ id: 'poisson', label: 'Acheter un poisson', price: 700, items: { poisson: 1 }, haggle: haggler('buy', 700, 'La mareyeuse') })
```

1. L'expression entre d'abord dans `LEXICON` (avec sa glose), puis on l'utilise.
2. La salutation et quelques mots en wolof, le reste en français ; une ligne = un toast, deux personnes.
3. Les mots que tout le monde connaît restent sans glose (`known`).

## Laissé de côté exprès

| Expression | Pourquoi |
| --- | --- |
| « Ndaw ! » dans les cris des apprentis | Pas sûr que ce soit un cri d'apprenti ; retiré (remplacé par « Nanu dem ! » et « Fan nga dem ? »). |
| « Am na palaas » (il y a de la place) | Graphie de l'emprunt pas assez sûre. |
| « Yow nag ? », « Yow itam » (et toi ? / toi aussi) | Tournures plausibles mais non vérifiées ; les échanges s'en passent. |
| « Ñibbil ak jàmm » (rentre bien) | Dans le lexique depuis le premier passage, jamais utilisé dans une réplique ; à confirmer. |
| « Gaal yi ñëw nañu », « Jën bu bees la » | Phrases construites, pas assez sûres ; on garde « Jën bu bees ! ». |
| Toute formule religieuse | Règle du jeu : pas de texte religieux inventé. |
| Pulaar, sérère, diola | Décision de Habib : wolof seulement pour l'instant. |

## À vérifier d'un coup d'œil

Choix faits sans locuteur natif à côté. Tout le reste est du wolof très courant.

| Expression | Ce qui mérite un coup d'œil |
| --- | --- |
| « Na nga yendoo ? » (salutation du soir) | L'orthographe ; certains disent « Naka nga yendoo ? ». |
| « Ñu ngi fa » (réponse à « Ana waa kër gi ? ») | On entend aussi « Ñu ngi fa rekk ». |
| « Awa laa tudd. » / « Maa ngi tudd Awa. » | Les deux formes sont utilisées au hasard (stable par personne). |
| « Jàmm rekk » en réponse à « Na nga def ? » | Utilisé pour la moitié des passants (l'autre moitié : « Maa ngi fi rekk »). |
| « Kaay naan attaya » (viens boire l'attaya) | Formé sur « Kaay lekk ». |
| « Gaawal » (dépêche-toi) | Forme impérative de « gaaw ». |
| « Daan naa » (j'ai gagné) | Littéralement « j'ai terrassé ». |
| « Nit nitay garabam », « Ndank ndank mooy jàpp golo ci ñaay » | Découpage et orthographe des proverbes. |
| « 1 500 F rekk » (1 500 F seulement) | Mélange chiffre + « rekk », à la dakaroise. |

## Vérifications

- `tests/wolof.test.ts` : lexique (gloses, tags, doublons, réponses, alphabet CLAD), pas de traces pulaar / sérère /
  diola ni « brouillon », salutation selon l'heure, tirage avec graine, gloses, chaque `say` / `quote` / `lex` / `ex`
  des sources existe dans le lexique.
- `tests/wolof-lines.test.ts` : chaque ligne que la librairie peut produire (plus de 5 000 : passants à toutes les
  heures, prix, hôtes, apprentis) n'utilise que des phrases du lexique ; le wolof entre guillemets est en CLAD (pas de
  `ou`, `ch`, `dj`, `gn`, jamais « Nanga ») ; espaces françaises et insécables ; la mosquée ne dit que la salutation ;
  recettes et runner disent leurs lignes ; les passants (salut, suite de l'heure, nom, au revoir) ; résolution des
  gloses ; aucune graphie à la française du wolof dans `src/` et le wolof cité garde l'espace avant ? et !.
- `tests/npc.test.ts` : chaque fiche a des expressions du lexique ; la salutation suit l'heure.
- `scripts/check-wolof.mjs` (navigateur, bureau 1280×720 et téléphone 390×844) : salutation, suite selon l'heure,
  nom, salutation du soir, au revoir de nuit, gloses masquées, Sandaga, Soumbédioune, Boutique Diallo, Ibou, Mamadou,
  fiche de Mame, Réglages › Langue ; avec `--chat=<url wrangler>` : phrases rapides selon le lieu et l'heure, envoi
  tel quel, outils de blocage présents. `scripts/check-interact.mjs` vérifie l'échange « Salaam aleekum ! » —
  « Maleekum salaam ! ».
- Captures : `docs/screenshots/wolof/`.
