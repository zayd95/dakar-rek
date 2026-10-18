# DKAG-010 — Récupération trouvable

Auteur activation_gameplay, contrôle lu99ea0da7; source inspectée PR9@84311a716fa722cd20b4e725a72fd15f60511291. Revue de conception terminée en lecture seule; aucun source/ref modifié, aucun test exécuté. Les valeurs sont du jeu fictif, pas une assertion de prix réels.

Parcours vérifié au code à Pikine : boutique-stock4s,+1500F,énergie−15/hygiène−4/social+4; pain-lait2s,−400F,faim+25/énergie+4,meals+1; banc4s,gratuit,énergie+10/moral+6. Le stock requiert15énergie. Soumbédioune propose débarquement+3200F/6s/−26énergie, poisson−1200F/3s/+42faim; Fann repos gratuit. runAction applique une fois les effets en fin et sauvegarde; besoins0–100 avec drain, save schéma2 local. Présence n'est pas économie serveur.

Lacune concrète main.ts openPlaces : tout lieu avec revenu est « petits services rémunérés », autres « se retrouver ». La boutique n'annonce pas son repas ni le banc son repos. Refus de service « Repose-toi avant ce service » sans piste; describe reste narratif. Les chambres sont hors répertoire : hors premier correctif. Aucun comportement utilisateur observé.

Tâche proposée : résumé des capacités à partir des actions réelles dans Les coins du quartier; service gain/énergie/durée, repas prix/faim/durée et repos gratuit/effets/durée. Ne pas annoncer action invisible; conserver motif d'indisponibilité; ne pas dupliquer tarifs en deuxième tableau. Répertoire et repère : aucun coût/reward/durée d'activité, choix manuel préservé, pas d'autotrajets/quête/bonus.

Fichiers proposés placeSummary.ts, testplace-summary, intégration limitée openPlaces/main, check-city-life. cityContent/économie/save en lecture seule. Sous15énergie travail reste refusé; avec wallet0 repos reste trouvable. Fermeture/remplacementrepère/travel ne change aucun wallet/besoins/counters ni callbacks périmés. Reload avantfin ne donne pas de gain; aprèsfin conserve unefois; repèretransitoire. Un scénario wallet3000,énergie30,faim30 ->stock/repas/banc donne4100F,shifts+1,meals+1,actions+3; énergie nominale29 etfaim55 avantdrain.

Critères : formateur testélieu mixte, repas tropcher, action invisible, énergie refusée, reposgratuit; véritable parcours desktop/touch etCIexacte sur futurecandidate. Le producteur doit décider d'une base compatible et réserver main (autres sessions#9/#10), puis commissionner DKAG015. Aucun changement de leurs refs ni intégration réelle prétendue.
