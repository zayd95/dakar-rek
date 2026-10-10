# Dakar Rek — Signature gameplay + Living City spec (Habib, 10 oct. 2026)

Texte de référence transmis par Habib le 10 octobre 2026 (reproduit tel quel). Il prime sur les documents de conception
plus anciens en cas de conflit. Les agents s'y réfèrent pour leurs priorités ; le suivi d'avancement est dans
`docs/NUIT_2026-10-09.md`.

---

On garde toute la direction actuelle, mais on clarifie maintenant ce que Dakar Rek doit devenir.
Dakar Rek n'est pas un musée de Dakar, ni un jeu où le joueur choisit une seule carrière.
C'est une vie alternative dans Dakar, où le joueur peut travailler, sortir, conduire, acheter, perdre de l'argent, devenir riche, combattre, organiser des combats, créer des affaires, avoir une réputation, puis changer complètement de vie quand il veut.
Le jeu doit être fun avant d'être cérémoniel ou documentaire.
On ne bloque pas les décisions de game design derrière des consultants ou des validations culturelles. On garde simplement du bon sens pour les contenus factuels sensibles : par exemple, pas de faux versets religieux inventés.

## 1. Règle principale : pas de classes de personnage
Ne jamais demander au joueur : « Tu veux être combattant, promoteur ou businessman ? »
Le joueur est simplement une personne dans Dakar. Ce qu'il devient vient de ce qu'il fait.
Un même joueur peut : combattre, arrêter de combattre, acheter une moto, créer un commerce, devenir riche, organiser un combat, acheter une maison, sortir en boîte, revenir plus tard à la lutte.
Aucun chemin ne doit fermer les autres.

## 2. Progression globale
Le joueur développe naturellement plusieurs dimensions en parallèle :
- **Forme** : endurance, condition physique, capacité de courir, récupération, avantages physiques.
- **Richesse** : argent, véhicules, maisons, terrains, entreprises, patrimoine.
- **Réputation** : à quel point le joueur est connu.
- **Influence** : relations, événements organisés, capacité à attirer du monde, poids économique/social.

Ces dimensions peuvent être visibles dans le profil, mais ne doivent pas devenir un système RPG lourd. Elles servent surtout à débloquer des possibilités.
Un joueur peut devenir très riche sans être combattant. Un grand lutteur peut être pauvre. Un ancien lutteur riche peut ensuite devenir grand promoteur. À long terme, un joueur peut être excellent dans tout.

## 3. L'arène est la signature absolue
La lutte sénégalaise doit être le système qui distingue Dakar Rek des autres life sims.
Priorité absolue : rendre une soirée de lutte mémorable.
Ne reconstruisez pas tout pendant des semaines. Construisez d'abord ce parcours complet :
ville → arrivée autour de l'arène → foule extérieure → entrée → spectateur OU combattant → entrée des lutteurs → combat → réaction de la foule → résultat → sortie.
Le joueur doit pouvoir venir uniquement regarder. L'arène doit vivre même quand le joueur ne combat pas.

## 4. Arène — extérieur vivant
Les soirs de combat : circulation plus forte autour de l'arène, taxis, motos, Car Rapides, voitures garées, vendeurs ambulants, nourriture, supporters, petits groupes qui discutent, affiches de combats, musique/percussions audibles depuis l'extérieur, entrées différentes pour public / combattants.
L'événement doit modifier le quartier autour de lui. Un grand combat doit être visible dans Dakar avant même d'arriver à l'arène.

## 5. Arène — intérieur
Faire une vraie structure crédible : gradins, sections, escaliers / passages, ringside, arbitres / officiels, zone médias, percussionnistes, vendeurs, zone de préparation, tunnel / entrée des lutteurs.
Utiliser des modules réutilisables. Ne pas modéliser chaque élément individuellement. Un module de gradins bien fait > 30 modules uniques.

## 6. Crowd system réutilisable
L'arène, le nightclub, les marchés et futurs événements doivent partager la même technologie de foule.
- **Near crowd** : personnages complets animés.
- **Mid crowd** : modèles simplifiés / instanciés.
- **Far crowd** : silhouettes très légères.

Les réactions peuvent fonctionner par groupes : applaudissements, cris, se lever, réaction à une saisie, réaction à une chute, célébration.
Pas besoin de donner une IA complète à 500 spectateurs.

