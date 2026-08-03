---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
inputDocuments:
  - ../specs/spec-my-bookshelf/SPEC.md
  - ../specs/spec-my-bookshelf/requirements-traceability.md
  - architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md
  - ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/DESIGN.md
  - ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md
status: final
language: fr
revision: 3
revisedFromReadinessReport: implementation-readiness-report-2026-08-03.md
---

# My BookShelf — Epics et stories du MVP

## Vue d’ensemble

Ce document décompose le contrat canonique de My BookShelf en incréments de valeur utilisateur. Les décisions `AD-1` à `AD-12`, ainsi que `DESIGN.md` et `EXPERIENCE.md`, s’appliquent à chaque story concernée sans être dupliquées ni affaiblies.

## Inventaire des exigences

### Exigences fonctionnelles

- `CAP-1` : accès privé et reprise (`FR-1`, `FR-2`).
- `CAP-2` : bibliothèque physique persistante (`FR-3`, `FR-4`).
- `CAP-3` : ajout depuis le Catalogue (`FR-5`, `FR-6`, `FR-8`).
- `CAP-4` : ajout manuel intègre (`FR-7`, `FR-13`).
- `CAP-5` : exemplaires et visuels indépendants (`FR-8` à `FR-12`).
- `CAP-6` : organisation et repérage libres (`FR-14` à `FR-19`).
- `CAP-7` : lectures et relectures (`FR-20` à `FR-22`).
- `CAP-8` : récompenses discrètes (`FR-23` à `FR-25`).
- `CAP-9` : boutique et inventaire (`FR-26`).
- `CAP-10` : décoration sans altération (`FR-27`).
- `CAP-11` : expérience accessible équivalente (`FR-28`, `FR-29`).
- `CAP-12` : sauvegarde et reprise fiables (`FR-23`, `FR-26`).
- `CAP-13` : catalogue résilient et maîtrisable (`FR-5`, `FR-7`, `FR-9` à `FR-11`, `FR-13`).

### Exigences non fonctionnelles

- `NFR-1` : persistance et fiabilité des données privées.
- `NFR-2` : atomicité et restauration de l’état confirmé.
- `NFR-3` : retour continu et perceptible sur les interactions.
- `NFR-4` : collection extensible, sans limite arbitraire d’interface.
- `NFR-5`, `NFR-6` : accessibilité et équivalence des interactions.
- `NFR-7`, `NFR-8` : confidentialité, autorisation et reprise sûre.
- `NFR-9` : retour visuel en moins de 100 ms et stabilisation du réagencement en moins de 500 ms jusqu’à 100 exemplaires.
- `NFR-10` : absence de chevauchement ou débordement et préservation de l’ordre relatif des éléments non déplacés.

### Exigences d’architecture additionnelles

- Fondation officielle Next.js App Router, TypeScript strict, Tailwind, ESLint, Turbopack et `src/`, sur Node.js LTS (`AD-2`).
- Monolithe modulaire hexagonal, ownership exclusif et transactions serveur PostgreSQL via un seul client (`AD-1`, `AD-3`).
- Commandes versionnées, reçus idempotents, conflits explicites et aucun faux succès hors ligne (`AD-5`, `AD-6`).
- Canon local avec provenance, médias immuables et traitements différés idempotents (`AD-7`, `AD-8`).
- Registre économique explicable et outbox transactionnelle (`AD-9`).
- RLS, façade Next.js unique, caches privés et URLs signées (`AD-10`).
- DOM sémantique, viewport fenêtré et budgets UX (`AD-11`).
- Environnements isolés, migrations, CI bloquante, observabilité sans PII et restauration testée (`AD-12`).

### Exigences UX

- Le meuble est une projection physique réaliste, tandis que le chrome reste neutre et stable.
- Largeur logique d’un module : 560 px sans compression ; ordinateur et tablette conservent les mêmes résultats.
- WCAG 2.2 AA minimum : clavier seul, alternatives au glisser-déposer, cibles 44 px pointeur/48 px tactile, zoom 200 %, reflow 400 %/320 CSS px, focus 3:1 à deux tons, régions live et erreurs reliées aux champs.
- Toute sauvegarde expose textuellement « Sauvegarde… », « Enregistré » ou une erreur avec reprise ; les annonces évitent les cascades.
- Aucun état ni aucune action ne dépend exclusivement de la couleur, du survol, du clic droit, de l’appui maintenu ou du geste.
- Le mouvement respecte le système et le réglage utilisateur ; les dialogues gèrent et restituent le focus.

## Carte de couverture

| Epic | Valeur livrée | Capacités principales | Exigences |
|---|---|---|---|
| 1 | Accéder à une bibliothèque privée et reprendre son contexte | CAP-1, CAP-11, CAP-12 | FR-1, FR-2, FR-28, FR-29, NFR-1, NFR-3, NFR-5 à NFR-9 |
| 2 | Ajouter un premier exemplaire depuis le Catalogue ou manuellement | CAP-3, CAP-4, CAP-5, CAP-11, CAP-12, CAP-13 | FR-5 à FR-13, FR-28, FR-29, NFR-1 à NFR-3, NFR-5 à NFR-9 |
| 3 | Contempler et personnaliser une bibliothèque physique persistante déjà alimentée | CAP-2, CAP-5, CAP-10, CAP-11, CAP-12 | FR-3, FR-4, FR-8 à FR-12, FR-27 à FR-29, NFR-1 à NFR-6, NFR-9, NFR-10 |
| 4 | Ranger, regrouper et retrouver librement ses exemplaires | CAP-2, CAP-6, CAP-11, CAP-12 | FR-3, FR-4, FR-14 à FR-19, FR-28, FR-29, NFR-1 à NFR-6, NFR-9, NFR-10 |
| 5 | Suivre lectures et relectures, puis recevoir une récompense discrète | CAP-7, CAP-8, CAP-11, CAP-12 | FR-20 à FR-25, FR-28, FR-29, NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8, NFR-9 |
| 6 | Acheter, conserver et placer des bibelots purement cosmétiques | CAP-9, CAP-10, CAP-11, CAP-12 | FR-26 à FR-29, NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 à NFR-10 |

### Matrice explicite exigences → stories

