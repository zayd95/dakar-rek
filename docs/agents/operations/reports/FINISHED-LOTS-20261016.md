# Expériences finies — propositions à approuver, 16 octobre 2026

Statut : propositions uniquement, aucune réalisation commissionnée. Producteur producer_audit_1237.
Instruction Habib : qualité/profondeur avant expansion ; viser environ deux heures VOLONTAIRES par session, sans les promettre.
Aucun lot ci-dessous n'autorise nouvelle fonctionnalité, nouvel agent de feature, fusion, déploiement, Blender ou dépense.
Les budgets sont des plafonds proposés de travail humain/agent pour une première passe d'audit/recette, non des crédits consommés ni des engagements de livraison. Toute extension de périmètre revient à Habib avant réalisation.

## Versions et preuves inspectées
Candidate36 :0966eea94f0dfe0688d4a44fc71f4ad4bb87f73c ; release f2335f177f2b8f56b9d3ce3bb83d4e583888b121 ; Pikine0e8fce6ac19257f2b762b608e62c0a35d0a7b67d ; Tiak1f5ab88554f9e45f57a64a442903aafef6867ab8.
Magic Land33 :e494be1e7d4e466918b81977dbbfbb1bda8b1b71, Lite, pas inclus dans36. Port34 :b3314813f816791a7960aafa3fdd658b10169088, prototype opt-in, pas inclus dans36.
Sources lues au SHA36 : src/core/save.ts ; tests/oldSaves.test.ts ; sections sauvegardes de tests/core.test.ts et tests/assets.test.ts ; docs/ARENA_VISIT.md, docs/LAMB2.md, docs/TRANSPORT.md, docs/CAREER.md, docs/CITY_LIFE.md.
Descriptions33/34 et CI actuelles relues GitHub. Les documents peuvent garder une formulation historique : présence d'une description ou de captures n'est pas preuve d'acceptation actuelle.
CI36 générale verte ; recette ciblée ownership/Pikine non établie indépendamment. CI33 : push vert / PR timeout rouge ; CI34 : deux jobs rouges (budget rendu et timeout déjà audités). Aucune nouvelle panne reproduite ici.

## Sauvegardes v3→v5 : audit statique borné
Le chargeur utilise migrate sur JSON local puis GameState. Schema5, monnaie bornée entière, besoins bornés, id invité conservé, ledger/deliveries/flags/relations repris. v3/v4 : meubles convertis en assets et entreprises converties en unités, clocks bornées au temps joué ; inv:<id> devient inventory, services devient service. Les nouveaux champs carrière restent additifs. resumeSpot conserve le point dans les bornes sinon spawn, sans modification du wallet.
tests/oldSaves.test.ts possède de vraies fixtures v1/v2/v3/v4/v5 et vérifie chargement, argent, hub/position, champs carrière et protocole. v4 vérifie entreprises/meubles/inventaire/relations/livraisons. tests/assets.test.ts vérifie v4, placement, aller-retour v5 et achat rechargé sans double paiement. tests/core.test.ts vérifie storage, corruption et rejet du schema futur.
Ce n'est pas une certification exhaustive : je n'ai pas exécuté ces tests localement (local_not_run) ; la CI agrégée verte ne remplace pas une recette utilisateur de migration.
Recette encore à produire au SHA36 : copies jetables des fixtures v3 et v4 → chargement → sauvegarde5 → rechargement répété, comparer wallet/ledger/inventaire/UID/assets/logement/placements/clock/jobs.done/active/carrière ; achat unique et livraison payée une seule fois à travers un redémarrage ; quota/storage refusé et JSON corrompu traités sans écrasement silencieux. Ces derniers points sont des critères de vérification, PAS des défauts déjà démontrés.
Ne jamais employer ni remplacer une vraie sauvegarde Habib comme fixture. Conserver les octets d'entrée pour comparaison. Aucun schema/protocole nouveau.

## Lots proposés — approval_required

