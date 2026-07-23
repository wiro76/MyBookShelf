---
title: "PRD — My BookShelf"
status: final
created: 2026-07-24
updated: 2026-07-24
---

# PRD : My BookShelf

## 0. Objet du document

Ce PRD définit le comportement attendu du MVP de My BookShelf pour guider la conception UX, l’architecture et le découpage en epics et stories. Il s’appuie sur le Product Brief final du 24 juillet 2026 et sur les décisions du parcours accompagné. Les termes du glossaire sont normatifs ; les fonctionnalités regroupent des exigences fonctionnelles numérotées et stables. Les options d’interaction encore à tester sont conservées dans `addendum.md`.

## 1. Vision

My BookShelf est un site web de gestion de livres qui transforme une collection numérique en bibliothèque personnelle. Sa vue principale reproduit une bibliothèque physique : étagères extensibles, livres rangés verticalement et présentés avant tout sur leur tranche. L’organisation choisie reste stable afin que l’utilisateur retrouve un lieu familier, agréable à contempler et reconnaissable comme le sien.

Le produit réunit trois plaisirs habituellement séparés : suivre ses lectures, organiser librement sa collection et l’embellir. Sa boucle centrale est : **terminer une lecture → découvrir une récompense en pièces → acheter un bibelot → personnaliser durablement une étagère**.

Le MVP est d’abord conçu pour l’usage personnel de Zan-missel sur ordinateur et tablette. Son objectif est de valider l’attachement à la bibliothèque visuelle avant toute extension sociale ou communautaire.

## 2. Utilisateur cible

### 2.1 Besoins à satisfaire

Zan veut :

- retrouver immédiatement une représentation fidèle et stable de sa collection ;
- ajouter un livre sans être bloqué par les limites d’un catalogue externe ;
- organiser les livres selon sa propre logique, notamment par série, thème et préférence ;
- enregistrer les lectures commencées, terminées et répétées ;
- choisir librement les couvertures et tranches qui représentent ses exemplaires ;
- ressentir une progression agréable grâce aux pièces et aux bibelots ;
- ouvrir parfois le site uniquement pour contempler sa bibliothèque.

## 3. Périmètre du MVP

### 3.1 Inclus

- Bibliothèque visuelle avec Étagères extensibles et Exemplaires présentés sur leur Tranche ;
- Catalogue, recherche, ajout depuis une source existante et ajout manuel ;
- suppression d’un Exemplaire de la Bibliothèque ;
- Couvertures et Tranches indépendantes, authentiques ou générées ;
- galerie de Couvertures et suggestions facultatives de classement ;
- Exemplaires multiples d’une même Œuvre ;
- déplacement individuel et collectif, Thèmes multiples, recherche interne et repères colorés ;
- statut **À lire**, Lectures commencées, terminées et répétées, avec dates, note et commentaire ;
- récompenses en Pièces cachées jusqu’à la fin ;
- Boutique limitée aux Bibelots ;
- placement des Bibelots et réagencement automatique ;
- expérience complète sur ordinateur et tablette.

### 3.2 Reporté ou explicitement exclu

- téléphone compagnon avec code-barres, recherche et appareil photo — après validation du MVP ;
- promotions temporaires dans la Boutique — après validation de l’économie initiale ;
- import CSV générique ou assistant d’import ;
- amis, partage privé, entre amis ou public, et activités sociales ;
- quiz, défis et récompenses de contribution ;
- alertes de sorties et nouveaux tomes ;
- enrichissement communautaire complet, signalements et modération ;
- meubles, arrière-plans, thèmes complets et objets saisonniers ;
- prêts, emprunteurs et catalogage de bibliothèque professionnelle.

## 4. Critères de réussite

### 4.1 Principal

- **SM-1 — Collection réellement constituée :** au moins 25 livres ajoutés et rangés au cours du premier mois.

### 4.2 Indicateurs complémentaires