| Exigence | Stories de preuve |
|---|---|
| FR-1 | 1.1, 1.4, 1.6 |
| FR-2 | 1.7 |
| FR-3 | 3.1, 3.2, 3.4 |
| FR-4 | 3.2, 3.4, 4.5 |
| FR-5 | 2.1 |
| FR-6 | 2.2, 2.3 |
| FR-7 | 2.4, 2.5, 2.6 |
| FR-8 | 2.2, 2.3, 3.5 |
| FR-9 | 2.2, 2.4–2.7, 3.5 |
| FR-10 | 2.2, 2.4–2.7, 3.5 |
| FR-11 | 2.2–2.7, 3.5 |
| FR-12 | 2.4–2.7, 3.5 |
| FR-13 | 2.4, 2.5, 2.6 |
| FR-14 | 4.1, 4.2 |
| FR-15 | 4.2, 4.3, 4.4 |
| FR-16 | 4.3, 4.4 |
| FR-17 | 4.3 |
| FR-18 | 4.3 |
| FR-19 | 4.3 |
| FR-20 | 5.1, 5.2, 5.4 |
| FR-21 | 5.2, 5.3, 5.4 |
| FR-22 | 5.3, 5.4 |
| FR-23 | 5.3, 5.5 |
| FR-24 | 5.3, 5.5 |
| FR-25 | 5.3, 5.5 |
| FR-26 | 6.1, 6.2, 6.3 |
| FR-27 | 3.1, 6.3, 6.4, 6.5, 6.6 |
| FR-28 | Matrice d’audit FR-28/FR-29 ci-dessous et stories interactives explicitement listées |
| FR-29 | Matrice d’audit FR-28/FR-29 ci-dessous et stories interactives explicitement listées |

### Matrice d’audit FR-28 / FR-29

| Stories interactives | Ordinateur | Tablette | Souris | Tactile | Clavier | Preuves WCAG 2.2 AA obligatoires |
|---|---|---|---|---|---|---|
| 1.1, 1.6–1.8 | large + étroit | paysage + portrait | parcours complet | parcours complet | parcours complet | focus 3:1, erreurs reliées, régions live, zoom 200 %, reflow 400 %/320 px |
| 2.1–2.7 | large + étroit | paysage + portrait | recherche, choix, ajout, import | mêmes résultats | mêmes résultats sans geste | cibles 44/48 px, libellés, erreurs de champs, dialogues/focus, aucune couleur ou image seule |
| 3.1–3.5 | large + étroit | paysage + portrait | navigation spatiale | scroll prioritaire et actions | hiérarchie complète | DOM sémantique, focus deux tons, régions nommées, reflow et ordre canonique |
| 4.1–4.5 | large + étroit | paysage + portrait | drag + commande | drag + commande | commande visible complète | aucune dépendance au geste/couleur, annonces globales, focus destination, erreur perceptible |
| 5.1–5.5 | large + étroit | paysage + portrait | formulaires/dialogues | mêmes résultats | dates et actions complètes | erreurs reliées, focus modal/restauration, live regions, mouvement réduit |
| 6.1–6.6 | large + étroit | paysage + portrait | achat/placement | mêmes résultats | alternatives au drag | `aria-disabled`, annonces solde/dépôt, focus logique, texte+icône+couleur |

Pour chaque ligne, Playwright exécute au minimum les combinaisons ordinateur+souris, ordinateur+clavier, tablette+tactile et tablette+clavier. Les contrôles automatisés et manuels couvrent contrastes, cibles, nom/rôle/valeur, ordre et restitution du focus, zoom/reflow, espacement WCAG 1.4.12, réduction des animations et absence de dépendance au survol, clic droit, appui maintenu, drag ou couleur.

## Liste des epics

### Epic 1 : Accès privé et reprise fiable

Zan peut ouvrir My BookShelf, s’authentifier et retrouver son dernier contexte confirmé sans exposer de données privées.

### Epic 2 : Acquisition bibliographique maîtrisée

Zan peut trouver une œuvre et son édition ou créer manuellement une édition absente, puis obtenir un exemplaire traçable et manipulable.

### Epic 3 : Bibliothèque physique persistante et personnelle

Zan peut contempler une bibliothèque d’exemplaires présentés par leur tranche, l’utiliser sur ordinateur et tablette et changer son apparence sans changer son rangement.

### Epic 4 : Organisation et repérage libres

Zan peut déplacer seul ou en groupe, catégoriser et localiser ses exemplaires sans corruption ni réordonnancement implicite.

### Epic 5 : Lectures, relectures et récompenses discrètes

Zan peut suivre chaque occurrence de lecture et recevoir après une fin explicite un crédit unique, sobre et reprenable.

### Epic 6 : Boutique, inventaire et décoration sans altération

Zan peut dépenser ses pièces en bibelots cosmétiques, les conserver, les placer et les retirer sans perdre son rangement.

## Epic 1 : Accès privé et reprise fiable

### Story 1.1 : Configurer le projet initial depuis le starter officiel

En tant que Zan, je veux ouvrir un socle web cohérent, afin que chaque incrément du MVP fonctionne sur la même fondation ordinateur et tablette.

**Traçabilité :** CAP-1, CAP-11 ; FR-1, FR-28, FR-29 ; NFR-9 ; AD-1, AD-2.

**Critères d’acceptation :**

- **Étant donné** un dépôt vide, **quand** le projet est créé, **alors** la commande officielle `create-next-app` active App Router, TypeScript strict, Tailwind, ESLint, Turbopack, l’alias `@/*` et l’option `--src-dir`.
- **Étant donné** le projet généré, **quand** il est installé et construit, **alors** Next.js/React s’exécutent sur Node.js LTS et le gestionnaire choisi produit un lockfile versionné qui devient l’autorité des versions.
- **Étant donné** la graine structurelle, **quand** les dossiers sont créés, **alors** `app` compose seulement le web, les modules suivent `domain/application/adapters`, et aucune règle métier n’est placée dans un composant.
- **Étant donné** la page initiale, **quand** elle est ouverte sur ordinateur ou tablette, **alors** un contenu utile, un focus visible et un état de chargement sans faux livre sont rendus.

### Story 1.2 : Bloquer une livraison qui viole les garanties du MVP

En tant que Zan, je veux que les régressions soient arrêtées avant livraison, afin que ma bibliothèque reste fiable et accessible.

**Traçabilité :** CAP-11, CAP-12 ; FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 à NFR-10 ; AD-3, AD-5, AD-10 à AD-12.

**Critères d’acceptation :**

- **Étant donné** une pull request, **quand** la CI s’exécute, **alors** elle lance et exige le succès de l’analyse statique, du lint, de la vérification des types stricts, des tests unitaires et des tests d’intégration.
- **Étant donné** une modification de données ou commande, **quand** la CI s’exécute, **alors** elle bloque sur tout échec des tests RLS inter-utilisateurs, migrations aller/retour compatibles expand–migrate–contract, atomicité et idempotence.
- **Étant donné** une interaction utilisateur, **quand** la suite navigateur s’exécute, **alors** Playwright couvre les parcours critiques, l’accessibilité WCAG 2.2 AA et la matrice FR-28/FR-29.
- **Étant donné** 100 exemplaires, **quand** les budgets sont mesurés, **alors** la CI bloque si le retour dépasse 100 ms, la stabilisation 500 ms, ou si un chevauchement ou changement d’ordre relatif apparaît.
- **Étant donné** local, preview par PR, staging et production, **quand** ils sont configurés, **alors** données et secrets sont isolés et aucune donnée de production ne quitte la production.

