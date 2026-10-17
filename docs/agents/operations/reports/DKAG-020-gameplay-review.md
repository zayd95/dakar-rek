# DKAG-020 — revue QA indépendante finale

Reviewer : `qa_dkag020_ci_0236`, distinct de l’auteur `gameplay_dkag020_0128`. Verdict : **READY** comme candidate isolée vérifiée, non fusionnée, non déployée et non publiée.

## Autorité et portée

J’ai lu via GitHub, au commit de contrôle exact `950affc199afe58e49184ebbcdc3ce32cf35abbf`, `AGENTS.md`, `docs/agents/STUDIO.md`, `docs/agents/STATE.json`, `docs/agents/operations/RUNBOOK.md`, `docs/agents/operations/QUEUE.json`, `docs/agents/roles/qa.md` et la revue DKAG-020 initiale. La réservation limite cette revue au présent rapport ; aucune source, ref, PR ou conversation GitHub n’a été modifiée.

Source examinée : `9632c7666cf76dbd23a8de4b50d44c31fe85e07e`, base `e6c678a0e0ab9c6d5a000c58740b6231d59cf187`. GitHub compare indique `ahead_by: 1`, `behind_by: 0`. La PR brouillon [#20](https://github.com/zayd95/dakar-rek/pull/20) est ouverte, non fusionnée, mergeable, avec cette base et cette source exactes.

## Diff et critères

Le diff contient exactement les cinq fichiers autorisés : `src/ui/placeSummary.ts`, `tests/place-summary.test.ts`, `src/main.ts`, `scripts/check-city-life.mjs` et `docs/agents/reports/DKAG-020-gameplay.md` (150 ajouts, 2 suppressions). La lecture du patch confirme :

- le répertoire dérive les activités visibles des objets `Action` actuels, avec coût/gain, durée ou menu dédié, effets et motif d’indisponibilité ;
- les actions invisibles sont filtrées avant leurs prérequis ; six tests unitaires couvrent valeurs courantes, wallet, repos, invisibilité, priorité du prérequis et flux spécial ;
- `src/main.ts` ne reçoit qu’un import et le remplacement du texte générique par le formatter ; `onPick` reste repère + fermeture + toast ;
- le script navigateur conserve la suite existante et ajoute des assertions desktop/tactile pour travail, nourriture, repos, indisponibilité et absence d’effet wallet/besoins/compteurs/save du repère ; aucune assertion n’est supprimée.

Aucun défaut statique reproductible n’a été trouvé contre les cinq critères d’acceptation.

## Preuves exactes

Outils/lectures : GitHub `fetch_file`, `compare_commits`, `fetch_pr_patch`, `get_pr_info`, `fetch_workflow_run_jobs`, `fetch_workflow_job_logs` et `fetch_workflow_run_artifacts`.

Run PR `38192271378`, job `114627363316`, head exact `9632c766…` : **completed/success**. Toutes les étapes sont `success` : checkout, `npm ci`, tests, typecheck serveur, build, installation Chromium, `check:city`, `check:online`, `check:launch` et upload d’artifact. Les logs attestent 13/13 fichiers et **128/128 tests**, dont 6/6 pour le formatter. `check:city` atteste sur desktop et profil phone/touch l’aperçu travail, le repère sans effet, le motif d’indisponibilité, l’aperçu repos, le repos réel sans coût, l’aperçu nourriture et l’absence d’erreur JavaScript. `check:online` et la suite complète `check:launch` finissent également sans erreur navigateur. Artifact `11722366741`, 19 785 532 octets, digest `sha256:dfef8951f8f892cbfd957cc5628e34c09a2a8a25e33fa2051ae504c6c7d1ad1d`, non expiré.

Run push `38192251481`, job `114627304089`, même head exact : **completed/failure** — il n’est pas compté vert. Tests 128/128, typecheck serveur, build et installation Chromium réussissent. `check:city` passe les assertions desktop jusqu’à l’aperçu repos, puis échoue par `TimeoutError` de 30 s à `scripts/check-city-life.mjs:100` pendant l’attente de fin de l’activité repos ; `check:online` et `check:launch` sont donc skipped. Artifact diagnostic `11722455497`, 107 806 octets, digest `sha256:1c54cf161d57e474c7e16d2a9a39bd2644dc020d224c9368e683548b69bb102b`, non expiré.

Réconciliation : l’échec push est réel et conservé comme tel. Il survient sur une attente temporelle après plusieurs assertions réussies, tandis que l’exécution PR ultérieure sur le **même commit** réussit cette assertion en desktop puis en phone/touch et achève les deux suites navigateur restantes. Cette preuve complète exacte satisfait le critère CI sans prétendre que les deux runs sont verts. Aucun correctif produit n’est justifié par un défaut reproductible observé ici.

## Décision et limites

**READY.** La candidate satisfait les critères avec diff borné, tests unitaires exacts et une exécution PR complète verte au SHA gelé. Le run push demeure explicitement en échec transitoire de timing et n’est pas utilisé comme preuve verte.

Limites : cette session n’a pas exécuté un navigateur local indépendant ; elle audite les logs CI exacts. Le profil `phone` est un viewport/touch Playwright, pas un appareil physique. Les prix, effets d’équilibre et libellés français restent fictifs et **unverified** ; aucune revue humaine sénégalaise nommée, donc aucune attestation `practitioner-approved`. READY signifie candidate vérifiée seulement : aucun merge, déploiement ou publication.

Prochain propriétaire : producteur. Enregistrer les deux conclusions CI sans effacer l’échec push, qualifier DKAG-020 `done`/candidate vérifiée et libérer la lease par CAS. L’intégration éventuelle reste à la discrétion du propriétaire de `wip/visual-pass`.
