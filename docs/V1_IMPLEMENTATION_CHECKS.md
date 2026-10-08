# Vérification du premier incrément V1 — 8 octobre 2026

Base isolée : `wip/visual-pass`, commit `00abf96efeadcc8bdb8d4c859eb1d0258b0978b7`. Les 83 fichiers texte du snapshot local ont été comparés aux empreintes Git de cette base avant modification. Aucun changement provenant du travail Aïda n'a été repris. Cette proposition active la mosquée et prépare les emplacements publicitaires ; elle ne constitue pas la totalité de la V1 et n'a pas été déployée.

## Contrôles exécutés

- `npm test` : **33 tests réussis**, dont 6 contrôles des campagnes et de la visite facultative.
- `npm run build` : TypeScript et compilation de production réussis.
- Chrome, version locale : entrée par le bouton de la mosquée ; marche sur le sol de la salle ; choix distincts de prière et de pause ; fin des deux actions ; portefeuille toujours à 3 000 F ; changement de qualité dans la salle puis sortie à la porte d'origine (`x=-30, z=-41.5`).
- Chrome : panneau libre du Plateau, mention « disponible », renseignements sur la vie du quartier et absence de bouton de sponsor ; panneau devant l'arène de Pikine.
- Chrome en aperçu responsive **390 × 844** : le menu du panneau de l'arène tient dans l'écran et sa fermeture est accessible. Cet aperçu ne remplace pas un essai sur téléphone réel.
- Campagne de vérification locale : le menu identifie « Publicité · Commerce test », affiche son texte et un bouton explicite vers un site externe. Cette campagne a ensuite été supprimée du manifeste livré.

Les points de contrôle locaux employaient les déplacements de l'API de développement uniquement pour rejoindre les lieux ; les menus, les actions et les changements de qualité ont été contrôlés dans l'interface. Des captures ont été inspectées pendant cette session. Les contrôles locaux supplémentaires ne sont pas inclus dans le produit.

## Limites à lever avant mise en ligne

- Le script `scripts/check-v1-core.mjs` est préparé mais **n'a pas terminé un parcours automatisé** : le navigateur Playwright n'est pas installé et le lancement de Chrome depuis le processus de test s'arrête avec `SIGABRT` dans cet environnement. Vérifier les parcours automatisés dans un environnement disposant de son navigateur de test.
- La session Chrome existante remonte des rejets répétés de listener asynchrone / canal de message. Le jeu a continué à fonctionner ; leur origine n'a pas été isolée dans une session sans extensions. Ne pas considérer cette vérification manuelle comme une preuve d'absence de toutes les erreurs navigateur.
- Dépendances de test disponibles localement : Vite 5.4.19, TypeScript 5.9.3, Vitest **3.2.7**, Playwright 1.62.1. Vitest diffère du majeur 2 déclaré dans le dépôt. Le lockfile n'a pas été modifié. Relancer `npm ci`, les tests et les parcours navigateur avec le lockfile dans l'environnement de validation avant lancement.
- Les paiements réels, la console commerciale et les statistiques d'impressions/clics restent à construire. Aucun paiement ou chiffre d'audience n'est simulé par cette proposition.
- Le traitement culturel de la mosquée et du làmb reste à valider avec Habib. Le combat existant demeure local et n'est pas transformé en combat multijoueur par ces changements.