### Story 1.3 : Exécuter les traitements différés sans perte ni doublon

En tant que Zan, je veux que les traitements en arrière-plan soient reprenables, afin qu’une panne ne perde ni ne double une action confirmée.

**Traçabilité :** CAP-12 ; NFR-1, NFR-2, NFR-8 ; AD-1, AD-3, AD-6, AD-12.

**Critères d’acceptation :**

- **Étant donné** une mutation qui exige un effet différé, **quand** elle est confirmée, **alors** message pgmq/outbox et mutation sont publiés dans la même transaction avec enveloppe versionnée.
- **Étant donné** Supabase Cron, **quand** il déclenche un Route Handler Node Vercel protégé, **alors** le worker consomme un lot borné sous `maxDuration` avec timeout de visibilité.
- **Étant donné** un échec transitoire, **quand** le message est rejoué, **alors** retries bornés et consommateur idempotent empêchent tout double effet.
- **Étant donné** l’épuisement des retries, **quand** le seuil est atteint, **alors** le message rejoint la DLQ avec `messageId`, `jobId`, motif et action de reprise testable.

### Story 1.4 : Corréler les incidents sans exposer de données personnelles

En tant que Zan, je veux que les incidents soient diagnostiquables sans fuite, afin que la fiabilité n’affaiblisse pas ma confidentialité.

**Traçabilité :** CAP-1, CAP-12 ; FR-1 ; NFR-7, NFR-8 ; AD-10, AD-12.

**Critères d’acceptation :**

- **Étant donné** une requête, commande ou tâche, **quand** elle traverse l’application, **alors** `requestId`, `commandId`, `actorId` pseudonymisé et `jobId` sont propagés selon le contexte.
- **Étant donné** un événement observable, **quand** il est journalisé, **alors** logs JSON, OpenTelemetry et `@sentry/nextjs` partagent les correlation IDs.
- **Étant donné** les journaux et traces, **quand** un test de fuite s’exécute, **alors** aucun email, titre personnel, contenu importé, URL signée, secret ou PII n’est présent.
- **Étant donné** une erreur fournisseur, **quand** elle atteint l’interface, **alors** elle est convertie en erreur stable sans texte ni identifiant sensible du fournisseur.

### Story 1.5 : Sauvegarder et prouver une restauration complète

En tant que Zan, je veux que mes données et images soient restaurables ensemble, afin de reprendre après un incident sans référence cassée.

**Traçabilité :** CAP-12 ; NFR-1, NFR-8 ; AD-8, AD-12.

**Critères d’acceptation :**

- **Étant donné** la stratégie de sauvegarde, **quand** elle s’exécute, **alors** PITR est utilisé s’il est disponible, sinon sauvegarde quotidienne, avec export logique et copie Storage hors site.
- **Étant donné** un point de sauvegarde, **quand** il est finalisé, **alors** un manifeste immuable liste les hashes Storage référencés par la base et sa vérification échoue sur toute incohérence.
- **Étant donné** une restauration trimestrielle, **quand** le runbook est exécuté, **alors** base et objets sont restaurés, toutes les références sont vérifiées et une preuve horodatée est conservée.
- **Étant donné** que RPO, RTO et rétention ne sont pas encore chiffrés, **quand** le développement du MVP avance, **alors** il n’est pas bloqué ; la promotion en production reste bloquée jusqu’à leur fixation et à une restauration probante.

### Story 1.6 : Se connecter à la bibliothèque privée

En tant que Zan, je veux m’authentifier, afin que moi seul puisse consulter ou modifier ma bibliothèque.

**Traçabilité :** CAP-1, CAP-11 ; FR-1, FR-28, FR-29 ; NFR-5 à NFR-9 ; AD-3, AD-10, AD-11.

**Critères d’acceptation :**

- **Étant donné** une session absente, **quand** une route privée est demandée, **alors** aucune donnée privée n’est rendue et le formulaire de connexion conserve seulement une destination relative autorisée.
- **Étant donné** des identifiants valides, **quand** Zan se connecte, **alors** Supabase Auth établit la session et Next.js reste l’unique façade des données privées.
- **Étant donné** des identifiants invalides, **quand** la connexion échoue, **alors** la saisie est conservée, l’erreur est reliée au champ, annoncée et focalisée selon le nombre d’erreurs.
- **Étant donné** un autre utilisateur ou une commande sans ownership, **quand** une lecture ou mutation est tentée, **alors** l’autorisation serveur et RLS refusent l’accès sans divulguer la donnée.

### Story 1.7 : Reprendre le dernier contexte confirmé

En tant que Zan, je veux revenir à ma dernière position, afin de retrouver naturellement ma place dans la bibliothèque.

**Traçabilité :** CAP-1, CAP-11, CAP-12 ; FR-2, FR-28, FR-29 ; NFR-1, NFR-3, NFR-8, NFR-9 ; AD-5, AD-6, AD-10, AD-11.

**Critères d’acceptation :**

- **Étant donné** un contexte confirmé, **quand** Zan revient, **alors** statut, module, étagère et exemplaire sont résolus par identifiants stables et restaurés sans devenir autorité du rangement.
- **Étant donné** une cible supprimée, **quand** la reprise s’effectue, **alors** le voisin valide le plus proche est ouvert, le changement est annoncé et le focus arrive sur une cible logique.
- **Étant donné** une session expirée, **quand** Zan se reconnecte, **alors** la destination non sensible est reprise sans donnée privée dans l’URL.
- **Étant donné** un échec de chargement après connexion, **quand** la reprise échoue, **alors** Zan reste authentifié, voit un état explicite et peut réessayer.

### Story 1.8 : Percevoir et reprendre chaque sauvegarde

En tant que Zan, je veux savoir si une action est enregistrée, afin de pouvoir agir sans craindre une corruption silencieuse.

**Traçabilité :** CAP-12, CAP-11 ; FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 ; AD-3, AD-6, AD-11, AD-12.

**Critères d’acceptation :**

- **Étant donné** une mutation, **quand** elle est envoyée, **alors** l’interface affiche et annonce « Sauvegarde… » puis seulement « Enregistré » après le reçu transactionnel idempotent.
- **Étant donné** un échec réseau, **quand** aucun reçu n’est obtenu, **alors** aucun faux succès n’est affiché, l’intention est conservée si possible et « Réessayer » réutilise le même `commandId`.
- **Étant donné** des versions locale et distante divergentes, **quand** la reconnexion survient, **alors** le dernier état confirmé est restauré et un choix explicite présente les deux états et leurs conséquences.
- **Étant donné** une action au clavier, tactile ou pointeur, **quand** son état change, **alors** le retour apparaît en moins de 100 ms et se stabilise en moins de 500 ms sur 100 exemplaires.

## Epic 2 : Acquisition bibliographique maîtrisée

### Story 2.1 : Rechercher une œuvre par titre ou auteur

