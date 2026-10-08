# Intégration des lots parallèles — 8 octobre 2026

Branche : `wip/visual-pass` (PR [#1](https://github.com/zayd95/dakar-rek/pull/1) vers `main`). Chaque push sur cette branche
republie la recette publique (Cloudflare Workers Builds, voir `docs/LAUNCH.md`).

Le document « Dakar Rek — vie, économie, arène » a été découpé en cinq lots, construits en parallèle dans des copies de
travail séparées puis fusionnés ici, **par-dessus la ville habitée** (`4cae576`, `docs/CITY_LIFE.md`) et les textures du
lot Higgsfield 3. Aucun travail n'a été écrasé : les conflits (surtout `src/main.ts`) ont été résolus en gardant chaque côté.

| Lot | Branche fusionnée | Contenu |
| --- | --- | --- |
| A1 — Téléphone | `phone/lot-a1` | Téléphone en jeu à la place de l'ancien menu système |
| B — Première ascension | `worktree-agent-afdd…` | Tiak Tiak à pied, historique du portefeuille, meubles, sauvegarde v3 |
| C — Premier duel | `lot-c/premier-duel` | Combat de làmb local approfondi, trois modes, trois styles |
| D — Vie des PNJ | `worktree-agent-acd0…` | Fiches, routines, mémoire, situations, famille Diallo |
| A2 — Discussion | `lane/chat` | Chat texte entre joueurs (version en ligne) |

## Branché sur la ville existante

- **Téléphone** : tuile « Coins du quartier » et bouton « Choisir un repère à pied » dans Carte → répertoire et repère de
  marche de la ville (`openPlaces`), sans téléportation.
- **Économie** : tout mouvement d'argent passe par `GameState.addMoney(montant, libellé)` — repas, car rapide, petits
  boulots, services payés des nouveaux lieux (débarquement à Soumbédioune, mall, banque, Boutique Diallo…), achats, histoires,
  situations, livraisons, meubles. L'app Travail liste Tiak Tiak et les services payés du quartier et pose le repère de
  marche. Les livraisons relient des lieux existants (gargotes, dibiteries, Maïga, Boutique Diallo, Salon Awa, banques,
  places, Sandaga, Atelier Ndeye, Dakar Réparation).
- **PNJ** : la famille peule Diallo tient la Boutique Diallo existante (« Jaaraama » déjà présent réutilisé) ; Ndeye tient
  l'Atelier Ndeye ; routines sur la grand-place (attaya), la place de la Médina, Fann et la plage.

## Correction transversale

- **Genoux à l'envers des personnages assis** : l'animation `Sit` exportée pliait le genou vers l'avant (tibias le long du
  buste). Au chargement, la rotation du tibia est inversée tant qu'elle reste fausse (`fixSitKnees`,
  `src/actors/humanoid.ts`) ; test sur le squelette livré (`tests/humanoid.test.ts`). Une seule animation assise pour tous :
  habitants, dibiterie, avatars distants et PNJ récurrents.

## Contrôles (session cloud, Chromium + SwiftShader, pas un téléphone)

| Contrôle | Résultat |
| --- | --- |
| `npx tsc --noEmit`, `npm run typecheck:server`, `npm run build` | OK |
| `npm test` | 92/92 (10 fichiers) |
| `scripts/check-phone.mjs` | 55/55 (bureau, 390×844, paysage) |
| `scripts/check-economy.mjs` | 48/48 |
| `scripts/check-lamb.mjs` | 24/24 |
| `scripts/check-npc.mjs` | 48/48 |
| Version en ligne, test de chargement (bureau + téléphone) | sans erreur ; Chat, Messages, Travail, Habitants, Quartier présents |
| `npm run check:online`, `npm run check:chat`, `npm run check:city` | en cours au moment de ce commit ; résultats ajoutés ensuite |

La machine était très chargée pendant le travail parallèle (charge 12–16 sur 4 cœurs, moins d'une image par seconde en
rendu logiciel) : certains délais fixes des contrôles (marche dans le mall de `check:city`, attente « en ligne » de
`check:online`) ont expiré sous cette charge, sur la nouvelle version comme sur la version de base ; ils passent une fois la
machine au calme.

## État des fonctions

| Fonction | État |
| --- | --- |
| Téléphone (Portefeuille, Carte, Arène, Carnet, Aide, Réglages, apps des modules) | **Intégré, testé** |
| Tiak Tiak à pied, app Travail, historique du portefeuille, meubles de la chambre, sauvegarde v3 avec migration | **Intégré, testé** ; prix et salaires **provisoires** (`src/economy/config.ts`) ; **local à l'appareil, pas de ledger serveur** |
| Combat de làmb local : arbitre, chrono 90 s, garde, saisie, fenêtre de réaction, ouvertures, dégagement, abandon, récapitulatif ; entraînement guidé, amical, classé ; trois styles d'adversaires fictifs | **Intégré, testé** ; **règles provisoires sans frappe**, à valider par des lutteurs (`docs/LAMB_RULES_PROVISIONAL.md`) |
| PNJ : fiches, routines horaires, déplacement sur le trottoir, mémoire (habitué après 3 visites, présentations), situations (repas à la Maïga, attaya, service rendu), famille Diallo, Ndeye | **Intégré, testé** ; textes **brouillon à relire par Habib** ; expressions wolof/pulaar/sérère laissées en TODO (aucune invention) |
| Chat texte entre joueurs : proximité 30 m avec bulles, messages privés dans le groupe, muet / bloquer / signaler, limites et dédoublonnage côté serveur | **Intégré, testé en local** (runtime Workers, deux clients) ; signalements journalisés, **pas encore de file de modération** ; pas testé sur de vrais téléphones |
| Duel synchronisé entre deux joueurs, économie partagée, dons/prêts, propriétés | **À construire** : état de match et ledger côté serveur, opérations atomiques et idempotentes |
| Notes vocales, discussions de groupe, visites de logement entre joueurs | **À construire** |
| Mesures sur de vrais téléphones | **À faire** |

## À vérifier

- La garde de lutte (`Stance`, `Grab`) semble, d'après la cinématique du squelette, plier aussi le genou à l'envers ; à
  confirmer par une vue rapprochée avant de corriger.
