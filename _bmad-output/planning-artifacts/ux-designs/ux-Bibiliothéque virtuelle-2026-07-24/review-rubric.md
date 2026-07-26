# Spine Pair Review — My BookShelf

## Overall verdict

La paire est mécaniquement solide : les quatre UJ sont couverts, les tokens se résolvent et les 20 composants sont spécifiés des deux côtés. Elle n’est toutefois pas encore sûre pour un handoff architecture/story-dev, car l’autorité du statut entre Œuvre, Lecture et Exemplaire contredit le PRD, et le parcours d’authentification requis n’est pas fermé dans l’IA ni dans les états.

## 1. Flow coverage — strong

Les quatre parcours sources UJ-1 à UJ-4 sont repris sous leur nom exact dans `Key Flows`. Chacun possède Romane comme protagoniste nommée et contextualisée, des étapes numérotées, un climax explicite et un chemin d’échec. Trois parcours complémentaires couvrent la progression sans clôture, le cycle d’un Bibelot et la personnalisation.

### Findings

Aucun manque.

## 2. Token completeness — strong

Les 43 couleurs sont des valeurs hexadécimales et disposent des paires clair/sombre attendues, à l’exception légitime du `scrim` commun. Les huit rôles typographiques, six rayons, quinze espacements et vingt composants respectent les types du `design-md-spec`; toutes les références `{path.to.token}` présentes dans la paire se résolvent. Les objectifs de contraste sont explicitement indiqués pour texte, commandes, focus et couples accent/on-accent.

### Findings

Aucun manque.

## 3. Component coverage — strong

Les mêmes 20 noms de composants apparaissent dans le frontmatter de `DESIGN.md`, dans `DESIGN.md.Components` et dans `EXPERIENCE.md.Component Patterns`. Chaque ligne visuelle décrit une anatomie ou un traitement, et chaque ligne comportementale porte de vraies règles d’usage et d’état.

### Findings

Aucun manque.

## 4. State coverage — adequate

Les états transversaux couvrent chargement, vide des bibliothèques, recherche, erreurs Catalogue, intégrité d’ajout, sauvegarde, hors-ligne, dépôt, sélection, localisation, Lecture, crédit, achat, inventaire, permissions et focus. Le parcours de connexion requis par FR-1 et quelques surfaces secondaires n’ont cependant pas leur contrat d’état propre.

### Findings

- **[high]** L’accès personnel existe dans le PRD, mais l’IA ne contient aucune surface Connexion/Session et les états ne couvrent ni session expirée, ni identifiants refusés, ni reprise après authentification (`EXPERIENCE.md`, Information Architecture § lignes 28–45 et State Patterns § lignes 90–117 ; PRD FR-1). *Fix:* ajouter la surface d’authentification et ses états minimaux, puis préciser la destination et la restauration de contexte après succès.
- **[medium]** Les surfaces Vue Couvertures, Groupes et Thèmes, Inventaire d’objets, Onboarding cosmétique et Réglages n’ont pas toutes un état vide, chargement ou indisponibilité explicitement attribué ; « Chargement initial » ne vise que Bibliothèques, Catalogue et Boutique (`EXPERIENCE.md`, Information Architecture § lignes 30–45 ; State Patterns § lignes 92–117). *Fix:* compléter le tableau par surface, en ajoutant uniquement les états applicables et leur issue de reprise.

## 5. Visual reference coverage — strong

Les dossiers `mockups/`, `wireframes/` et `imports/` ne contiennent aucun fichier : il n’existe donc aucun orphelin ni référence non spécifique dans le périmètre mécanique demandé. `DESIGN.md` déclare une fois la primauté des spines et identifie explicitement le seul aperçu exploratoire retenu dans `.working/`; les autres aperçus y sont déclarés rejetés.

### Findings

Aucun manque.

## 6. Bloat & overspecification — adequate

Les deux spines restent orientés décisions et tables ; ils ne recopient ni personas, ni métriques, ni formules d’économie du PRD. La plupart des répétitions soutiennent utilement l’atomicité et l’accessibilité, mais une courte section répète des règles déjà normatives ailleurs.

### Findings