En tant que Zan, je veux interroger un Catalogue distinct de ma recherche personnelle, afin de trouver l’œuvre que je possède.

**Traçabilité :** CAP-3, CAP-13, CAP-11 ; FR-5, FR-28, FR-29 ; NFR-3, NFR-5, NFR-6, NFR-9 ; AD-7, AD-11.

**Critères d’acceptation :**

- **Étant donné** un titre ou auteur, **quand** Zan recherche, **alors** Google Books est interrogé en principal, Open Library en complément et la BnF pour le français ; Amazon n’est jamais utilisé.
- **Étant donné** des résultats, **quand** Zan en active un, **alors** la fiche complète de l’Œuvre s’ouvre avant tout ajout et aucun ajout rapide ambigu n’est proposé.
- **Étant donné** aucun résultat, **quand** la recherche se termine, **alors** la requête est conservée et l’ajout manuel est proposé.
- **Étant donné** un fournisseur indisponible, **quand** la recherche échoue, **alors** le message ne reprend aucun texte fournisseur, propose Réessayer et ne bloque pas l’ajout manuel.

### Story 2.2 : Comparer et choisir une édition

En tant que Zan, je veux comparer les éditions d’une œuvre, afin d’ajouter celle que je possède réellement.

**Traçabilité :** CAP-3, CAP-5, CAP-13, CAP-11 ; FR-6, FR-8 à FR-11, FR-28, FR-29 ; NFR-3, NFR-5, NFR-6, NFR-9 ; AD-4, AD-7, AD-8, AD-11.

**Critères d’acceptation :**

- **Étant donné** une Œuvre, **quand** ses éditions s’affichent, **alors** Couverture, ISBN, pagination, date et provenance sont comparables et la sélection utilise radio, texte et contour.
- **Étant donné** une édition, **quand** Zan la choisit au pointeur, tactile ou clavier, **alors** le même identifiant d’édition alimente la commande d’ajout.
- **Étant donné** un rapprochement non exact, **quand** il est proposé, **alors** il reste explicite, réversible et sans effet avant confirmation.
- **Étant donné** une correction ultérieure d’édition, **quand** elle est enregistrée, **alors** Exemplaire, position, Lectures et visuels personnels sont conservés sauf action explicite de retour aux visuels d’édition.

### Story 2.3 : Ajouter l’édition choisie comme envie de lire

En tant que Zan, je veux ajouter explicitement une édition comme envie de lire, afin d’obtenir un premier exemplaire manipulable sans dépendre d’une future Lecture.

**Traçabilité :** CAP-3, CAP-5, CAP-12 ; FR-6, FR-8, FR-11 ; NFR-1 à NFR-3, NFR-8 ; AD-3 à AD-6.

**Critères d’acceptation :**

- **Étant donné** une Edition choisie, **quand** Zan confirme « Ajouter comme envie de lire », **alors** une transaction crée exactement un Copy relié à l’Edition et un UserWork portant l’intention explicite « À lire », sans créer de Reading.
- **Étant donné** le premier ajout de la collection, **quand** la fin du dernier module est une destination valide, **alors** Copy, intention et Placement sont créés atomiquement et la Tranche devient immédiatement manipulable dans Envie de lire.
- **Étant donné** que « En cours » et « Terminés » exigent une Reading valide, **quand** cette story est livrée, **alors** ces choix ne sont pas proposés et aucune projection de lecture artificielle n’est créée.
- **Étant donné** une double soumission, une réponse inconnue ou un échec, **quand** la commande est rejouée avec le même `commandId`, **alors** le même reçu retourne le même exemplaire sans doublon, ou aucun exemplaire fantôme n’apparaît si aucun reçu n’existe.

### Story 2.4 : Importer et préparer une couverture personnelle en sécurité

En tant que Zan, je veux préparer une couverture que j’ai le droit d’utiliser, afin de pouvoir créer ensuite une édition absente sans exposer mon fichier original.

**Traçabilité :** CAP-4, CAP-5, CAP-13, CAP-11, CAP-12 ; FR-7, FR-9 à FR-13, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5 à NFR-8 ; AD-7, AD-8, AD-10 à AD-12.

**Critères d’acceptation :**

- **Étant donné** un JPEG, PNG, WebP ou AVIF d’au plus 20 Mio et 40 MP, **quand** Zan confirme son droit d’usage, **alors** les octets sont validés, les EXIF supprimés et l’original reste privé dans un MediaAsset `quarantined`.
- **Étant donné** un type, contenu, droit ou seuil invalide, **quand** l’import est refusé, **alors** la raison et la correction sont expliquées et un autre fichier peut être choisi sans perdre les autres champs.
- **Étant donné** un média accepté, **quand** les variantes sont produites, **alors** le worker Sharp est idempotent, les fichiers sont adressés par SHA-256 et les métadonnées gardent provenance et droits.
- **Étant donné** le contrôle des octets et du droit réussi, **quand** la Couverture est acceptée, **alors** le MediaAsset passe atomiquement de `quarantined` à `private` et son identifiant stable est retourné par un reçu idempotent sans publication ni création de Work, Edition, Copy ou Reading.

### Story 2.5 : Créer manuellement une édition comme envie de lire

En tant que Zan, je veux créer une édition absente et l’ajouter comme envie de lire, afin d’obtenir un exemplaire immédiatement visible et manipulable sans dépendre d’un fournisseur externe ni d’une future Lecture.

**Traçabilité :** CAP-4, CAP-5, CAP-12, CAP-13, CAP-11 ; FR-7 à FR-13, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5 à NFR-9 ; AD-3 à AD-8, AD-10, AD-11.

**Critères d’acceptation :**

- **Étant donné** le formulaire manuel et un MediaAsset privé accepté par 2.4, **quand** titre et Couverture sont fournis, **alors** auteur, résumé, pagination, série, tome, date, ISBN et mention d’édition restent facultatifs.
- **Étant donné** un ISBN normalisé identique, **quand** Zan soumet, **alors** la recréation est bloquée et « Ajouter un autre Exemplaire » de l’édition existante est proposé ; une forte similarité sans identifiant exact avertit mais permet « Créer quand même » après examen.
- **Étant donné** la confirmation « Ajouter comme envie de lire », **quand** la commande réussit, **alors** contribution commune révisionnée Work/Edition, provenance, contributeur, date, Copy privé, UserWork portant l’intention explicite « À lire » et Placement de fin sont créés atomiquement, sans Reading.
- **Étant donné** une Tranche authentique absente, **quand** la recette de fallback attend ou échoue, **alors** le Copy reste visible et manipulable dans Envie de lire avec un placeholder accessible, déterministe et remplaçable.
- **Étant donné** une double soumission, une validation ou un échec, **quand** la commande est rejouée avec le même `commandId`, **alors** le même reçu retourne le même ensemble sans doublon, ou aucun Work, Edition, Copy, UserWork ou Placement partiel ne subsiste si aucun reçu n’existe ; les saisies et erreurs accessibles sont conservées.

