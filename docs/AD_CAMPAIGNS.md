# Premiers panneaux publicitaires

Un panneau de quartier au Plateau, sur la Corniche, aux Almadies et à Pikine, plus un panneau devant l'entrée de l'arène. Aucun panneau commercial dans la mosquée.

Le fichier `public/ad-campaigns.json` est administré par le propriétaire du jeu et servi avec les fichiers du site. Le manifeste livré est vide : aucun faux sponsor. Les places libres affichent « Votre marque ici » et les annonces du quartier dans le menu. Le bouton sponsor n'apparaît que pour une campagne active ayant un lien.

## Configurer une campagne

Modifier le manifeste, reconstruire et publier les fichiers du site selon le processus de déploiement existant. Exemple de configuration **de test**, à remplacer par le contenu d'un annonceur réellement approuvé :

```json
{
  "schemaVersion": 1,
  "campaigns": [{
    "id": "campagne-test",
    "slot": "pikine-arena",
    "approved": true,
    "status": "active",
    "sponsor": "Commerce test",
    "headline": "Annonce de test",
    "message": "Exemple de campagne, à remplacer avant publication.",
    "startsAt": "2026-10-08T10:00:00Z",
    "endsAt": "2026-10-15T10:00:00Z",
    "background": "#123f39",
    "foreground": "#fff1ce",
    "url": "https://example.com/"
  }]
}
```

Emplacements : `plateau-street`, `corniche-street`, `almadies-street`, `pikine-street`, `pikine-arena`.

Les dates doivent préciser le fuseau (`Z` ou décalage). Le début est inclus, la fin exclue. Le panneau retourne automatiquement à son état disponible après expiration, sans nouveau déploiement. Une campagne doit être approuvée et active. Pour l'arrêter, mettre `status` à `paused`, retirer l'approbation ou supprimer l'entrée et republier le manifeste. Les clients le relisent chaque minute de jeu ; une coupure réseau ou un manifeste invalide remet les panneaux disponibles. Ce mécanisme est un fichier administré, pas encore une console de vente ou de réservation.

Si plusieurs campagnes se chevauchent sur un emplacement, le début le plus récent gagne (puis l'identifiant dans l'ordre alphabétique). Éviter les chevauchements lors de la réservation. Les entrées invalides sont ignorées : 100 campagnes maximum, identifiants uniques, textes limités et couleurs hexadécimales. Les URL doivent utiliser HTTPS sans identifiant ni mot de passe. Le lien s'ouvre uniquement après un clic explicite, dans un autre onglet sans accès à la page du jeu ; la campagne est revérifiée au moment du clic.

## Suite pour la commercialisation

Cette première version fournit les emplacements et la diffusion des campagnes. Elle ne facture pas les annonceurs, ne collecte aucune impression et ne promet aucun chiffre d'audience. Avant de vendre une offre basée sur les résultats, ajouter une administration authentifiée et une mesure serveur de visibilité réelle/clics, avec traitement des doublons. Pour les premières ventes au forfait, convenir séparément du contenu, de l'emplacement, de la durée et du prix ; aucun paiement réel ne passe par le portefeuille virtuel du joueur.

## Mosquée

La mosquée du Plateau a désormais un intérieur accessible, une sortie, un sol praticable et deux actions facultatives : prendre un moment pour prier ou se poser au calme. Aucun coût, gain d'argent, condition d'affiliation ou compteur religieux. La prière utilise un temps calme sans animation rituelle ; la pause ordinaire aide le moral et l'énergie. Le décor est fictif et son traitement culturel reste à revoir avec Habib avant lancement.

## Vérification

`npm test` vérifie notamment les dates, l'approbation, la suspension, les emplacements, les liens et l'absence de récompense religieuse. `npm run build` vérifie les types et la compilation.

`node scripts/check-v1-core.mjs <URL locale>` prépare le parcours navigateur sur ordinateur et avec une fenêtre mobile de 390 × 844, y compris le retrait d'une campagne et un lien périmé. Chrome est le canal par défaut ; `PLAYWRIGHT_CHANNEL=chromium` utilise le navigateur Playwright installé. Le script emploie une campagne interceptée en test uniquement, sans modifier le manifeste livré. Le résultat doit être distingué des vérifications manuelles ; voir `docs/V1_IMPLEMENTATION_CHECKS.md`.