- **SM-2 — Retour volontaire :** au moins 8 sessions réparties sur au moins 3 semaines distinctes pendant les 30 premiers jours.
- **SM-3 — Facilité :** Zan peut ajouter et ranger un livre disponible dans le Catalogue en moins de 2 minutes, sans aide.
- **SM-4 — Attachement visuel :** sur une période de 30 jours, Zan ouvre au moins 2 sessions uniquement pour contempler ou décorer la Bibliothèque.
- **SM-5 — Progression satisfaisante :** au moins 3 Bibelots sont achetés et placés, et Zan évalue sa satisfaction visuelle à au moins 4/5 après 30 jours.

### 4.3 Signaux à ne pas optimiser

- **SM-C1 — Volume de Lectures :** le produit ne doit pas pousser Zan à lire ou déclarer davantage uniquement pour gagner des Pièces.
- **SM-C2 — Temps passé :** une session plus longue n’est pas meilleure si l’action souhaitée pouvait être accomplie simplement.
- **SM-C3 — Densité visuelle :** ajouter plus d’éléments ne doit pas détériorer la lisibilité et le plaisir de contemplation.

## 5. Parcours utilisateurs clés

#### UJ-1 — Zan termine une lecture et personnalise son étagère

Zan se connecte et retrouve sa dernière étagère dans l’état exact où il l’avait laissée. Il ouvre la fiche d’une Œuvre depuis son Exemplaire, marque une Lecture comme terminée, renseigne les dates, une note et un commentaire, puis sauvegarde. Le gain en Pièces, invisible jusque-là, est révélé et son solde est actualisé. Zan achète un Bibelot, le fait glisser sur une Étagère et voit les Exemplaires se réorganiser proprement autour de l’objet. À sa prochaine visite, tout est resté en place.

#### UJ-2 — Zan ajoute et range un livre trouvé dans le Catalogue

Depuis le haut d’une Étagère, Zan lance une recherche dans le Catalogue, choisit une Œuvre et utilise l’action **Ajouter à la Bibliothèque**. L’Exemplaire apparaît immédiatement dans l’Étagère, représenté par sa Tranche. Zan le déplace où il le souhaite et retrouve cette position lors des visites suivantes.

#### UJ-3 — Zan ajoute un livre absent du Catalogue

Si aucun résultat ne convient, Zan ouvre la page d’ajout manuel. Il fournit au minimum une Couverture à partir d’un fichier image ou d’une photo et peut compléter le titre, l’auteur, le résumé et les autres informations disponibles. My BookShelf utilise une véritable Tranche lorsqu’elle existe ; sinon, il en génère une à partir du titre et de la Couverture. Zan peut la remplacer ultérieurement, puis ranger l’Exemplaire.

#### UJ-4 — Zan retrouve et réorganise une collection importante

Avec plusieurs dizaines d’Exemplaires, Zan utilise une recherche interne distincte de la recherche du Catalogue pour localiser un livre dans son rangement. Il sélectionne plusieurs Exemplaires, les regroupe par Série ou Thème et les déplace ensemble. Il peut attribuer ses propres couleurs à des livres ou groupes, puis afficher ou masquer ces repères sans perdre la vue de Bibliothèque.

## 6. Glossaire