| Lot borné | Lacune précise actuelle | Critères de fin proposés | Plafond première passe |
| --- | --- | --- | --- |
| S0 · sauvegardes et ownership | Preuves unitaires présentes, parcours navigateur de migration/achat/reload non vérifié indépendamment à0966 | Recette v3/v4/v5 ci-dessus, aucun argent/objet perdu ou dupliqué ; arrêt/reprise au même jalon ; logs SHA+environnement, assertions inchangées ; QA distincte | 0,5 jour audit/test, 1 retour ciblé |
| A1 · soirée arène existante | Beaucoup de séquences documentées, profondeur volontaire et reprise carrière non mesurées ; animations provisoires, pas d'attestation culturelle humaine | Choisir l'expérience existante avec/sans frappe avant travail ; entrée/ticket une fois/apprentissage/combat/résultat/revanche ou prochain objectif/retour libre, sauvegarde et tactile vérifiés ; retour joueur compréhensible sans aide ; aucun combat forcé pour meubler le temps | 1 jour de recette/design borné, pas nouvelle mécanique |
| M1 · Magic Land Lite | Roue1,5 tour, bateau≈25s, baby-foot contre bot : pas de second joueur réseau ; les attractions ne prouvent pas progression longue ni parc terminé | D'abord stabiliser la Lite : paiement une fois, refus fonds insuffisants, annulation/interruption, descente sûre, rechargement sans coincer ni repayer, kiosque et partie complète tactile ; décider ensuite par approbation séparée de ce qui manque à une version finie, sans transformer la Lite en promesse2h | 1 jour de recette, arrêt si CI rouge non résolue |
| T1 · transport/Tiak | Car rapide intra-hub réel, trajet inter-hub distinct ; trajet interrompu reprend au prochain arrêt ; carrière livraison complète pas indépendamment reçue | Départ à pied→moto/arrêt→paiement→trajet→livraison/destination→retour, annulation/app en arrière-plan, reload milieu trajet, coût/paiement unique ; tests deux clients sans moto fantôme ; pas de BRT/taxi nouveau | 0,5–1 jour recette |
| V1 · vie quotidienne | Activités temporisées et besoins existent, durée volontaire/diversité des choix non mesurées ; Ibou/welcome ne prouve pas sa chaîne entière | Nouvelle partie→Ibou→premier service→repas Dibi/Maïga→repos→objectif suivant ; aucun cercle d'objectif, argent/besoins lisibles ; achat et paiement une fois ; pause libre, aucun délai artificiel ni obligation religieuse | 0,5 jour observation + liste défauts bornée |
| E1 · économie/logement | Parcours achat/location/meubles présent ; banque décorative ne signifie pas compte/crédit ; équilibre sur120min non mesuré | Gagner par activités existantes→choisir achat/location→meubler→recharger→se déplacer/revendre, vérifier soldes et loyers ; au moins3 fixtures existantes de soldes/patrimoine, pas de nouveau profil, pas monnaie debug dans l'essai joueur ; relever temps réel vers premier objectif et causes d'échec sans changer les prix automatiquement | 1 jour simulation/recette |
| L1 · lieux sociaux | Attaya/dames observées, pas mini-jeu de dames interactif selon doc ; réactions sociales locales≠activité réseau finie | Pour chaque lieu retenu, début/choix/conséquence/sortie/reprise et feedback clair, en solo puis2clients si déjà supporté ; prouver ce qui est réellement partagé ; ne pas ajouter mini-jeu/réseau sans approbation | 0,5 jour inventaire/recette |
| P1 · port, seulement si retenu | Prototype opt-in, CI budget medium274>270 et timeout online ; géographie/device/retour et actions spécialisées incomplets | Décider inclusion/exclusion avant investissement ; si inclus, d'abord CI complète et budget inchangé, parcours Plateau→quai→action existante→retour/hub/reload, aucune duplication économique ; recette physique et revue géographie distinctes | 0,5 jour diagnostic initial, stop si extension nécessaire |

Un seul lot de réalisation à la fois après approbation, chemins et propriétaire réservés ; reviewer distinct. Pas de relance d'agents sans travail utile. Maximum deux corrections ciblées après échec démontré ; pas suppression d'assertion ou hausse silencieuse d'un budget pour passer.

## Ce que signifie environ deux heures
Aucune mesure actuelle ne prouve120min d'engagement. Additionner durées de manèges, attendre la nuit, ralentir marche ou hausser grind n'est pas de la profondeur.
Proposition de recette (à approuver, sans nouveau service analytique) :3–5 volontaires consentants, notes manuelles de début/fin, activités choisies, objectifs compris, départs et raisons ; reprise sauvegardée au moins une fois. Observations sans argent/debug/fast-forward. Cible exploratoire proche120min, pas obligation de rester ni garantie statistique ; si départ avant, noter pourquoi plutôt que bloquer la sortie.
Budget proposé : une session observée par volontaire, puis une synthèse des3 lacunes dominantes. Aucun paiement/recrutement/outil payant autorisé.

## Quatre états non interchangeables
1. Techniquement validée : contrôles et QA au SHA dans un périmètre nommé, avec limites restantes.
2. Jeu complet : expériences majeures choisies finies, objectifs et progression reçus ; non établi.
3. Prêt au lancement public : décision explicite Habib après qualité, produit, sauvegardes, tactile/performance ; non établi.
4. Déployé : attestation de version active et environnement ; preview ou CI ne suffisent pas, production non attestée ici.

Vague5 reste lecture seule : pas de notification go-live fondée sur CI verte. Le nouveau mandat remplace toute ancienne alerte automatique de publication.