### Story 2.6 : Gouverner la publication et la révocation des médias

En tant que Zan, je veux que mes médias restent privés, révocables et restaurables, afin de maîtriser leur usage sans casser les visuels encore utilisés.

**Traçabilité :** CAP-4, CAP-5, CAP-12, CAP-13 ; FR-7, FR-9 à FR-13 ; NFR-1, NFR-2, NFR-7, NFR-8 ; AD-7, AD-8, AD-10, AD-12.

**Critères d’acceptation :**

- **Étant donné** un MediaAsset `private` issu de 2.4, **quand** une contribution commune est demandée, **alors** seul un dérivé dont les droits sont connus peut passer à `published` ; sans preuve de droits, l’actif reste privé et aucune URL externe ne devient autoritative.
- **Étant donné** une ressource personnelle ou commune, **quand** ses accès sont servis, **alors** originaux, quarantaine et personnels restent privés par URL signée et seul le dérivé commun `published` est public.
- **Étant donné** une révocation, **quand** elle est confirmée, **alors** l’état devient `revoked`, toutes les références autoritatives sont détachées et un actif commun encore référencé n’est jamais supprimé en cascade avec un choix personnel.

### Story 2.7 : Collecter les médias révoqués sans compromettre les sauvegardes

En tant que Zan, je veux que les fichiers devenus inutiles soient supprimés sans casser une restauration, afin de conserver une bibliothèque intègre dans le temps.

**Traçabilité :** CAP-5, CAP-12 ; FR-9 à FR-12 ; NFR-1, NFR-2, NFR-8 ; AD-8, AD-12.

**Critères d’acceptation :**

- **Étant donné** un actif révoqué sans référence, **quand** le GC asynchrone idempotent l’évalue, **alors** il ne supprime l’objet qu’après expiration de la rétention de sauvegarde et vérification de tous les manifestes applicables.
- **Étant donné** un point de sauvegarde, **quand** son manifeste est généré ou restauré, **alors** le hash de chaque objet Storage référencé est présent et toute absence bloque la validation de la sauvegarde ou restauration.
- **Étant donné** retries ou DLQ du worker média, **quand** la reprise s’exécute, **alors** variantes, révocation et GC restent idempotents et corrélables sans PII.

## Epic 3 : Bibliothèque physique persistante et personnelle

### Story 3.1 : Choisir l’apparence initiale du meuble

En tant que Zan, je veux choisir gratuitement une structure et une finition, afin que la bibliothèque me ressemble dès la première utilisation.

**Traçabilité :** CAP-2, CAP-10, CAP-11, CAP-12 ; FR-3, FR-27 à FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-9 ; AD-5, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** une première connexion, **quand** l’onboarding s’ouvre, **alors** plusieurs structures et finitions gratuites sont prévisualisables sans option présumée ni capacité payante.
- **Étant donné** une prévisualisation, **quand** Zan revient en arrière, annule ou confirme, **alors** l’état et le focus sont cohérents sur ordinateur, tablette et clavier.
- **Étant donné** une confirmation, **quand** l’enregistrement réussit, **alors** l’apparence est persistée sans mutation de Placement.
- **Étant donné** un échec, **quand** le style ne peut être appliqué, **alors** l’ancien style et tout le rangement restent intacts et l’intention est réessayable.

### Story 3.2 : Parcourir les trois bibliothèques physiques

En tant que Zan, je veux parcourir Envie de lire, Terminés et En cours, afin de contempler mes exemplaires selon leur état de lecture.

**Traçabilité :** CAP-2, CAP-11 ; FR-3, FR-4, FR-28, FR-29 ; NFR-3 à NFR-6, NFR-9, NFR-10 ; AD-4, AD-5, AD-11.

**Critères d’acceptation :**

- **Étant donné** des exemplaires, **quand** une bibliothèque est ouverte, **alors** le DOM suit statut > module > étagère > exemplaire et les livres apparaissent par Tranches jointives sur l’étagère.
- **Étant donné** un module, **quand** Zan navigue, **alors** la largeur logique reste 560 px, le vertical parcourt les étagères et l’horizontal ou les boutons parcourent les modules sans compression.
- **Étant donné** une collection vide, **quand** un statut est ouvert, **alors** un module vide, une explication et des actions distinctes Catalogue/ajout manuel sont fournis sans faux livre.
- **Étant donné** ordinateur large, ordinateur étroit, tablette paysage ou portrait, **quand** la vue s’adapte, **alors** les résultats et commandes restent équivalents et le téléphone n’est pas ciblé.

### Story 3.3 : Naviguer entièrement au clavier et avec aides techniques

En tant que Zan, je veux parcourir la bibliothèque sans geste obligatoire, afin d’obtenir la même expérience quelle que soit mon interaction.

**Traçabilité :** CAP-11 ; FR-28, FR-29 ; NFR-3, NFR-5, NFR-6, NFR-9 ; AD-11.

**Critères d’acceptation :**

- **Étant donné** le viewport, **quand** Zan utilise le clavier, **alors** Tab entre/sort d’un module, les flèches parcourent une étagère, Haut/Bas changent d’étagère, Home/End atteignent les extrémités et Page précédente/suivante change de module.
- **Étant donné** une Tranche focalisée, **quand** elle est annoncée, **alors** titre, volume, édition, statut, position et sélection sont exposés ; les images décoratives sont masquées.
- **Étant donné** toute cible, **quand** elle reçoit le focus, **alors** l’indicateur deux tons + accent atteint 3:1, reste visible et n’est pas masqué par une barre flottante.
- **Étant donné** zoom 200 %, reflow 400 %/320 CSS px ou espacement WCAG 1.4.12, **quand** la page reflue, **alors** texte et commandes restent disponibles sans chevauchement ni défilement bidimensionnel du chrome.

### Story 3.4 : Gérer l’extension des modules sans limite arbitraire

En tant que Zan, je veux que ma bibliothèque s’agrandisse, afin d’organiser au moins 100 exemplaires sans perdre mes repères.

**Traçabilité :** CAP-2, CAP-11, CAP-12 ; FR-3, FR-4, FR-28, FR-29 ; NFR-1 à NFR-4, NFR-9, NFR-10 ; AD-5, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** le dernier module plein, **quand** un placement valide est ajouté, **alors** exactement un module suivant est créé dans la même transaction.
- **Étant donné** un module intermédiaire vide, **quand** son dernier objet part, **alors** il persiste ; seuls les modules terminaux vides sont supprimables sans renumérotation.
- **Étant donné** 100 exemplaires, **quand** Zan navigue et manipule, **alors** visibles, voisins et cible opérationnelle sont rendus sans démonter la cible focalisée.
- **Étant donné** un échec de création ou placement, **quand** la transaction échoue, **alors** aucun module vide orphelin ni placement partiel n’existe.