- **Bibliothèque** — Collection personnelle complète d’un utilisateur, composée d’Étagères, d’Exemplaires et de Bibelots.
- **Étagère** — Espace visuel extensible de la Bibliothèque dans lequel sont positionnés les Exemplaires et les Bibelots.
- **Catalogue** — Ensemble commun d’Œuvres, d’Éditions et de ressources visuelles consultable pour ajouter un livre.
- **Œuvre** — Livre conceptuel partagé par toutes ses Éditions et tous ses Exemplaires ; porte la Fiche de lecture commune.
- **Édition** — Publication particulière d’une Œuvre, susceptible d’avoir son propre ISBN, sa pagination, sa date, sa Couverture et sa Tranche.
- **Exemplaire** — Présence d’une Œuvre dans une Bibliothèque ; il possède sa position et ses choix visuels. Plusieurs Exemplaires d’une même Œuvre sont autorisés.
- **Fiche** — Vue détaillée d’une Œuvre regroupant métadonnées, choix visuels et suivi des Lectures.
- **Couverture** — Image choisie librement pour représenter une Œuvre ou un Exemplaire dans sa Fiche.
- **Tranche** — Représentation principale d’un Exemplaire dans une Étagère, choisie indépendamment de la Couverture.
- **Ressource visuelle** — Couverture ou Tranche conservée dans le Catalogue avec sa provenance et, lorsqu’elle est connue, son Édition de rattachement.
- **Lecture** — Occurrence datée de lecture d’une Œuvre ; une Œuvre peut avoir plusieurs Lectures.
- **Thème** — Étiquette de classement définie ou choisie par l’utilisateur ; un Exemplaire peut appartenir à plusieurs Thèmes.
- **Regroupement** — Sélection opérationnelle d’Exemplaires permettant notamment leur déplacement collectif ; elle ne crée aucune copie.
- **Pièce** — Monnaie interne gagnée après une Lecture terminée et dépensée dans la Boutique.
- **Boutique** — Surface où les Pièces permettent d’acquérir des Bibelots.
- **Bibelot** — Objet décoratif achetable et positionnable dans une Étagère.

## 7. Fonctionnalités et exigences fonctionnelles

### 7.1 Bibliothèque visuelle persistante

**Description.** La Bibliothèque est l’accueil et le cœur du produit. Elle doit évoquer une bibliothèque physique plutôt qu’une grille de Couvertures et préserver l’organisation choisie. Cette fonctionnalité réalise UJ-1 à UJ-4.

#### FR-1 — Accès personnel

Zan peut se connecter à son espace personnel et accéder à sa Bibliothèque.

**Conséquences vérifiables :**

- une session authentifiée ouvre directement la Bibliothèque ;
- un utilisateur non authentifié ne peut ni consulter ni modifier la Bibliothèque privée.

#### FR-2 — Retour au dernier contexte

Après connexion, Zan retrouve la dernière Étagère consultée ainsi que la position enregistrée de chaque Exemplaire et Bibelot.

#### FR-3 — Étagères extensibles

Zan peut créer des Étagères dont la capacité visuelle s’adapte au nombre d’Exemplaires et de Bibelots, sans limite arbitraire de collection imposée par l’interface.

#### FR-4 — Représentation par la Tranche

Chaque Exemplaire placé dans une Étagère est présenté principalement sur sa Tranche et rangé verticalement comme un livre physique.

### 7.2 Catalogue, ajout et représentation des livres

**Description.** Zan peut partir du Catalogue ou créer une entrée manuellement. Le modèle distingue Œuvre, Édition et Exemplaire afin de préserver les collections comprenant plusieurs éditions. Cette fonctionnalité réalise UJ-2 et UJ-3.

#### FR-5 — Recherche dans le Catalogue

Zan peut rechercher le Catalogue par titre ou auteur depuis la Bibliothèque et consulter les résultats avant d’ajouter un livre.

#### FR-6 — Ajout depuis le Catalogue

Zan peut ajouter une Œuvre trouvée dans le Catalogue à sa Bibliothèque au moyen d’une action explicite **Ajouter à la Bibliothèque**.

**Conséquences vérifiables :**

- l’ajout crée un Exemplaire manipulable ;
- l’Exemplaire apparaît immédiatement dans une Étagère.

#### FR-7 — Ajout manuel

Lorsque l’Œuvre recherchée est absente, Zan peut ouvrir une page dédiée et la créer avec au minimum un titre et une Couverture importée à partir d’un fichier image ou d’une photo.

**Informations complémentaires prises en charge lorsqu’elles sont disponibles :** auteur, résumé, pagination, Série, numéro de tome, date de sortie, ISBN et Édition.