## 7. Làmb combat 2.0
Ne pas transformer la lutte en boxe avec une barre de vie.
Le cœur doit être : distance → frappe → entrée → saisie → avantage de position → déséquilibre → projection / chute.
Les frappes servent aussi à créer une ouverture. Le combat doit être physique et lisible.

**Attributs du combattant** (quelques-uns seulement) : Force, Équilibre, Technique, Explosivité, Endurance, Frappe, Défense, Sang-froid.
La morphologie peut influencer les avantages. Un gros lutteur peut être plus difficile à déplacer. Un lutteur plus léger peut être plus rapide. Mais aucune statistique ne doit garantir la victoire. Un joueur techniquement meilleur doit pouvoir battre un adversaire plus fort.

## 8. États importants pendant le combat
Pas de gros HP 100/100. Suivre plutôt :
- **Endurance** : baisse avec les efforts.
- **Équilibre / posture** : indique la stabilité.
- **Avantage de saisie** : qui contrôle le clinch.
- **Sang-froid / pression** : les erreurs deviennent plus probables sous pression et fatigue.

## 9. Combat debout
À distance : avancer, reculer, tourner, garder, frapper, tenter une saisie.
Une grosse frappe : très dangereuse, mais laisse une ouverture si elle rate. Une frappe rapide : plus sûre, mais moins déstabilisante.
Garder doit avoir un coût et limiter certains mouvements.

## 10. Le clinch doit être jouable
Une saisie ne doit pas automatiquement lancer une animation de projection.
Une fois en clinch, les deux joueurs peuvent : pousser, tirer, pivoter, changer de prise, casser la saisie, tenter une projection, contrer.
Le joueur doit sentir « je suis en train de perdre cette position » avant la chute. Le timing et les contres sont essentiels.

## 11. La chute
Une chute doit être déterminée par : position du corps, équilibre, contacts, force de l'action, réponse de l'adversaire.
Pas : `attackPower > defense = win`.
Quand la chute décisive arrive : ralentissement très court / moment lisible → arbitre → explosion de la foule → résultat.