- **[low]** « Règles produit spécifiques » répète presque mot pour mot les règles de placement, de Fiche et de sauvegarde déjà présentes dans Foundation, Component Patterns, State Patterns et Interaction Primitives (`EXPERIENCE.md` § lignes 168–180). *Fix:* fusionner chaque règle dans sa section propriétaire ou conserver ici seulement les invariants qui ne figurent nulle part ailleurs.

## 7. Inheritance discipline — broken

Les deux chemins `sources` se résolvent, les quatre noms UJ restent verbatim et les noms des 20 composants sont identiques. En revanche, un invariant de modèle contredit la source normative, les libellés de statut ne sont pas reliés au vocabulaire source, et `EXPERIENCE.md` ne référence aucun token de `DESIGN.md` par son nom.

### Findings

- **[critical]** `EXPERIENCE.md` attribue le statut à l’Exemplaire et organise Envie de lire/En cours/Terminés comme statuts de celui-ci, alors que le PRD place « À lire » sur l’Œuvre et « Commencée/Terminée » sur une Lecture ; ce choix change l’autorité de données sans réconciliation explicite (`EXPERIENCE.md` Foundation § ligne 16 et Statuts et placement § ligne 172 ; PRD FR-20 et glossaire Œuvre/Exemplaire/Lecture). *Fix:* décider explicitement si les trois bibliothèques sont des vues dérivées de l’état de l’Œuvre/Lecture ou un nouveau statut d’Exemplaire ; aligner ensuite le PRD et les deux spines avant tout travail d’architecture.
- **[high]** Les libellés visibles « Envie de lire », « En cours » et « Terminés » remplacent les termes normatifs « À lire », « Commencée » et « Terminée » sans table de correspondance entre vocabulaire d’interface et modèle (`EXPERIENCE.md` § lignes 31–33, 67 et 172 ; PRD § Glossaire et FR-20). *Fix:* ajouter une table courte « libellé UI → concept/statut normatif » et l’utiliser uniformément.
- **[medium]** `EXPERIENCE.md` contient zéro référence `{path.to.token}` alors que le contrat de la skill demande des références nominales vers `DESIGN.md`; les cibles, contrastes et modes sont seulement cités en texte ou en valeurs dupliquées (`EXPERIENCE.md` Accessibility Floor § lignes 143–153 et Responsive & Platform § lignes 159–166). *Fix:* remplacer les valeurs visuelles porteuses par les tokens applicables, par exemple `{spacing.pointer-target}`, `{spacing.touch-target}`, `{colors.focus}` et les paires de thème pertinentes.

## 8. Shape fit — adequate

`DESIGN.md` respecte l’ordre canonique complet. `EXPERIENCE.md` contient Foundation, Information Architecture, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, accessibilité, Responsive & Platform et Key Flows ; l’anti-pattern scan est justifié par l’addendum concurrentiel. Deux titres s’écartent toutefois de la forme attendue et peuvent fragiliser une extraction structurée.

### Findings

- **[medium]** Le titre obligatoire est écrit `## Accessibilité Floor` au lieu de `## Accessibility Floor` (`EXPERIENCE.md` § ligne 141). *Fix:* utiliser le titre canonique exact et conserver le contenu en français.
- **[low]** `Inspiration & Anti-patterns`, requis ici par les références et rejets documentés, est imbriqué en niveau 3 sous « Règles produit spécifiques » au lieu d’être une section de premier niveau du spine (`EXPERIENCE.md` § ligne 182). *Fix:* le remonter en `## Inspiration & Anti-patterns` avant `Key Flows`.

## Mechanical notes

- Frontmatter YAML lisible dans les deux fichiers ; `DESIGN.md` possède `name`, `description`, `status`, `sources` et `updated`.
- Les deux chemins relatifs de source atteignent bien `prd.md` et `addendum.md`.
- 67 références de tokens relevées dans la paire, toutes résolues ; elles se trouvent toutes dans `DESIGN.md`.
- 20 composants déclarés et 20 lignes correspondantes dans chacun des deux tableaux de composants, sans variation de nom.
- Aucun fichier dans `imports/`, `mockups/` ou `wireframes/`; les cinq artefacts existants restent sous `.working/`, hors du périmètre de promotion vérifié par cette passe.
- Aucun bloc Mermaid à valider.