**Conséquences vérifiables :**

- l’Œuvre et ses données bibliographiques rejoignent immédiatement le Catalogue commun ;
- l’Exemplaire ajouté, sa position et les données de Lecture restent propres à la Bibliothèque de Zan.

#### FR-8 — Exemplaires multiples

Zan peut ajouter plusieurs Exemplaires d’une même Œuvre afin de représenter différentes Éditions, notamment des Éditions standard et collector, sans créer plusieurs Fiches de lecture.

#### FR-9 — Choix indépendant des visuels

Zan peut choisir et modifier séparément la Couverture présentée dans la Fiche et la Tranche présentée dans l’Étagère.

**Conséquences vérifiables :**

- une Ressource visuelle commune est rattachée à une Œuvre ou une Édition dans le Catalogue ;
- le choix personnel de Couverture ou de Tranche est enregistré dans l’Exemplaire ou la Fiche ;
- changer ou supprimer un choix personnel ne supprime pas la Ressource visuelle commune.

#### FR-10 — Galerie de Couvertures

La Fiche présente une galerie de Couvertures disponibles pour l’Œuvre ou ses Éditions, notamment celles d’éditions françaises, internationales ou collector. Zan peut sélectionner librement celle qu’il préfère sans modifier son choix de Tranche.

#### FR-11 — Tranche authentique ou générée

My BookShelf privilégie une Tranche authentique lorsqu’elle est disponible. À défaut, il génère automatiquement une Tranche comportant au minimum le titre et un traitement visuel issu de la Couverture. Zan peut remplacer cette Tranche ultérieurement.

#### FR-12 — Retrait d’un Exemplaire

Zan peut supprimer un Exemplaire de sa Bibliothèque après une confirmation explicite.

**Conséquences vérifiables :**

- le retrait d’un Exemplaire ne supprime ni l’Œuvre du Catalogue ni les autres Exemplaires de la même Œuvre ;
- si le dernier Exemplaire est retiré, la Fiche et l’historique des Lectures sont conservés par défaut ;
- lors du retrait du dernier Exemplaire, Zan peut choisir explicitement de supprimer également ses données personnelles associées, notamment statut, note, commentaire et historique des Lectures.

#### FR-13 — Intégrité du Catalogue commun

Lorsqu’une Œuvre ou une Ressource visuelle est ajoutée au Catalogue commun, My BookShelf conserve sa provenance et limite les doublons.

**Conséquences vérifiables :**

- la création est bloquée si le même ISBN existe déjà et l’Œuvre correspondante est proposée ;
- en l’absence d’ISBN identique, une forte similarité de titre et d’auteur déclenche un avertissement avant création ;
- l’auteur de chaque contribution et sa date sont conservés ;
- une contribution peut être corrigée ou retirée logiquement sans supprimer ni rendre inutilisables les Exemplaires qui la référencent.

### 7.3 Organisation et repérage

**Description.** L’organisation physique reste libre, tandis que Thèmes, Regroupements, recherche interne et couleurs permettent de gérer une collection importante sans la transformer durablement en liste. Cette fonctionnalité réalise UJ-4.

#### FR-14 — Déplacement individuel

Zan peut déplacer un Exemplaire vers toute position compatible d’une Étagère ou vers une autre Étagère, à la souris ou au tactile.

#### FR-15 — Sélection et déplacement collectifs

Zan peut sélectionner plusieurs Exemplaires, créer un Regroupement temporaire ou durable et déplacer l’ensemble en une seule opération.

#### FR-16 — Thèmes multiples

Zan peut créer ses propres Thèmes et attribuer simultanément plusieurs Thèmes à un même Exemplaire, notamment par genre, sous-genre, Série ou préférence.

#### FR-17 — Recherche interne

Zan peut rechercher un livre déjà présent dans sa Bibliothèque au moyen d’un outil distinct de la recherche du Catalogue.

**Conséquences vérifiables :**

