# DKAG-018 — revue QA indépendante

## Verdict

**BLOCKED — harnais CI PR non fiable ; aucun défaut produit DKAG-018 démontré.**

La géométrie et les parcours sont positivement prouvés par le workflow push exact au SHA auteur et par ses captures. La candidate ne reçoit toutefois pas le statut READY : le contrôle PR échoue deux fois sur son délai fixe de 3 secondes et empêche les suites suivantes. DKAG-018 reste en `review/blocked_ci_harness`, sans troisième correction auteur, sans fusion ni déploiement.

## Source et périmètre revus

- Branche : `codex/agents/dkag-018-arena-billboard-offset`
- SHA auteur : `17108c2039cfef85bffdc592fbab7081e32a5c0f`
- Base PR #10 : `e4f1c291117fb61633d169a008823efd59dce19f`
- PR brouillon : #16
- Auteur : `world_dkag018_2236`
- QA finale : `qa_dkag018_final_0336`

Le diff ne contient que `src/world/builder.ts`, `scripts/check-v1-core.mjs` et `docs/agents/reports/DKAG-018-world.md`. Aucun package, workflow, protocole, schéma, asset, économie ou règle culturelle n'est modifié. Le panneau est déplacé de 17 m hors de l'axe ; le couloir de 3,8 m conserve 2,8 m utiles après prise en compte du rayon joueur de 0,5 m.

## Preuve fonctionnelle exacte

Push `37856142783`, job `113580664936`, artifact `11584073506`, digest `2fabaa24a3cce27789cb3bb36878802cc52b61f4f2d0b0aaf90ac82d50d53cdb` : **success**.

- 34/34 tests, typecheck serveur et build réussis ;
- mosquée/publicités, online, launch et gameplay complet réussis ;
- axe arène -3/0/+3 m stable ;
- desktop moyen : arène (30,-64) → (30,-58,96), panneau (47,-63,9) → (47,-56,62) ;
- tactile bas CDP 390×844 : arène (30,-64) → (30,-57,75), panneau (47,-63,9) → (47,-55,41) ;
- quatre captures cadrent porte/ring ou panneau avec le bon prompt ;
- aucune erreur navigateur.

Ce viewport tactile n'est pas un appareil physique.

## Blocage PR reproductible

Run PR `37856146883`, commit synthétique `a7d637bf6b03b9374afcbce215be0d9cd8675433`. Son arbre `0066113d692fcff36e6baea064f2e5bf74dbbcba` est identique à l'arbre auteur.

- tentative 1, job `113580679139` : 34/34, build/typecheck et axe -3/0/+3 réussis, puis timeout 3 s sur la première marche ; online/launch sautés ;
- tentative 2 sans modification, job `113658491542` : même résultat au même point.

Aucune assertion fonctionnelle ne produit false et le run push du même arbre passe toute la marche. Le défaut démontré est le délai du harnais sous le runner PR, mais sa répétition interdit de classer la PR READY.

## Action suivante

Les deux corrections DKAG-018 sont consommées. Ne pas faire une troisième correction sur cette tâche. DKAG-019 doit fiabiliser seulement `scripts/check-v1-core.mjs`, conserver le seuil >3,5 m et toutes les assertions, puis obtenir un run push vert et un run PR vert sur le même arbre avant requalification.