## 12. Styles de combattants
Faire émerger des styles différents : Puissant (veut mettre la pression), Technique (cherche les contres), Rapide (utilise le mouvement), Défensif (fatigue l'autre), Bon frappeur (crée des ouvertures), Grand lutteur de saisie (veut fermer rapidement la distance).
Les matchups doivent créer des stratégies.

## 13. Entraînement
Connecter la ville à la lutte.
Courir dans Dakar améliore progressivement : forme / endurance. Entraînement à l'écurie : force / équilibre. Technique : saisies / contres. Sparring : timing / défense. Entraînement frappe : frappe / précision. Les combats : expérience / sang-froid / réputation.

## 14. Ladder vers Roi des Arènes
Le joueur ne clique jamais sur « devenir Roi des Arènes ». Il doit le construire.
Exemple de progression : entraînement → petits combats → undercards → combats classés → adversaires réputés → contender → champion → défenses de titre → Roi des Arènes.
Le classement doit tenir compte de : qualité des adversaires, victoires, défaites, régularité, grands combats, réputation.
Une défaite ne détruit pas la carrière. Elle peut créer : revanche, rivalité, perte de classement, baisse de cachet, nouveau scénario sportif.

## 15. L'histoire sportive doit persister
Le jeu doit se souvenir. Exemple : HabibDkr — 18 combats, 14 victoires, 4 défaites, rivalité avec Moussa221, ancien champion, plus gros cachet : 2 500 000 F.
Les autres joueurs doivent pouvoir voir cette histoire. C'est cela qui crée la réputation.

## 16. Promoteur — pas une classe
On ne sélectionne jamais « Promoteur ». Le droit d'organiser des combats vient progressivement de : richesse, réputation, influence, expérience des événements.
Un joueur riche peut décider de teugue un combat. Premier niveau : petit combat de quartier. Ensuite : petite carte. Puis : événement plus important. Puis : grands combattants. Puis : grande soirée d'arène. Puis éventuellement : combat de championnat.

## 17. Organiser un combat entre deux joueurs
Le promoteur sélectionne deux joueurs consentants. Exemple : Moussa221 vs KingDakar — cachet combattant A : 700 000 F, cachet combattant B : 500 000 F, bonus victoire : 250 000 F, coût organisation : 200 000 F.
Les deux joueurs reçoivent une proposition. Ils peuvent accepter ou refuser. Une fois acceptée : l'argent est réservé par le serveur, le combat apparaît au calendrier, l'événement commence à exister dans Dakar.

## 18. Économie du promoteur
Dépenses : cachets, location / niveau du lieu, organisation, communication. Revenus : billets virtuels, sponsoring virtuel, publicité, revenus d'événement.
La réputation du promoteur dépend de : fréquentation, qualité des combats, respect des contrats, rentabilité, niveau des combattants, événements mémorables.

## 19. Pas de gambling réel
Les enjeux sont dans l'économie du jeu. Pas besoin de paris en argent réel. Les vrais enjeux sont déjà puissants : cachet, classement, titre, réputation, sponsoring, rivalité, carrière, patrimoine.

## 20. Combat multijoueur autoritaire serveur
À terme : le client ne décide jamais du résultat. Inputs → serveur → simulation / validation → chute → résultat → paiement.
Le serveur doit également fournir le même état de combat aux spectateurs. Cela protège : résultats, classement, argent, contrats.

## 21. Les grands combats deviennent des événements sociaux
Un gros combat ne concerne pas seulement deux joueurs. Il doit affecter toute la ville.
Avant le combat : posters, discussions, panneaux, calendrier, hype. Le soir : circulation plus dense, taxis, Car Rapides remplis, vendeurs, foule, club plus actif après le combat. Pendant : spectateurs réels, chat local, réactions. Après : victoire/défaite connue, réputation mise à jour, rivalités, futurs cachets.

## 22. Nightclub — deuxième gros événement social
Construire un seul nightclub excellent. Il doit donner une raison de rester connecté le soir.
Extérieur : lumière, voitures, motos, groupes, musique audible. Intérieur : DJ, dancefloor, tables / fauteuils, service, foule, danse, discussion, chat local.
Le joueur peut : entrer, s'asseoir, danser, parler, inviter un ami, rencontrer quelqu'un, flirter / dater si les deux veulent, repartir.
La foule varie : 20h calme, 22h monte, 00h fort, 03h redescend.
Réutiliser : crowd system, sièges, chat, NPC scheduler, venue framework.

## 23. Dakar doit être beaucoup plus dense
On garde la direction de la ville actuelle mais on augmente la sensation de densité. Ajouter progressivement : plus de trafic, embouteillages, vendeurs au bord de la route, taxis, motos, piétons, clients devant les commerces, groupes qui discutent, petites situations routières.
Ne pas simplement ajouter des NPC. Ajouter des raisons pour lesquelles ils sont là.

## 24. Trafic dynamique
La densité varie selon : heure, quartier, météo, événement.
Exemple : matin → déplacements travail. Fin de journée → plus de bouchons. Soir de combat → trafic autour de l'arène. Nuit → trafic réduit sauf nightlife.

## 25. Météo dynamique
Construire une couche météo légère : soleil, ciel couvert, pluie, après-pluie.
La météo doit modifier : lumière, sol, densité piétons, circulation, comportements. Pas besoin d'une simulation météorologique complexe.

## 26. Police / checkpoints comme événements de route
Ne pas créer un énorme système de police immédiatement. Créer un système générique de road events.
Un événement peut être : checkpoint, accident, route encombrée, contrôle, travaux. Cela change le trajet et donne l'impression que Dakar évolue.

## 27. Vendeurs ambulants
Créer des points adaptés : intersections, feux, arrêts, sorties d'événements, rues commerciales.
Les vendeurs apparaissent selon l'heure et le trafic. Ils peuvent proposer de petits achats rapides.

## 28. Highway / péage — plus tard mais préparer l'architecture
À terme : Dakar → autoroute / péage → zone aéroport. Cela donnera un vrai usage aux voitures.
Le joueur pourra avoir : vue conducteur, vue extérieure, trafic, stations / péage, changement progressif de paysage.
Mais ne pas commencer maintenant l'aéroport. Préparer seulement la continuité de transport.

## 29. Port
Ne pas faire un simulateur de port complet maintenant. Améliorer la crédibilité : navires, grues, conteneurs, camions, entrepôts, ouvriers, une ou deux animations de chargement.
Plus tard : emplois, commerce, logistique.

## 30. Soumbédioune
Pas de gros investissement maintenant. Garder les activités existantes. Ajouter seulement : pirogues plus crédibles, filets, cordes, caisses, seaux, moteurs, poissons, activité visuelle. Puis arrêter.

## 31. Shops — plus de coquilles vides
Construire un Shop Interior Kit. Éléments réutilisables : rayons, comptoir, caisse, produits, frigos, cartons, racks, mannequins, browse points, queue points.
Chaque commerce compose le kit différemment. Les clients doivent : entrer → regarder → acheter → partir, sans avoir besoin du joueur.

## 32. Mobilité et forme
Marcher est toujours gratuit même avec 0 FCFA. Garder : marche, marche rapide, course, endurance, progression de forme.
Une meilleure forme améliore progressivement : stamina, récupération, durée de course. Et plus tard : jobs physiques, endurance en lutte.
Pas de nouveau gros système de statistiques.

## 33. Statut social visible dans le monde
La progression ne doit pas seulement apparaître sur un écran. Les autres voient : ta voiture, ta moto, tes vêtements, ta maison, tes commerces, tes affiches, ton record, ton titre, la réaction du public.
Un joueur célèbre n'a pas besoin d'un énorme badge « FAMOUS ». Le monde doit montrer son statut.

## 34. Rétention — pas de faux streaks
Ne pas dépendre de : daily login reward, streak artificiel, énergie mobile pay-to-wait.
Faire revenir les joueurs parce qu'ils veulent savoir : « Qu'est-ce qui se passe dans Dakar aujourd'hui ? »
- **Session courte** — en 10 minutes : travailler, entraîner, acheter, rencontrer quelqu'un, livrer, conduire, améliorer quelque chose.
- **Chaque jour** — Dakar change : météo, trafic, activité, événements, nightlife.
- **Grands moments** — à intervalles réguliers : gros combat, tournoi, soirée, rivalité, événement spécial.
- **Long terme** — construire une identité : patrimoine, réputation, record, relations, businesses, événements organisés.

## 35. Publicité réelle — seulement après que le jeu soit bon
Ne pas optimiser le jeu pour les annonceurs aujourd'hui. D'abord : faire revenir les joueurs.
Plus tard, l'infrastructure existe naturellement : panneaux routiers, affiches d'arène, sponsors de combats, écrans de nightclub, enseignes, panneaux autour de l'arène, événements sponsorisés.
Les pubs réelles doivent être dans le monde, pas des popups qui cassent le jeu.

## 36. Architecture : ne pas ralentir
Continuer les agents en parallèle sur branches isolées. Priorité :
1. finir/intégrer économie + UI + habitants
2. Arena Strike Team
3. Nightclub
4. Shops
5. première voiture personnelle
6. densité/traffic/weather/road events

Port léger ensuite. Aéroport et grandes extensions beaucoup plus tard.

## 37. Agents
Utiliser / réaffecter les agents : Arena World, Arena Combat/Presentation, Crowd/Social Events, Nightclub/Venues, Assets, Living City, Integration/QA.
Lorsqu'un agent finit : réaffectation immédiate. Ne pas le laisser attendre.

## 38. Règle de vitesse
À chaque tâche demander : combien le joueur va remarquer cette amélioration ?
Si une tâche prend 4 heures et que le joueur ne voit presque aucune différence : ce n'est probablement pas la bonne priorité.
Chercher : résultat visible / heure, gameplay / asset, systèmes réutilisables, fun / complexité.

## 39. Pas maintenant
Ne pas démarrer : aéroport complet, Dakar Rek Airlines, jet, deuxième nightclub, deuxième arène, énorme extension de carte, construction complexe de bâtiments, simulateur complet du port.

## 40. Ce qu'on veut que le joueur ressente
Un joueur peut commencer presque sans argent. Il marche parce qu'il n'a pas de transport. Il travaille. Il court et devient plus endurant. Il achète une moto. Il commence à lutter. Il gagne puis perd. Il devient connu. Il ouvre un commerce. Il achète une voiture. Il arrête de combattre pendant un moment. Il sort en boîte avec ses amis. Plus tard il organise un petit combat. Ses événements deviennent plus gros. Il finance un combat entre deux grands joueurs. Des centaines de personnes viennent. Son nom est sur les affiches. Puis un jour il décide de revenir combattre lui-même.
Le jeu ne lui a jamais demandé de choisir une carrière. Il a simplement construit sa vie.

## Final principle
The city creates the life.
The arena creates the moments everyone remembers.
The player chooses what their life becomes.

Continue à faire avancer la branche `integration/living-dakar`. Ne touche pas directement à la production. Intègre progressivement quand les lots sont verts. Ne t'arrête pas pour des rapports intermédiaires sauf vrai blocage nécessitant une décision.
