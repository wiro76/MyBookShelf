---
project_name: "Bibiliothéque virtuelle"
user_name: "Zan-missel"
date: "2026-08-07"
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: complete
rule_count: 45
optimized_for_llm: true
---

# Project Context for AI Agents

Ce fichier contient les règles critiques que tout agent doit lire avant de modifier My BookShelf. Il privilégie les contraintes non évidentes qui préviennent les régressions.

## Technology Stack & Versions

- Node.js `24.18.0` déclaré dans `engines`; utiliser le lockfile, sans mise à niveau implicite.
- Next.js `16.2.12`, React/React DOM `19.2.8`, App Router et Server Components par défaut.
- TypeScript `6.0.2` pour l’éditeur et alias `typescript7@7.0.2` pour la porte `typecheck`; mode `strict`, résolution `bundler`, alias `@/* -> src/*`.
- Supabase JS `2.110.8`, `@supabase/ssr` `0.12.3`, PostgreSQL via le pin effectif `pg` `8.16.3`. L’architecture mentionne encore `8.22.0` : ne pas changer ce pin dans une story sans persistance ; résoudre l’écart avant Story 2.3.
- Sentry Next.js `10.68.0`, Playwright `1.62.1`, Axe Playwright `4.12.1`.
- Tailwind CSS 4; `sharp` est forcé à `0.35.3`. Toute dépendance ajoutée doit être nécessaire, précise et verrouillée.

## Critical Implementation Rules

### Language-Specific Rules

- Conserver TypeScript strict : pas de `any`, assertion aveugle ou type dupliqué pour contourner une frontière.
- Les cas d’usage rendent des unions discriminées fermées (`status`) ; une panne externe ne traverse pas l’application comme texte ou exception brute.
- Valider et borner toute entrée avant parsing, regex, allocation ou appel réseau. Les regex sur texte utilisateur doivent avoir des quantificateurs bornés et non ambigus.
- Utiliser des références opaques et déterministes pour les candidats externes; ne jamais les confondre avec un identifiant canonique local.
- Les valeurs absentes restent absentes. Ne pas inventer de métadonnée, provenance, droit, date ou fallback silencieux.
- Préférer les imports `@/` entre modules; conserver les imports relatifs pour les fichiers étroitement voisins d’une même surface.

### Framework-Specific Rules

- Organiser chaque domaine sous `src/modules/<module>/{domain,application,adapters,ui}`; les règles métier n’appartiennent ni aux pages ni aux Server Actions.
- Un module ne lit ni n’écrit les tables privées d’un autre module; les échanges passent par ports applicatifs, identifiants validés ou projections explicitement publiées.
- Une Server Action lit/valide `FormData`, revérifie session et destination, délègue au cas d’usage puis traduit une union structurée en état d’écran.
- Next.js reste l’unique façade des données privées. Aucun client navigateur ne parle directement à PostgreSQL, au service role ou à un fournisseur catalogue.
- Les variables nécessaires seulement à l’exécution restent optionnelles au build; les fonctions `require*Environment` les valident au point d’usage, sans valeur factice.
- Toute mutation privée passe par `authenticatedTransaction`, vérifie ownership et RLS, porte `commandId` et versions attendues, écrit le reçu dans la transaction et applique tout ou rien.
- `supabase/migrations` est l’unique historique SQL. Appliquer `expand-migrate-contract`, utiliser du SQL paramétré et conserver le même client `pg` pendant toute unité de travail.
- Les UUID persistés sont des UUIDv7 applicatifs; les instants utilisent UTC/`timestamptz`, les dates civiles PostgreSQL `date`, et code, schémas et contrats restent en anglais.
- Un échec réseau sans reçu n’est jamais affiché comme succès. Un rejeu avec le même `commandId` doit rendre le même reçu; un payload différent doit être refusé.
- Les adaptateurs catalogue produisent seulement des candidats normalisés. Seule une commande d’ajout explicite peut enrichir le canon Work/Edition.
- Préserver les états et focus accessibles sur les quatre modalités supportées; le téléphone reste hors périmètre MVP.

### Testing Rules