### Story 3.5 : Afficher des visuels de couverture et de tranche indépendants

En tant que Zan, je veux distinguer la couverture et la tranche de chaque exemplaire, afin de reconnaître plusieurs exemplaires d’une même œuvre.

**Traçabilité :** CAP-5, CAP-11, CAP-12 ; FR-8 à FR-12, FR-28, FR-29 ; NFR-1, NFR-3, NFR-5, NFR-6 ; AD-4, AD-8, AD-11.

**Critères d’acceptation :**

- **Étant donné** plusieurs exemplaires d’une œuvre, **quand** leurs fiches et Tranches s’affichent, **alors** ils partagent UserWork et historique tout en gardant édition, exemplaire et choix de visuels distincts.
- **Étant donné** des actifs disponibles, **quand** un visuel est choisi, **alors** couverture et tranche se sélectionnent indépendamment et une Tranche authentique est prioritaire.
- **Étant donné** aucune Tranche authentique, **quand** le fallback est produit, **alors** il est déterministe, versionné, accessible, provisoire et remplaçable ; attente ou échec affiche un placeholder textuel.
- **Étant donné** le retrait d’un choix personnel, **quand** il est confirmé, **alors** aucun actif commun encore référencé n’est supprimé.

## Epic 4 : Organisation et repérage libres

### Story 4.1 : Déplacer un exemplaire par geste ou commande visible

En tant que Zan, je veux déplacer un exemplaire vers une position choisie, afin de ranger selon ma logique avec toute modalité d’interaction.

**Traçabilité :** CAP-6, CAP-11, CAP-12 ; FR-14, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-9, NFR-10 ; AD-5, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** un exemplaire, **quand** Zan utilise glisser-déposer ou « Déplacer », **alors** les deux adaptent la même commande avec statut, module, étagère et position explicites.
- **Étant donné** une destination valide, **quand** elle est prévisualisée, **alors** insertion, reflow local et annonce de destination sont perceptibles sans déplacer l’ordre relatif des autres livres.
- **Étant donné** une destination invalide, **quand** Zan tente de confirmer, **alors** rouge, symbole et texte expliquent le refus et l’état précédent reste strictement intact.
- **Étant donné** clavier seul, **quand** Zan déplace, **alors** listes de destination et boutons Monter/Descendre/Avant/Après permettent le même résultat et le focus atteint la destination.

### Story 4.2 : Déplacer atomiquement une sélection

En tant que Zan, je veux sélectionner et déplacer plusieurs exemplaires, afin de ranger une série sans mouvement partiel.

**Traçabilité :** CAP-6, CAP-11, CAP-12 ; FR-14, FR-15, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-10 ; AD-5, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** le mode sélection, **quand** Zan utilise clic, toucher ou Espace, **alors** le compte et l’état de chaque membre sont visibles et annoncés.
- **Étant donné** une destination suffisante, **quand** Zan confirme, **alors** toutes les cibles sont reverifiées, verrouillées dans l’ordre des identifiants et déplacées dans une transaction unique.
- **Étant donné** une version divergente, une cible indisponible ou une capacité insuffisante, **quand** la commande s’exécute, **alors** aucun membre ne bouge, le dernier état confirmé est restauré et le conflit est expliqué.
- **Étant donné** une action Annuler, **quand** elle est demandée, **alors** une commande inverse vérifie les versions ; elle ne détruit jamais une modification concurrente.

### Story 4.3 : Créer des groupes, thèmes et repères personnels

En tant que Zan, je veux regrouper et marquer mes exemplaires selon plusieurs axes, afin de représenter ma propre organisation.

**Traçabilité :** CAP-6, CAP-11, CAP-12 ; FR-15 à FR-19, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6 ; AD-5 à AD-7, AD-11.

**Critères d’acceptation :**

- **Étant donné** une sélection, **quand** Zan confirme un groupe durable, **alors** son nom, ordre, total et répartition par statut persistent sans posséder les slots de rangement.
- **Étant donné** des thèmes multiples, **quand** ils sont affectés, **alors** leurs associations many-to-many ne changent aucun Placement.
- **Étant donné** un repère coloré, **quand** il s’affiche, **alors** un libellé, motif ou icône fournit la même information sans couleur.
- **Étant donné** une suggestion de série ou thème, **quand** elle est proposée, **alors** elle est opt-in, explicable, réversible et sans effet avant confirmation.
- **Étant donné** le retrait d’un exemplaire, **quand** il est confirmé, **alors** il est détaché de ses groupes et tout groupe devenu vide est supprimé atomiquement.

### Story 4.4 : Déplacer les membres pertinents d’un groupe transversal

En tant que Zan, je veux déplacer un groupe dans le statut courant, afin de rapprocher ses membres placés sans affecter les autres.

**Traçabilité :** CAP-6, CAP-11, CAP-12 ; FR-15, FR-16, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-10 ; AD-5, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** un groupe transversal, **quand** Zan choisit Déplacer depuis un statut, **alors** seuls les membres placés de ce statut sont inclus et les membres exclus, dont À ranger, sont comptés et annoncés.
- **Étant donné** une destination valide, **quand** la commande aboutit, **alors** les membres inclus deviennent un bloc ordonné et les liens du groupe transversal persistent.
- **Étant donné** une divergence ou un espace insuffisant, **quand** la commande échoue, **alors** l’opération entière est annulée et l’ordre exact précédent est restauré.
- **Étant donné** une région live, **quand** le bloc est déplacé, **alors** un résultat global est annoncé sans cascade livre par livre.

### Story 4.5 : Rechercher et localiser un exemplaire sans le réordonner

En tant que Zan, je veux retrouver un exemplaire précis, afin d’aller directement à sa position dans une grande collection.

**Traçabilité :** CAP-2, CAP-6, CAP-11, CAP-12 ; FR-4, FR-17, FR-28, FR-29 ; NFR-1, NFR-3 à NFR-6, NFR-9, NFR-10 ; AD-5, AD-10, AD-11.

**Critères d’acceptation :**

- **Étant donné** une requête personnelle, **quand** les résultats s’affichent, **alors** chaque Exemplaire/Édition est distinct avec Couverture, statut et identification ; la recherche Catalogue reste séparée.
- **Étant donné** un résultat placé, **quand** Zan l’active, **alors** la position est résolue à nouveau, le bon statut/module/étagère s’ouvre, la Tranche reçoit focus et annonce, et aucun ordre ne change.
- **Étant donné** un exemplaire À ranger, **quand** il est activé, **alors** le panneau À ranger s’ouvre et le focalise.
- **Étant donné** aucun résultat, **quand** la recherche se termine, **alors** la requête reste présente et un lien distinct vers le Catalogue est proposé.

## Epic 5 : Lectures, relectures et récompenses discrètes

### Story 5.1 : Gérer l’intention de lire et commencer une lecture

En tant que Zan, je veux indiquer mon intention et commencer une lecture, afin de distinguer envie et lecture active.

