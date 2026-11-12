# Làmb — règles du jeu Dakar Rek

**Ce sont les règles de notre jeu.** Décision de Habib (9 oct. 2026) : « C'est notre jeu, on crée nos règles. » Elles
s'inspirent de la lutte sénégalaise sans en reprendre le règlement officiel, et n'ont pas besoin de validation extérieure.
Elles évoluent avec le jeu.

- Code : `src/lamb/rules.ts` (données et fonctions pures, testées dans `tests/lamb.test.ts`), `src/lamb/duel.ts` (combat).
- Disciplines : la **lutte sans frappe** est jouable. La **lutte avec frappe** (forme visée, décision du 6 oct.) est la
  prochaine discipline à construire ; sa configuration `avec_frappe` existe déjà (désactivée, `enabled: false`) avec ses
  compteurs réservés, pour que les deux disciplines aient des règles et des classements séparés.

## 1. Discipline « sans frappe » (jouable)

| Élément | Choix de jeu actuel | Valeur |
| --- | --- | --- |
| Durée | Une seule reprise, chrono affiché | 90 s de jeu |
| Fin du combat | **Projection au sol** à la fin d’une empoignade gagnée | — |
| Temps écoulé | **Décision de l’arbitre aux points** ; égalité de points = **match nul** | voir § 3 |
| Abandon | Bouton « Abandonner » (ou Échap) avec confirmation ; compté **à part**, ni victoire ni défaite, aucune récompense | — |
| Frappes | Aucune | — |
| Pas de « barre de vie » | L’endurance n’est pas une vie : une endurance vide ne fait perdre personne, elle empêche seulement de saisir ou de se dégager | — |

### Endurance (sur 100 pour le joueur)

| Action | Coût / effet |
| --- | --- |
| Récupération debout | +14 /s |
| Récupération en garde | +7 /s (la garde se paie en récupération et en vitesse de déplacement) |
| Saisie (tentative) | −22, distance maximale 1,5 m |
| Empoignade | −8 /s pour les deux lutteurs |
| Dégagement réussi dans l’empoignade | −25 |
| Dégagement raté (mauvais moment) | −12, et l’adversaire gagne un peu d’avance |
| Dégagement en neutre (pas en arrière) | −12 |

### Déroulé d’un échange

1. **Arbitre** : « Arbitre : prêts ? » puis « Làmb ! ». Texte volontairement simple, **sans rituel inventé**.
   À l’entraînement, c’est Coach Ablaye qui lance.
2. **Garde** (maintenue) : bloque une saisie adverse.
3. **Saisie** : immédiate pour le joueur. Si l’adversaire est en garde, la saisie est bloquée et le joueur est **exposé**
   0,9 s (« Tu es exposé ! »). Une saisie hors de portée expose aussi, un peu moins longtemps.
4. **Fenêtre de réponse** : quand l’adversaire lance une saisie, elle est annoncée (« Il attaque ! Garde ou dégage ! »)
   et laisse 0,6 s × le facteur du style (0,48 s à 0,75 s) pour répondre. Une garde ou un pas en arrière (Dégager)
   pendant cette fenêtre l’annule : parade réussie, et l’adversaire est **ouvert** (« Ouverture ! ») 0,9 s.
   Si personne ne répond, l’empoignade commence. Si le défenseur est déjà exposé, il n’y a pas de fenêtre (contre).
5. **Ouverture** : un lutteur ouvert ne peut ni se garder ni saisir ; une saisie sur lui ne peut pas être bloquée.
6. **Empoignade** (2,6 s) : le joueur tape Saisir pour pousser ; l’adversaire pousse selon son style, son niveau et son
   endurance. Force = efforts + endurance/40 + 1 pour celui qui a saisi. Une barre montre qui mène.
7. **Dégagement** dans l’empoignade : seulement quand on est mené. Une fenêtre verte de 0,38 s s’ouvre toutes les
   secondes (première à 0,45 s) ; appuyer pendant la fenêtre sépare les lutteurs. L’adversaire peut faire de même
   selon son style.
8. À la fin de l’empoignade, le plus fort **projette** l’autre au sol : fin du combat.
9. **Récapitulatif** : résultat, manière (projection, décision, nul, abandon), endurance restante, parades, saisies,
   dégagements, points (si décision) et récompenses. Il se ferme avec « Continuer » ou seul après 10 s.

## 2. Adversaires (fictifs)

La difficulté vient **uniquement du style et du niveau** : jamais de l’argent, de la tenue, des danses, des
accessoires ou des gris-gris, qui n’ont aucun pouvoir caché. Les noms sont fictifs ; aucun lutteur réel n’est
représenté.

| Style | Lutteur | Lisible par le joueur |
| --- | --- | --- |
| Costaud | Gora | Lent, saisies très annoncées, très fort dans l’empoignade, ne se dégage jamais |
| Rapide | Pape | Rapide, saisies courtes à annoncer, peu d’endurance (75), se dégage parfois |
| Défensif | Saliou | Se garde beaucoup, contre souvent l’ouverture du joueur, se dégage plus souvent |