- Appliquer red-green-refactor pour chaque sous-tâche; ne cocher une tâche BMAD qu’après preuve positive, scénario négatif et régression verte.
- Tests unitaires dans `tests/unit/*.test.mjs`, intégration dans `tests/integration/*.test.mjs`, fuite dans `tests/leak/*.test.mjs`, E2E dans `tests/e2e/*.spec.ts`.
- Les tests Node peuvent charger TypeScript avec le pattern `registerHooks` puis relance `--experimental-strip-types`; réutiliser le pattern existant.
- Ne pas remplacer les canaris PostgreSQL/Supabase réels par des mocks. Les faux services E2E prouvent l’interface; les portes database/recovery prouvent la vérité serveur.
- Toute story interactive couvre les quatre projets Playwright : desktop souris, desktop clavier, tablette tactile portrait, tablette clavier paysage.
- Vérifier focus, régions live, zoom 200 %, reflow 320 CSS px, espacement WCAG 1.4.12, mouvement réduit et absence de dépendance au geste/couleur.
- Ajouter une preuve de non-mutation lorsqu’une story est consultative; aucune migration ni écriture DB ne doit apparaître indirectement.
- La validation finale est `npm run ci:all`; les portes ciblées servent au cycle court mais ne remplacent pas la suite complète.

### Code Quality & Style Rules

- Conserver les noms de fichiers en kebab-case, composants/types en PascalCase, fonctions/variables en camelCase et constantes partagées explicites.
- Les commentaires doivent expliquer une contrainte, un invariant ou une décision non évidente; ne pas narrer le code.
- Ne pas introduire une abstraction sans réduction réelle de duplication ou sans frontière déjà établie.
- Les erreurs utilisateur sont stables, françaises et indépendantes du texte fournisseur. Les erreurs de champs et pannes globales restent distinctes.
- Utiliser les primitives d’observabilité existantes (`logger`, `describeError`, correlation IDs, pseudonymisation) plutôt que des `console.*`.
- Les changements de documentation doivent maintenir les références de stories, la matrice FR et `sprint-status.yaml` cohérents.

### Development Workflow Rules

- Suivre BMAD : `create-story -> dev-story -> code-review -> CI -> done`; la revue doit être adversariale et idéalement exécutée par un autre agent.
- La Definition of Done de chaque story contient une matrice `AC -> preuve -> scénario négatif -> porte CI`.
- Mettre à jour ensemble le statut du fichier story et `_bmad-output/implementation-artifacts/sprint-status.yaml`.
- Ne jamais réécrire ou supprimer un changement utilisateur non lié. `.tmp/` reste hors staging.
- Les commits sont atomiques et en français selon le format observé (`feat:`, `fix:`, `docs:`, `chore:`); pousser `Dev` seulement après validation.

### Critical Don't-Miss Rules

- Ne jamais journaliser requête catalogue, titre, auteur, email, identifiant privé, corps fournisseur, secret ou URL signée. Les listes blanches d’observabilité font foi.
- Ne jamais utiliser un hash nu comme pseudonymisation; si la clé HMAC manque, omettre l’acteur de l’événement.
- Ne jamais importer `SUPABASE_SERVICE_ROLE_KEY` côté client ni réutiliser une clé publique comme secret worker/pseudonymisation.
- Ne jamais créer de table, faux rangement ou projection temporaire pour anticiper une story future.
- Ne jamais ouvrir un second Pool ou client SQL au milieu d’une transaction; l’atomicité, le rôle local et les claims RLS sont attachés au client courant.
- `Module`, `Shelf` et `Placement` ont des identifiants/ordres stables; ne pas renuméroter globalement ni produire plusieurs placements actifs pour un même objet.
- Ne jamais dupliquer `appendPlacement`; les Stories 2.4, 2.6, 3.4, 5.1 et 6.4 réutilisent l’invariant livré par 2.3.
- Pour le catalogue, Amazon est exclu. Google Books est principal, Open Library complémentaire et BnF enrichit le français; une panne ne bloque pas l’ajout manuel.
- Une similarité titre/auteur ne fusionne jamais automatiquement deux candidats ou deux entités canoniques; seule une preuve exacte autorise la fusion.

## Usage Guidelines

**Agents :** lire ce fichier avant toute implémentation, appliquer toutes les règles et préférer l’option la plus restrictive en cas de doute. Mettre à jour ce contexte lorsqu’une nouvelle règle durable est validée.

**Humains :** conserver ce document court, spécifique au projet et synchronisé avec les décisions d’architecture et les retours de rétrospective.

Dernière mise à jour : 2026-08-07