**Traçabilité :** CAP-7, CAP-11, CAP-12 ; FR-20, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8, NFR-9 ; AD-4, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** une Œuvre, **quand** Zan active « À lire », **alors** UserWork conserve cette intention sans créer une Reading.
- **Étant donné** une date de début valide, **quand** Zan commence, **alors** une Reading ouverte distincte est créée, fige édition et pagination et la projection En cours prend priorité.
- **Étant donné** une Edition choisie dans le Catalogue ou créée manuellement et le choix « En cours », **quand** Zan fournit une date de début valide, **alors** Copy, UserWork, Reading ouverte et Placement de fin sont créés dans une transaction unique ; aucun objet partiel ne subsiste en cas d’échec.
- **Étant donné** une saisie invalide, **quand** la commande est refusée, **alors** les valeurs restent présentes et les erreurs accessibles indiquent la correction.
- **Étant donné** un dernier Copy retiré, **quand** le retrait est confirmé sans purge distincte, **alors** UserWork, intention et historique sont conservés.

### Story 5.2 : Enregistrer une progression sans fin automatique

En tant que Zan, je veux enregistrer mes pages lues, afin de suivre une lecture sans pression à la terminer.

**Traçabilité :** CAP-7, CAP-11, CAP-12 ; FR-20, FR-21, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8, NFR-9 ; AD-4, AD-6, AD-11.

**Critères d’acceptation :**

- **Étant donné** une Reading ouverte, **quand** Zan saisit un entier entre 0 et le total connu, **alors** les pages sont enregistrées et le panneau montre pages lues/total.
- **Étant donné** une pagination inconnue, **quand** Zan enregistre, **alors** les pages restent facultatives.
- **Étant donné** des pages égales au total, **quand** l’enregistrement réussit, **alors** aucune fin, note, récompense ni animation ne se déclenche.
- **Étant donné** une valeur invalide ou un échec réseau, **quand** la sauvegarde échoue, **alors** la valeur reste dans le champ, l’état confirmé ne change pas et Réessayer est disponible.

### Story 5.3 : Terminer explicitement une lecture

En tant que Zan, je veux terminer une occurrence avec ses données personnelles, afin de conserver un historique fidèle.

**Traçabilité :** CAP-7, CAP-8, CAP-11, CAP-12 ; FR-21 à FR-25, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 ; AD-4, AD-6, AD-9, AD-11.

**Critères d’acceptation :**

- **Étant donné** une Reading ouverte, **quand** Zan fournit une date de fin non antérieure au début, **alors** note sur 10 et commentaire deviennent facultativement disponibles seulement dans le parcours de fin.
- **Étant donné** le dialogue récapitulatif, **quand** Zan confirme « Terminer la Lecture », **alors** une seule soumission est engagée et Échap/Annuler reste disponible avant engagement.
- **Étant donné** le succès transactionnel, **quand** la fin est reçue, **alors** la Reading est close, l’historique persiste et l’Exemplaire rejoint À ranger sauf restauration de relecture.
- **Étant donné** une Edition choisie dans le Catalogue ou créée manuellement et le choix « Terminés », **quand** Zan fournit des dates de début et fin valides, **alors** Copy, UserWork, Reading terminée, RewardClaim/outbox et projection À ranger sont créés atomiquement ; aucun gain n’est annoncé avant le reçu economy.
- **Étant donné** un échec avant clôture, **quand** aucun reçu n’existe, **alors** l’Exemplaire reste En cours et aucun montant n’est montré.

### Story 5.4 : Commencer et achever une relecture

En tant que Zan, je veux enregistrer chaque relecture séparément, afin de conserver toutes mes occurrences sans perdre la position du livre.

**Traçabilité :** CAP-7, CAP-8, CAP-12 ; FR-20 à FR-25 ; NFR-1, NFR-2, NFR-8 ; AD-4, AD-5, AD-6, AD-9.

**Critères d’acceptation :**

- **Étant donné** une lecture terminée, **quand** Zan commence une relecture, **alors** une nouvelle Reading est créée sans modifier les précédentes et la place Terminés est réservée.
- **Étant donné** la relecture active, **quand** les projections s’affichent, **alors** l’Exemplaire est En cours tout en gardant sa réservation.
- **Étant donné** la fin de relecture, **quand** la place réservée existe, **alors** elle est restaurée ; sinon l’Exemplaire rejoint À ranger.
- **Étant donné** une purge personnelle distincte, **quand** elle est explicitement confirmée, **alors** un tombstone conserve le dernier rang récompensé et toute lecture future poursuit ce rang.

### Story 5.5 : Créditer une récompense unique après la fin

En tant que Zan, je veux découvrir mon gain après sauvegarde, afin que la récompense reste une surprise discrète et fiable.

**Traçabilité :** CAP-8, CAP-12, CAP-11 ; FR-23 à FR-25, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 ; AD-6, AD-9, AD-11, AD-12.

**Critères d’acceptation :**

- **Étant donné** une lecture non terminée, **quand** les surfaces de lecture s’affichent, **alors** aucun montant potentiel n’est visible.
- **Étant donné** une première fin, **quand** le claim est calculé, **alors** le montant vaut `min(100,max(5,arrondi(pages/10)))`, ou 20 sans pagination, avec formule, pagination, rang et montant figés.
- **Étant donné** une relecture, **quand** le montant est calculé, **alors** il est la moitié arrondie à l’inférieur du montant précédent, jusqu’à zéro, sans recréer une première lecture.
- **Étant donné** le reçu economy, **quand** le crédit est confirmé, **alors** la révélation affiche une fois le montant et le nouveau solde, sans confettis et selon la réduction des animations.
- **Étant donné** une Lecture close mais un crédit en attente, **quand** le consommateur est rejoué, **alors** la fin reste acquise, le message distingue les deux états et le registre n’est jamais crédité deux fois.

## Epic 6 : Boutique, inventaire et décoration sans altération

### Story 6.1 : Consulter l’assortiment cosmétique initial

En tant que Zan, je veux consulter une boutique sobre, afin de choisir des bibelots sans pression ni avantage fonctionnel.

**Traçabilité :** CAP-9, CAP-11 ; FR-26, FR-28, FR-29 ; NFR-3, NFR-5, NFR-6, NFR-9 ; AD-9, AD-11.

**Critères d’acceptation :**

- **Étant donné** la Boutique, **quand** elle s’ouvre, **alors** elle contient exactement 4 objets à 10, 4 à 25, 3 à 50 et 1 à 100 pièces.
- **Étant donné** une carte produit, **quand** elle s’affiche, **alors** visuel, nom, catégorie, prix, solde, possession et multiplicité sont perceptibles sans dépendre de la couleur.
- **Étant donné** tout produit, **quand** ses effets sont inspectés, **alors** il n’accorde jamais capacité, place ou fonction.
- **Étant donné** ordinateur, tablette ou clavier, **quand** Zan parcourt la Boutique, **alors** les mêmes informations et actions sont disponibles avec cibles conformes.