- le résultat permet de localiser l’Exemplaire dans son Étagère actuelle ;
- quitter la recherche restitue l’organisation physique inchangée.

#### FR-18 — Repères colorés personnalisés

Zan peut définir des couleurs et leur signification, les attribuer à des Exemplaires ou Regroupements, puis afficher ou masquer leurs contours colorés.

#### FR-19 — Suggestions facultatives de classement

My BookShelf peut suggérer des Thèmes ou Regroupements à partir des métadonnées disponibles, mais ne les applique jamais sans une action explicite de Zan.

### 7.4 Suivi des lectures

**Description.** La Fiche porte le suivi commun de l’Œuvre, indépendamment du nombre d’Exemplaires possédés. Cette fonctionnalité réalise UJ-1.

#### FR-20 — Statuts et dates

Zan peut marquer une Œuvre comme **À lire**, puis une Lecture comme **Commencée** ou **Terminée**, et renseigner ou modifier ses dates de début et de fin.

#### FR-21 — Note et commentaire

Après une Lecture terminée, Zan peut attribuer une note sur dix et rédiger ou modifier un commentaire personnel.

#### FR-22 — Historique des relectures

Zan peut enregistrer plusieurs Lectures d’une même Œuvre, chacune avec ses propres dates, tout en conservant une Fiche commune à tous les Exemplaires.

### 7.5 Pièces, Boutique et décoration

**Description.** Une Lecture terminée produit une récompense cachée jusqu’à sa sauvegarde. Les Pièces permettent d’acheter des Bibelots et de modifier visiblement la Bibliothèque. Cette fonctionnalité réalise UJ-1.

#### FR-23 — Révélation de la récompense

My BookShelf ne révèle jamais le gain potentiel d’une Lecture avant qu’elle soit marquée comme terminée et sauvegardée. Après sauvegarde, il affiche le montant gagné et actualise le solde de Pièces visible.

**Conséquences vérifiables :**

- chaque Lecture possède un identifiant de crédit unique et ne peut produire qu’un seul crédit de Pièces ;
- répéter la sauvegarde, actualiser la page ou reprendre après une erreur réseau ne double jamais le gain ;
- si la Lecture est sauvegardée mais que le crédit échoue, le gain reste en attente, est signalé à Zan et peut être repris sans modifier son montant.

#### FR-24 — Récompense de première Lecture

My BookShelf calcule automatiquement la récompense de la première Lecture terminée à partir de la pagination de l’Édition :

`Pièces = minimum(100, maximum(5, arrondi(nombre de pages ÷ 10)))`

Si la pagination est inconnue, la récompense est de 20 Pièces. Le résultat n’est révélé qu’après la sauvegarde de la Lecture terminée.

#### FR-25 — Récompense décroissante des relectures

Chaque relecture rapporte la moitié des Pièces de la Lecture précédente. Le résultat est arrondi à l’entier inférieur jusqu’à atteindre zéro.

#### FR-26 — Achat de Bibelots

Zan peut consulter la Boutique, connaître le prix des Bibelots, acheter ceux que son solde lui permet d’acheter et voir son solde débité.

**Assortiment initial :**

- 4 Bibelots à 10 Pièces ;
- 4 Bibelots à 25 Pièces ;
- 3 Bibelots à 50 Pièces ;
- 1 Bibelot à 100 Pièces.

#### FR-27 — Placement et réagencement

Après achat, le Bibelot apparaît à proximité d’une Étagère. Zan peut le faire glisser vers une position compatible ; les Exemplaires environnants se réorganisent automatiquement de manière propre et lisible.

### 7.6 Surfaces du MVP

#### FR-28 — Ordinateur

Toutes les capacités du MVP sont utilisables sur ordinateur à la souris. Une solution alternative est disponible pour les actions qui ne doivent pas dépendre exclusivement du survol ou du clic droit.

#### FR-29 — Tablette

Toutes les capacités du MVP sont utilisables sur tablette au tactile, notamment la sélection et le glisser-déposer des Exemplaires et Bibelots.

