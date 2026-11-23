# Dakar habité — 8 octobre 2026

La ville conserve ses quatre hubs et les landmarks existants. Dix blocs auparavant résidentiels deviennent des lieux où marcher, rencontrer les habitants, prendre un service rémunéré ou se restaurer. Le dernier travail d’arène de `wip/visual-pass` est conservé avec la présence multijoueur de la branche de production.

## Où aller

| Hub | Nouveaux lieux |
| --- | --- |
| Corniche | Soumbédioune : plage accessible depuis les traversées de la Corniche, pirogues, débarquement, marché au poisson, trois ateliers. Place des étudiants à Fann. |
| Almadies | Dakar Life Mall : galerie ouverte, Ndar Tech, Style Rek, Maison Dakar, Jus & Go. Place des voisins à Ngor. |
| Plateau · Médina | Banque Teranga, Atelier Ndeye, Dakar Réparation, place de la Médina. |
| Pikine | Agence Banque Teranga, Boutique Diallo, Salon Awa, grand-place avec attaya et partie de dames. |

**Menu → Les coins du quartier** affiche les lieux du hub actuel et permet de choisir un repère à suivre à pied. Le repère indique direction et distance et s’efface à l’arrivée. Il ne téléporte pas le joueur et ne trace pas un itinéraire qui traverserait les bâtiments. Le hook `phoneHooks.openPlaces` permet à la future application du téléphone de réutiliser ce répertoire.

## Vie et activités

- Pirogues effilées et ouvertes, extrémités relevées, bandes peintes, bancs et moteur ; filets, flotteurs, caisses et bassines. Sept pirogues à qualité moyenne/haute, quatre à qualité basse.
- Pêcheurs et mareyeuses, artisans et commerçants, clients dans les boutiques et groupes aux places. Les personnages utilisent le modèle Blender existant. Un pêcheur suit une courte route de travail sur la plage.
- La qualité basse réduit les habitants supplémentaires. Les corps d’ambiance trop éloignés de la caméra ne sont ni dessinés ni animés ; ils redeviennent visibles à l’approche.
- Débarquer des caisses, réparer des filets, aider les mareyeuses, préparer une commande artisanale ; les services paient des FCFA locaux et consomment de l’énergie. Le menu refuse un travail trop fatigant.
- Au mall : petits services dans les boutiques, visite de la galerie, bouye et sandwich/bissap. Chez Style Rek et à l’atelier : accès au système existant de tenue de lutte.
- Banques : accueil, discussion de projet et mission de livraison de dossiers. Les distributeurs sont des éléments de décor. **Dépôts, retraits, crédit et comptes bancaires ne sont pas implémentés.**
- Boutique Diallo : pain/lait, rangement du stock et nouvelles de Mamadou, avec « Jaaraama ». Salon Awa : coiffure abstraite et conversation.
- Places : attaya, observation d’une partie de dames, repos à l’ombre ; effets sur les besoins. Il n’y a pas encore de mini-jeu de dames interactif.

Les activités sont des actions de vie temporisées, comme les repas et les petits métiers existants. Les objets exposés dans les boutiques ne constituent pas un inventaire de meubles achetables. L’argent et les besoins restent dans la sauvegarde invitée sur l’appareil ; aucun ledger serveur ni nouvelle migration n’est introduit. Les autres joueurs voient les déplacements dans ces espaces publics via le protocole existant. Les passants et leurs routines sont simulés localement.

## Direction et références

Soumbédioune associe débarquement de la pêche et artisanat. Références factuelles consultées : [marché artisanal](https://www.au-senegal.com/le-marche-artisanal-de-soumbedioune,3235.html), [marché au poisson](https://www.au-senegal.com/marche-aux-poissons-de-soumbedioune,2798.html) et [marchés du Sénégal](https://www.au-senegal.com/les-marches-du-senegal,064.html), Au Sénégal. Aucune photo externe n’est incorporée aux assets.

La géographie est une interprétation compacte pour le jeu. Les nouvelles banques, boutiques, le mall et les places sont fictifs ; aucun commerce réel ni sponsor n’est représenté. Géométrie et motifs des pirogues sont créés en code. Les dialogues français/wolof/pulaar, métiers, gestes et objets sont un brouillon à relire avec Habib ; les animations actuelles ne montrent pas encore les gestes exacts de réparation des filets ou de débarquement.

## Vérification

`npm run check:city` sert le build et vérifie les lieux et leurs positions sans obstacle, le passage vers la plage, le répertoire, le salaire et la fatigue du débarquement, le refus lorsque l’énergie manque, une commande au mall et son débit unique, la marche à travers l’entrée du mall et l’absence d’erreurs JavaScript. Deux formats : 1280 × 720 et 390 × 844 tactile. Les captures de jour et de nuit et le JSON sont dans `shots/city-life/` ; les preuves retenues sont dans `docs/screenshots/city-life/`.

La CI exécute ce contrôle avec ceux du réseau et du lancement. Le rendu logiciel Chromium sert à vérifier fonctionnement et cadrage ; il ne mesure pas la fluidité d’un téléphone réel. La surveillance horaire de production reste sur `main` et suit la branche Cloudflare configurée.