Niveau 1 à 5 : 1 + (victoires ÷ 2) − (défaites ÷ 3), arrondis vers le bas, séparément en amical et en classé.
Facteur de difficulté = 0,8 + 0,1 × niveau (sur la fréquence des gardes et saisies, la vitesse et la poussée).

## 3. Décision de l’arbitre au temps (règle de jeu simple)

Chaque action vaut 1 point :

- **parade réussie** : saisie adverse arrêtée par la garde ou par un dégagement dans sa fenêtre de réponse ;
- **saisie engagée** : tentative de saisie à portée (bloquée ou non) ;
- **dégagement** : empoignade rompue.

Plus de points gagne ; égalité = match nul. Une empoignade en cours quand le temps expire va à son terme.

## 4. Modes

| Mode | Lieu | Classement | Récompense |
| --- | --- | --- | --- |
| Entraînement guidé (Coach Ablaye, partenaire Babacar) | Écurie Baobab (fictive) | Aucun | Aucune ; compteur `lamb_skill` +1 |
| Combat amical | Arène | `lamb_amical_v/d/n`, abandons `lamb_amical_ab` | Moral +14, social +6 |
| Combat classé | Arène (après l’entraînement guidé) | `lamb_classe_v/d/n`, abandons `lamb_classe_ab` | Moral +18, social +8 |

Les compteurs globaux `combats` et `victoires` restent mis à jour (amical et classé) parce que d’autres parties du
jeu les lisent. Un abandon n’ajoute ni `combats` ni défaite : il est compté dans `lamb_abandons`. Aucune récompense
n’est de l’argent. L’entraînement en cinq étapes : se déplacer, se garder, saisir, gagner l’empoignade, se dégager.
Le classement est **local à l’appareil** (sauvegarde invité), pas un classement en ligne.

Cycle prévu par le document de conception : invitation/inscription → adversaire → préparation et entrée → contrôle de
l’arbitre → combat → arrêt ou résultat → récapitulatif et récompense. Ici : choix de l’adversaire (amical) ou adversaire
attribué (classé) → contrôle de l’arbitre → combat → arrêt → récapitulatif. L’entrée et la préparation restent des
actions séparées de l’arène.

## 5. Duel synchronisé entre deux joueurs (hors périmètre, esquisse d’interface)

Le combat actuel est local. Un duel entre deux joueurs demande un **état de match côté serveur** (Durable Object du
Worker `server/`), jamais décidé par un client :

```ts
// Messages client → serveur
type DuelIn =
  | { t: 'invite'; to: string; discipline: 'sans_frappe' | 'avec_frappe'; mode: 'amical' | 'classe' }
  | { t: 'accept' | 'decline'; matchId: string }
  | { t: 'ready'; matchId: string }                          // contrôle de l'arbitre
  | { t: 'input'; matchId: string; seq: number; at: number; move: [number, number]; guard: boolean; grab: number; break: number }
  | { t: 'abandon'; matchId: string };
// Messages serveur → clients
type DuelOut =
  | { t: 'match'; matchId: string; seats: [string, string]; rulesVersion: string; phase: 'invite' | 'referee' | 'bout' | 'stop' | 'recap' }
  | { t: 'state'; matchId: string; tick: number; timeLeft: number; fighters: { pos: [number, number]; stamina: number; open: number; windup: number }[]; clinch?: { by: 0 | 1; share: number; breakWindow: boolean } }
  | { t: 'result'; matchId: string; outcome: 'projection' | 'decision' | 'egalite' | 'abandon' | 'deconnexion'; winner: 0 | 1 | null; score: unknown };
```

Règles d’interface : deux places, phases horodatées par le serveur, délai de reconnexion (ex. 20 s) ; une
**déconnexion ou un abandon n’est pas une victoire sportive** (résultat `deconnexion`/`abandon`, compté à part) ; le
résultat classé n’est écrit qu’une fois, de façon idempotente, par le serveur.

## 6. Vérification

- `npm test` : `tests/lamb.test.ts` (décision de l’arbitre, empoignade, fenêtre de dégagement, styles, niveaux,
  compteurs séparés amical/classé, abandon compté à part, récompenses sans argent, profil de l’app Arène).
- `node scripts/check-lamb.mjs http://localhost:4203/` (Chromium + SwiftShader, `vite preview --port 4203`) :
  entraînement guidé complet, combat amical gagné en saisissant, fenêtre de réponse, dégagement d’une empoignade
  perdue, abandon (Échap → confirmation), combat classé, profil, disposition tactile 390×844 et paysage 844×390
  (boutons hors des lutteurs), aucune erreur de page. Captures : `docs/screenshots/lamb/`. Les délais sont mesurés
  en temps de jeu ; `LAMB_SLOW` multiplie les budgets quand la machine est chargée.