## 8. Exigences non fonctionnelles transversales

- **NFR-1 — Persistance :** toute modification confirmée de position, de contenu ou de suivi doit être retrouvée après déconnexion et reconnexion.
- **NFR-2 — Intégrité :** une action échouée ne doit pas laisser une Étagère partiellement réorganisée ni débiter des Pièces sans achat confirmé.
- **NFR-3 — Fluidité :** le déplacement d’un Exemplaire ou Bibelot doit fournir un retour visuel continu et indiquer clairement sa position de dépôt.
- **NFR-4 — Échelle :** une Bibliothèque d’au moins 100 Exemplaires doit rester navigable, recherchable et manipulable sans dégradation gênante.
- **NFR-5 — Compatibilité tactile :** aucune capacité nécessaire au MVP ne doit dépendre uniquement du survol.
- **NFR-6 — Accessibilité :** les actions principales doivent disposer d’une alternative au glisser-déposer et les couleurs ne doivent jamais être le seul moyen de transmettre une information.
- **NFR-7 — Confidentialité :** la Bibliothèque et les données de Lecture sont privées par défaut.
- **NFR-8 — Sauvegarde perceptible :** toute sauvegarde ou synchronisation doit produire une confirmation compréhensible ou signaler clairement l’échec.
- **NFR-9 — Réponse aux manipulations :** pour une Étagère contenant jusqu’à 100 Exemplaires, une action de déplacement doit produire un retour visuel en moins de 100 ms et le réagencement final doit se stabiliser en moins de 500 ms après le dépôt.
- **NFR-10 — Invariants spatiaux :** après réagencement, aucun Exemplaire ou Bibelot ne se chevauche, aucun élément ne sort de l’Étagère et l’ordre relatif des éléments non déplacés est conservé autant que possible.

## 9. Contraintes et garde-fous

### 9.1 Ressources visuelles

- Les Couvertures et Tranches doivent conserver leur provenance lorsque celle-ci est connue.
- L’import d’une image personnelle doit informer l’utilisateur qu’il doit disposer du droit de l’utiliser.
- Une Ressource visuelle importée dans le Catalogue est commune ; sa provenance et son auteur de contribution sont conservés.
- Une Tranche générée automatiquement pour un Exemplaire reste personnelle tant qu’elle n’est pas explicitement ajoutée au Catalogue.
- Le retrait d’un Exemplaire ne supprime jamais les Ressources visuelles communes qu’il utilisait.
- Une Œuvre créée manuellement rejoint immédiatement le Catalogue commun ; les futures fonctions de signalement et de modération devront traiter les données incorrectes ou abusives.
- Toute ouverture communautaire ultérieure devra ajouter des mécanismes de détection des doublons, de signalement et de retrait avant de permettre le partage des images entre utilisateurs.

### 9.2 Économie

- Le gain caché ne doit jamais être présenté comme une raison de choisir un livre plutôt qu’un autre.
- Une relecture ne doit pas constituer une source infinie de Pièces.
- Les prix et récompenses doivent permettre une progression visible sans rendre la lecture ou la décoration obligatoires.

### 9.3 Données externes

- Google Books est la source principale du Catalogue pour le MVP.
- Open Library complète les métadonnées et ressources manquantes.
- La BnF peut enrichir et vérifier les données bibliographiques françaises.
- Amazon n’est pas utilisé comme source dans le MVP.
- Une indisponibilité du Catalogue ne doit pas empêcher l’ajout manuel d’une Œuvre.
- Les données importées doivent rester modifiables par Zan dans sa Bibliothèque.
- Les contrôles minimaux de doublon, de provenance, de correction et de retrait logique définis par FR-13 s’appliquent aux créations communes.

## 10. État des décisions

Aucune question produit bloquante ne reste ouverte. Les décisions techniques et UX reportées sont suivies dans `addendum.md` avec leur responsable et leur condition de reprise.