### Story 6.2 : Acheter sans double débit ni culpabilisation

En tant que Zan, je veux acheter un bibelot avec mes pièces, afin de l’ajouter à mon inventaire en toute confiance.

**Traçabilité :** CAP-9, CAP-12, CAP-11 ; FR-26, FR-28, FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-8 ; AD-6, AD-9 à AD-12.

**Critères d’acceptation :**

- **Étant donné** un solde suffisant, **quand** Zan confirme, **alors** portefeuille et produit sont verrouillés et débit, achat, reçu et InventoryItem sont créés atomiquement.
- **Étant donné** une double soumission ou réponse inconnue, **quand** le statut est vérifié avec la même clé, **alors** l’interface affiche « Vérification de l’achat… » et n’affirme rien avant le reçu autoritatif.
- **Étant donné** un produit unique déjà possédé, **quand** l’achat est tenté, **alors** le doublon est refusé ; un produit multiple crée au contraire une unité distincte.
- **Étant donné** un solde insuffisant, **quand** la carte s’affiche, **alors** prix et manque sont indiqués sans culpabilisation et l’action focusable `aria-disabled` ne déclenche rien.
- **Étant donné** un achat échoué, **quand** aucun reçu n’existe, **alors** aucun débit ni objet n’est confirmé et Réessayer est proposé.

### Story 6.3 : Conserver et retrouver les objets possédés

En tant que Zan, je veux conserver un objet sans le placer, afin de décorer plus tard.

**Traçabilité :** CAP-9, CAP-10, CAP-11, CAP-12 ; FR-26 à FR-29 ; NFR-1, NFR-3, NFR-5, NFR-6, NFR-9 ; AD-9 à AD-11.

**Critères d’acceptation :**

- **Étant donné** un achat confirmé, **quand** Zan quitte la Boutique, **alors** l’InventoryItem persiste sans Placement obligatoire.
- **Étant donné** l’inventaire, **quand** il s’ouvre, **alors** chaque unité indique Disponible ou Placé, sa quantité autorisée et une action appropriée.
- **Étant donné** un inventaire vide, **quand** il s’affiche, **alors** il explique ce qui y apparaîtra et propose une seule action pertinente vers la Boutique.
- **Étant donné** une actualisation ou reconnexion, **quand** l’inventaire est rechargé, **alors** possession et placement confirmés restent cohérents.

### Story 6.4 : Placer un bibelot avec reflow local atomique

En tant que Zan, je veux placer un bibelot entre mes livres, afin de décorer une étagère sans défaire son ordre.

**Traçabilité :** CAP-10, CAP-11, CAP-12 ; FR-27 à FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-9, NFR-10 ; AD-5, AD-6, AD-9, AD-11.

**Critères d’acceptation :**

- **Étant donné** un objet disponible, **quand** Zan choisit étagère et intervalle par geste ou commande visible, **alors** la possession est reverifiée et le reflow prévisualisé reste limité à l’étagère.
- **Étant donné** un espace total suffisant, **quand** le placement est confirmé, **alors** objet et livres sont placés atomiquement, sans chevauchement et en préservant l’ordre relatif des livres.
- **Étant donné** un espace insuffisant, **quand** la destination est prévisualisée, **alors** rouge, symbole et texte rendent le dépôt impossible et aucune autre étagère n’est affectée.
- **Étant donné** un conflit ou échec, **quand** la commande se termine, **alors** le dernier état confirmé est restauré sans objet dupliqué ni rangement partiel.
- **Étant donné** une aide technique, **quand** le reflow aboutit, **alors** le résultat global et la destination sont annoncés une seule fois.

### Story 6.5 : Déplacer, remplacer ou retirer un bibelot

En tant que Zan, je veux modifier la place d’un bibelot ou le remettre en inventaire, afin de faire évoluer ma décoration sans perdre mes livres.

**Traçabilité :** CAP-10, CAP-11, CAP-12 ; FR-27 à FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-9, NFR-10 ; AD-5, AD-6, AD-9, AD-11.

**Critères d’acceptation :**

- **Étant donné** un objet placé, **quand** Zan le déplace, **alors** le même parcours accessible que pour un exemplaire produit une mutation atomique.
- **Étant donné** un remplacement, **quand** le nouvel objet tient, **alors** la position est conservée ; sinon une nouvelle destination est demandée sans changer l’objet original.
- **Étant donné** un retrait confirmé, **quand** la commande réussit, **alors** le Placement disparaît et l’objet redevient Disponible sans supprimer l’achat.
- **Étant donné** Annuler ou un échec, **quand** le parcours se ferme, **alors** objet, position et ordre des livres reviennent exactement à l’état confirmé et le focus retourne à la cible logique.

### Story 6.6 : Modifier les choix cosmétiques sans toucher au rangement

En tant que Zan, je veux changer le style du meuble ou appliquer un ornement acquis, afin de personnaliser la bibliothèque sans déplacer son contenu.

**Traçabilité :** CAP-10, CAP-11, CAP-12 ; FR-27 à FR-29 ; NFR-1 à NFR-3, NFR-5, NFR-6, NFR-9, NFR-10 ; AD-5, AD-6, AD-9, AD-11.

**Critères d’acceptation :**

- **Étant donné** un style gratuit ou un ornement possédé, **quand** Zan le prévisualise, **alors** le chrome conserve ses tokens et aucun Placement, groupe ou position n’est muté.
- **Étant donné** un ornement acquis, **quand** Zan confirme, **alors** sa possession est reverifiée avant l’application.
- **Étant donné** la préférence Système/Clair/Sombre ou réduction des animations, **quand** elle change, **alors** le résultat est accessible, persistant et conforme aux tokens de `DESIGN.md`.
- **Étant donné** un échec ou une annulation, **quand** le parcours se termine, **alors** le style courant, tous les Exemplaires, groupes et Bibelots gardent strictement leur état confirmé.

## Dépendances, risques et hypothèses

- L’ordre recommandé est 1 → 2 → 3 → 4 → 5 → 6 ; chaque epic livre toutefois un résultat complet sur les fondations précédentes et ne requiert aucun epic futur.
- Les risques majeurs sont la concurrence de rangement, l’idempotence des crédits/achats, la qualité des médias importés, la performance du viewport à 100 exemplaires, l’accessibilité de la métaphore spatiale et la résilience des fournisseurs.
- Les objectifs RPO/RTO et la rétention restent une question ouverte avant production ; ils ne bloquent ni le développement ni la validation fonctionnelle du MVP.
- Les structures et finitions gratuites sont traitées comme projections cosmétiques de base, conformément à l’hypothèse adoptée de la SPEC.
- Les non-objectifs de la SPEC sont exclus : téléphone, import CSV, social, prêts, catalogage professionnel, promotions et capacités payantes.
