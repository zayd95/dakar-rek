# Décisions — candidate Aïda

**D-AG-002, 7 octobre 2026, poursuivie le 8 octobre.** Habib demande de continuer au-delà des rapports. La tâche déjà proposée devient une amélioration jouable : invitation, activité locale, reconnaissance mémorisée. Elle réutilise les runners existants ; aucun lieu, système réseau, moteur de quêtes ou changement d’architecture ajouté. Texte français et durée abstraite restent unverified.

Un propriétaire de code, une QA indépendante et des chemins réservés. Le parent coordonne les documents et la livraison. Les anciennes instructions AGENTS fournies par l’utilisateur ont été révoquées. Aucun travail dans le checkout de Claude, déplacement de sa branche, merge ou déploiement. Les neuf profils du bootstrap restent disponibles dans PR #6 sans prétendre leur chargement automatique.

La candidate codex/aida-revision-activity part de la base visuelle distante 00abf96. Le nouvel environnement reconstruit les 83 fichiers texte et vérifie les SHA de sept assets ; les dépendances utilisées correspondent au lock. Le HEAD local 7df440d est une reconstruction. Les commits distants utilisent le vrai Git tree de la base et les seules modifications autorisées.

Les premières vérifications Mac utilisaient des outils de versions différentes et le navigateur était bloqué. Elles sont remplacées par des tests/build Linux avec dépendances exactes et de vrais parcours Chromium. Le transport route-backed charge localement les assets compilés, sans serveur TCP ou contact public. La recette intégrée au runner existant utilise également le Worker HTTP local. Aucun de ces parcours ne mesure un téléphone physique ou la production.

L’énumération des interfaces réseau du container échoue avec uv_interface_addresses. Un adaptateur extérieur au dépôt expose uniquement le loopback lorsque cet appel échoue. Le Worker, ses requêtes HTTP et ses WebSockets restent réels ; aucun fichier du jeu n’est modifié pour ce contournement.

DKAG-005 établit la traçabilité GitHub et confirme la surveillance planifiée. L’attestation de version active reste bloquée sans outil Cloudflare authentifié. Ce blocage n’interrompt pas le travail gameplay et ne démontre aucune panne. Aucun accès ou service ajouté.
