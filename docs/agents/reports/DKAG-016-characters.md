# DKAG-016 — Retour facultatif vers Ibou

Auteur : `characters_resume_1655`. Date : 8 octobre 2026. Statut : réalisation locale figée, **review** ; QA distincte et CI au commit publié restent à vérifier par le producteur. Aucun merge ni déploiement. Dialogue fictif français `unverified`.

## Périmètre et résultat

Base exacte `0af76c38b152df885c0c27352aa43ac320aa71af`, checkout isolé `/workspace/scratch/5677b8b0fdd0/ibou-candidate`. Briefs AGENTS/STUDIO/RUNBOOK/Personnages lus entièrement dans `ibou-task-context.json`, contrôle `c089dce66e972d8785208e0cb64055ddb954430f`, affectation/lease DKAG-016 au registre `e3cdf9ad3c697a51d50bca3766f6ea51364befda`. Coordinateur seul responsable des commits et CAS GitHub.

- `src/social/beats.ts` : beat final `ibou_modou_followup` après tous les beats préexistants. Accueil achevé + `modou_trust` nécessaires ; `shifts` ne suffit pas. Confirmation +2 relation joueur–Ibou, flag et choix achevé ; report sans aucun effet. Garde spécifique contre préconditions perdues, rejeu, choice étrangère/clonée et beat cloné. Autres beats et économie inchangés.
- `tests/social.test.ts` : cinq tests nouveaux couvrant chaque porte, state entier avant/après, cinq reports neutres, double/rejeu, reload/migration, choice étrangère, clone et ordre exact de tous les beats.
- `scripts/check-ibou-followup.mjs` : parcours réel menus clavier et tactile, sauvegarde/reload UI, confirmation double et ancien bouton. Seuls le placement et la qualité sont des fixtures ; pas de completion injectée. Toutes les requêtes extérieures sont bloquées, assets compilés servis par interception locale.

Pas de modification cast, relations, main, world, packages/lock, schema, workflows, assets ou sources Combat/Réseau. Ancre Ibou et chat actuels conservés.

## Vérifications réellement exécutées

Environnement Node `v24.19.0`, dépendances lock installées par `npm ci --offline` (96 packages), Vitest `2.1.9`, Vite `5.4.21`, Chromium installé `1194`.

| Commande | Résultat |
| --- | --- |
| `npm test` | 37/37, cinq fichiers ; sociaux 20/20 dont cinq nouveaux |
| `npm run build` | PASS, comprend `tsc --noEmit` puis build Vite ; 43 modules |
| `npm run typecheck:server` | PASS |
| `git diff --check` | PASS |
| `node scripts/check-ibou-followup.mjs /workspace/scratch/5677b8b0fdd0/ibou-evidence` | PASS, 22/22 : 11 desktop + 11 tactile |

Résultats navigateur et deux captures locales : `/workspace/scratch/5677b8b0fdd0/ibou-evidence/results.json`, `desktop-ibou-followup.png`, `touch-ibou-followup.png`. Pas de mesure sur téléphone physique ; viewport tactile seulement. Pas de validation culturelle, CI GitHub ou publication revendiquée ici.

Deux corrections ciblées du harness après vrais échecs : le premier sélecteur exact ignorait le suffixe « Histoire » du bouton ; remplacé par préfixe. Ensuite la comparaison state entier détectait que `saveNow()` synchronisait une position fixture non encore sauvegardée ; le harness sauvegarde désormais cette position par le menu avant snapshots. Assertions entières conservées, aucun effet ni assertion supprimé pour passer. Troisième exécution complète PASS, aucune correction de source après échec.

## Sources figées pour handoff

SHA-256 des fichiers exécutés :

```
064ce220ba669b8d11fccaa8eb5c92156548c5a2bec04c431c3e3d5fccfa0bbb  src/social/beats.ts
d6a60b1aad137329bdabb58d5f2a5b82133cf89e8e9dd3c10592ad9b24f21320  tests/social.test.ts
3c2e84bfc45466156dd5b1354c1a53541d07c03b3d5f1bf07fa41f2f601278ca  scripts/check-ibou-followup.mjs
```

Prochain propriétaire : producteur pour commit CAS et PR brouillon, puis `qa_ibou_1701` pour revue et exécution indépendante au SHA publié. Plus petite action : publier seulement les quatre fichiers réservés et transmettre leur SHA exact à QA ; aucune auto-approbation par l'auteur.
