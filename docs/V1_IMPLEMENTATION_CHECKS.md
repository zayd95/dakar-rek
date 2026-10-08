# Vérification UI et premier incrément V1 — 8 octobre 2026

Code validé : `4fbf62adc6b222fd738bcf8bd8d85aa56738fc66`, sur la branche isolée `codex/v1-mosque-ads`, proposée vers `wip/visual-pass`. Aucun déploiement de production.

[Workflow complet réussi](https://github.com/zayd95/dakar-rek/actions/runs/37775725930) · [Captures et résultats](https://github.com/zayd95/dakar-rek/actions/runs/37775725930/artifacts/11549704587) · [Proposition #10](https://github.com/zayd95/dakar-rek/pull/10)

## Interface

- Choix de lieux, dialogues, trajets et gestes dans une barre en bas de l'écran, limitée à 240 px. Mesure sur ordinateur : environ 138 px ; le personnage et le décor restent visibles.
- Solde, faim et énergie dans un indicateur compact ; cinq besoins et humeur dépliables à la demande. Valeurs des jauges exposées aux lecteurs d'écran.
- Bouton d'action masqué lorsqu'aucune interaction n'est proche.
- Boutons natifs, états désactivés, focus visible, tabulation contenue dans les choix, fermeture par Échap et restitution du focus. Échap replie aussi les besoins.
- Fermeture tactile de 44 px au minimum ; défilement des choix supplémentaires et prise en compte des zones sûres.
- Réglages et personnalisation conservent des dialogues dédiés.

## Contrôles réussis

| Contrôle | Résultat |
| --- | --- |
| Installation des dépendances du lockfile | Réussie |
| Tests unitaires | 34 / 34 |
| Types du serveur et compilation de production | Réussis |
| Parcours dédiés mosquée, annonces et interface | 30 / 30 |
| Présence multijoueur, dont deux visiteurs dans la mosquée | Réussie |
| Parcours complet du jeu sur ordinateur et en format mobile | Réussi |

Les parcours dédiés vérifient l'entrée, la marche et la sortie de la mosquée, le changement de qualité dans la salle, la sauvegarde à la porte, les choix facultatifs de prière et de pause, cinq emplacements publicitaires, le retrait d'une campagne, les liens périmés, la taille des choix et boutons tactiles, le focus au clavier et les besoins dépliables. Aucun paiement, affiliation ou compteur religieux n'est ajouté.

Les captures ordinateur et mobile ont été inspectées. La campagne « Commerce test » appartient uniquement au test navigateur ; le manifeste livré reste vide.

## Limites

- L'émulation mobile en navigateur ne remplace pas un essai sur téléphone réel ; aucune certification d'accessibilité complète n'est revendiquée.
- Les paiements réels, la console commerciale et les statistiques d'audience restent à construire.
- Le traitement culturel de la mosquée et du làmb reste à valider avec Habib.
- Le combat existant demeure local ; les changements de présence ne le transforment pas en combat multijoueur.
