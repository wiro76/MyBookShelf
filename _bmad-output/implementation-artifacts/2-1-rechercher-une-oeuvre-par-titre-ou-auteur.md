---
story_id: "2.1"
story_key: "2-1-rechercher-une-oeuvre-par-titre-ou-auteur"
epic: 2
status: ready-for-dev
created: "2026-08-07"
baseline_commit: "19cd77a0e208d22976880a1db3880b641847ce23"
---

# Story 2.1 : Rechercher une œuvre par titre ou auteur

Status: review

## Story

En tant que Zan,
je veux interroger un Catalogue distinct de ma recherche personnelle,
afin de trouver l’œuvre que je possède sans modifier ma bibliothèque avant une confirmation explicite.

## Acceptance Criteria

1. **Sources et priorité.** Étant donné une requête non vide par titre ou auteur, quand Zan recherche, alors Google Books est interrogé comme source principale, Open Library comme complément et la BnF comme enrichissement français ; Amazon n’est jamais appelé. Les résultats Google restent prioritaires, une panne d’un complément ne supprime pas les résultats valides et aucun retry automatique caché n’est exécuté.
2. **Candidats non autoritatifs.** Étant donné une réponse fournisseur, quand l’adaptateur la traite, alors il produit uniquement un `NormalizedCandidate` bibliographique non classé canoniquement, borné, avec une `primaryClaim`, une référence opaque déterministe, les métadonnées d’œuvre disponibles, zéro ou plusieurs `EditionCandidate` et chaque `SourceClaim` (clé stable, fournisseur, identifiant, SHA-256 de la projection source normalisée, date de collecte, droits connus/inconnus). Chaque valeur retenue référence au moins une claim qui l’atteste. Aucune réponse brute ne traverse la frontière applicative et aucun Work, Edition, Copy, UserWork, Placement, média ou ligne SQL n’est créé ou modifié.
3. **Fusion exacte et ordre stable.** Étant donné plusieurs candidats, quand les résultats sont consolidés, alors une fusion n’a lieu que sur ISBN normalisé exact ou référence fournisseur identique ; une similarité titre/auteur ne fusionne jamais automatiquement. L’ordre est déterministe, borné à 25 candidats, avec 10 résultats maximum par fournisseur.
4. **Fiche avant ajout.** Étant donné des résultats, quand Zan active le même candidat au pointeur, au tactile ou au clavier, alors sa fiche complète non persistée s’ouvre sur la même surface avec titre, auteurs, description, langues, date, identifiants et provenance disponibles. Aucun ajout rapide ni commande de mutation n’est présent ; l’unique suite annoncée est le choix d’édition livré par 2.2.
5. **Aucun résultat.** Étant donné que les trois fournisseurs répondent correctement sans candidat, quand la recherche se termine, alors l’état `empty` conserve la requête et son mode et propose `/catalogue/ajout-manuel` avec ces valeurs validées. Une ou deux réponses valides, même vides, accompagnées d’au moins une panne produisent `partial`, jamais une absence certaine.
6. **Panne stable et réessayable.** Étant donné un ou plusieurs fournisseurs indisponibles, lents, invalides ou limités, quand la recherche se termine, alors la table de vérité est fermée : `complete` = trois réponses valides avec candidats ; `empty` = trois réponses valides sans candidat ; `partial` = une ou deux réponses valides, même vides ; `unavailable` = zéro réponse valide. Le message utilisateur ne contient aucun texte, statut brut, URL ou corps fournisseur ; Réessayer conserve la requête et l’ajout manuel reste disponible.
7. **Validation, sécurité et accessibilité.** Étant donné une saisie hostile ou une session absente, quand la recherche est soumise, alors la requête Unicode normalisée est bornée à 200 caractères avant tout appel, une session vérifiée côté serveur est obligatoire, les fournisseurs ne sont appelés que côté serveur et aucun terme/titre/auteur/identifiant fournisseur n’entre dans les logs. Sur ordinateur large/étroit et tablette portrait/paysage, le formulaire, les résultats, la fiche, le focus, les annonces et les actions restent équivalents au pointeur, tactile et clavier, y compris zoom 200 %, reflow 320 CSS px et espacement WCAG 1.4.12.

## Tasks / Subtasks

- [x] T1 — Définir le domaine candidat et ses invariants (AC: 2, 3, 7)
  - [x] Créer `src/modules/catalog/domain/normalized-candidate.ts` avec `CatalogProviderId`, `SourceClaim`, `EditionCandidate`, `NormalizedCandidate`, normalisation ISBN, empreinte SHA-256, référence opaque et fusion exacte.
  - [x] Représenter chaque métadonnée fusionnable par `Provenanced<T> { value, claimRefs }`; refuser une valeur sans claim existante et fusionner les références sans perdre l’origine de chaque valeur.
  - [x] Borner toutes les chaînes/listes et refuser les candidats sans titre ou source stable ; ne jamais inventer une valeur absente.
  - [x] Ancrer `candidateRef` sur la `primaryClaim` déterministe selon la priorité Google > Open Library > BnF ; l’ajout ou la panne d’une provenance complémentaire ne recalcule pas la référence.
  - [x] Écrire d’abord les tests unitaires : déterminisme, ISBN-10/13, fusion exacte, non-fusion par similarité, granularité œuvre/éditions, stabilité Google seul/+OL/+BnF, ordre et limites.

- [x] T2 — Implémenter les ports et l’orchestrateur de recherche (AC: 1, 3, 5, 6, 7)
  - [x] Créer `CatalogProvider`, `CatalogSearchRequest` (`mode: title | author`) et l’union `CatalogSearchOutcome` (`invalid | complete | partial | empty | unavailable`) selon la table de vérité normative des AC 5/6.
  - [x] Normaliser NFKC, trim et espaces de la requête ; refuser vide ou > 200 caractères avant tout fournisseur.
  - [x] Appeler les trois fournisseurs en parallèle avec 3 s maximum par source et 5 s maximum global, annulation via `AbortSignal`, sans retry caché.
  - [x] Stabiliser les erreurs et journaux : uniquement fournisseur, durée, outcome, compteur et correlation ID ; aucune donnée bibliographique ou réponse brute.

- [x] T3 — Livrer les trois adaptateurs externes bornés (AC: 1, 2, 6, 7)
  - [x] Google Books : `GET /books/v1/volumes`, `intitle:`/`inauthor:`, `printType=books`, `projection=full`, `maxResults=10` et paramètre `fields` fermé aux métadonnées utilisées ; clé serveur optionnelle au build et validée au point d’usage.
  - [x] Open Library : `GET /search.json` avec `title` ou `author`, `lang=fr`, `limit=10` et liste explicite `key,title,author_name,first_publish_year,editions` plus champs `editions.*` nécessaires ; ne jamais demander `fields=*`.
  - [x] BnF : SRU 1.2 `searchRetrieve`, critère `bib.title` ou `bib.author`, `recordSchema=dublincore`, `maximumRecords=10`; parser le XML avec `fast-xml-parser@5.10.1`, jamais par regex.
  - [x] Construire les langages de requête avec des encodeurs dédiés : neutraliser contrôles, antislashs, guillemets et opérateurs dans le terme Google/BnF avant de l’insérer dans un unique critère, puis laisser `URLSearchParams` encoder le transport. Tester guillemets, `and/or/not`, préfixes de champ et antislashs hostiles.
  - [x] Utiliser `redirect: manual`, refuser tout 3xx et tout statut autre que 200 ; exiger JSON pour Google/Open Library et XML pour BnF. Lire le flux décompressé par chunks avec plafond 1 Mio avant parsing.
  - [x] Accepter uniquement HTTPS et les origines officielles ; une origine loopback n’est autorisée que sous `ENABLE_E2E_HARNESS=1`. Revalider l’URL finale avant traitement.
  - [x] Pour BnF, refuser `DOCTYPE`/entités, désactiver `processEntities`, puis borner après parsing profondeur à 32 et nœuds à 10 000 ; tester namespaces, répétitions, profondeur hostile et redirection externe.
  - [x] Ajouter une configuration catalogue `read*` tolérante au build et `require*` stricte à l’exécution, sans exposer clé ou URL au client.

- [x] T4 — Construire la surface Catalogue privée et accessible (AC: 4, 5, 6, 7)
  - [x] Ajouter `/catalogue`, dynamique et `no-store`, avec garde `getVerifiedSession()` avant tout rendu privé ; conserver la destination à travers `/connexion` via l’allowlist existante.
  - [x] Ajouter une Server Action mince et un composant client utilisant une union d’état sérialisable ; aucun appel fournisseur ni règle de normalisation dans le composant.
  - [x] Fournir contrôle titre/auteur, champ libellé, validation reliée, région live, résultats activables, fiche avec focus géré, Réessayer et lien vers `/catalogue/ajout-manuel?mode=...&q=...`.
  - [x] Livrer cette route comme surface de transfert non mutante : garde session, validation identique, champs préremplis et message indiquant que la création sera disponible avec Story 2.6 ; aucune soumission de création ni faux succès.
  - [x] Ajouter `CATALOG_REDIRECT = "/catalogue"` à l’allowlist littérale existante et ses tests hostiles ; préserver les fallbacks actuels.
  - [x] Ajouter depuis `/bibliotheque` une action visible « Rechercher dans le Catalogue », distincte de la future recherche personnelle.
  - [x] Étendre les styles existants sans carte imbriquée, sans couleur seule, avec cibles 44 px/48 px tactile, focus deux tons et dimensions stables.

- [x] T5 — Prouver les contrats fournisseur et l’absence de mutation (AC: 1 à 7)
  - [x] Unitaires : validation hostile JSON/XML, champs absents, empreinte/référence, limites, états fermés, timeout/abort, stabilisation d’erreur et fuite.
  - [x] Unitaires de provenance : chaque valeur et chaque édition conserve ses `claimRefs` après fusion multi-source ; aucune claim orpheline ou inconnue n’est sérialisée.
  - [x] Intégration : faux serveur Catalogue déterministe couvrant succès, vide, JSON/XML invalide, réponse > 1 Mio, 429, 500, lenteur et connexion interrompue ; prouver priorité Google et isolation des pannes.
  - [x] Test négatif architectural : aucune migration, aucun import PostgreSQL/repository canonique ni écriture depuis `src/modules/catalog`; `/catalogue` peut dépendre uniquement de `identity/application/session` pour la garde Supabase. Session absente/indisponible = zéro appel fournisseur.
  - [x] Leak tests : requête, titre, auteurs et identifiants fournisseur absents des logs/traces/Sentry/erreurs ; corps brut, message/URL non autorisée et secret absents de l’état client. Seuls les champs normalisés bornés nécessaires à l’affichage peuvent atteindre le navigateur.
  - [x] E2E sur les quatre projets : titre, auteur, même candidat au pointeur/tactile/clavier, fiche sans ajout rapide, empty conservé, partial/unavailable, Réessayer, transfert manuel prérempli, focus/reflow/zoom.
  - [x] Prouver qu’aucune requête réseau, configuration, fixture ou chaîne d’adaptateur ne cible Amazon.

- [x] T6 — Clôturer la Definition of Done BMAD (AC: 1 à 7)
  - [x] Mettre à jour la matrice ci-dessous avec les fichiers/tests réellement livrés et conserver un scénario négatif par AC.
  - [x] Exécuter les portes ciblées puis `npm run ci:all`; ne marquer une tâche `[x]` qu’après résultat vert réel.
  - [x] Compléter Dev Agent Record, File List et Change Log ; passer la story et `sprint-status.yaml` à `review` seulement si toutes les tâches sont closes.

## AC → preuve → scénario négatif → porte CI

| AC | Preuve positive attendue | Scénario négatif obligatoire | Porte CI |
|---|---|---|---|
| AC1 | Intégration des trois adaptateurs, ordre Google stable | Complément en panne, aucun appel Amazon | `ci:integration`, `ci:leak` |
| AC2 | Unitaires de normalisation/provenance | Payload brut hostile et preuve de non-écriture | `ci:unit`, `ci:integration` |
| AC3 | Fusion ISBN/source exacte et limite 25 | Titres/auteurs similaires restent séparés | `ci:unit` |
| AC4 | Fiche activable sur quatre projets | Aucun ajout rapide ou mutation accessible | `ci:e2e`, `ci:budgets` |
| AC5 | État `empty` et requête conservée | Source en panne + zéro résultat devient `partial` | `ci:unit`, `ci:e2e` |
| AC6 | `partial`/`unavailable`, Réessayer | 429/500/timeout/XML invalide sans texte brut | `ci:integration`, `ci:leak`, `ci:e2e` |
| AC7 | Garde session, limites, matrice WCAG | Requête > 200, session absente, fuite logs | `ci:types`, `ci:leak`, `ci:e2e`, `ci:budgets` |

## Dev Notes

### Décisions techniques obligatoires

- Story 2.1 est strictement non mutante. Aucun cache persistant, migration, repository canonique ou pré-création Work/Edition n’est autorisé.
- `candidateRef` est dérivée de la `primaryClaim` choisie par priorité fournisseur et n’inclut pas `collectedAt`; l’ajout d’une claim complémentaire ne la modifie jamais. Deux candidats ne fusionnent que sur ISBN exact ou claim identique.
- Le hash de provenance porte sur une représentation normalisée bornée des champs source retenus, jamais sur une chaîne réordonnée de manière non déterministe.
- La construction d’URL ne sécurise pas la grammaire interne de `q` ou CQL : encoder séparément le terme dans le langage fournisseur, puis encoder les paramètres HTTP.
- Les réponses fournisseur peuvent changer. La fiche est un état de la recherche courante, pas une autorité durable.
- Un fournisseur qui retourne une réponse vide valide est `fulfilled`; un échec de transport, parsing, limite ou contrat est `failed`.
- La description fournisseur doit être traitée comme texte non fiable et rendue par React sans HTML injecté.
- Le délai global annule explicitement les appels encore actifs ; aucun résultat tardif ne peut modifier l’outcome déjà rendu.
- La table de vérité des cinq outcomes, le rejet des redirections et la stabilité de `candidateRef` sont des contrats de domaine, pas seulement des tests d’interface.
- Les URLs de couverture ne sont pas nécessaires à cette story ; ne pas ouvrir un nouveau périmètre média ou `next/image` externe.
- La page privée et la Server Action revérifient chacune la session. Une garde au seul rendu ne protège pas une soumission directe.

### Contrats suggérés

```ts
type CatalogProviderId = "google-books" | "open-library" | "bnf";

type SourceClaim = {
  claimRef: string;
  provider: CatalogProviderId;
  sourceId: string;
  fingerprintSha256: string;
  collectedAt: string;
  rights: { status: "known" | "unknown"; label?: string; url?: string };
};

type Provenanced<T> = {
  value: T;
  claimRefs: readonly string[];
};

type EditionCandidate = {
  editionRef: string;
  title: Provenanced<string>;
  publicationDate?: Provenanced<string>;
  pageCount?: Provenanced<number>;
  languages: readonly Provenanced<string>[];
  identifiers: readonly Provenanced<{ scheme: "isbn-10" | "isbn-13" | "other"; value: string }>[];
};

type NormalizedCandidate = {
  candidateRef: string;
  primaryClaim: SourceClaim;
  candidateKind: "work-with-editions" | "edition-only";
  title: Provenanced<string>;
  subtitle?: Provenanced<string>;
  authors: readonly Provenanced<string>[];
  description?: Provenanced<string>;
  languages: readonly Provenanced<string>[];
  publicationDate?: Provenanced<string>;
  identifiers: readonly Provenanced<{ scheme: "isbn-10" | "isbn-13" | "other"; value: string }>[];
  editions: readonly EditionCandidate[];
  sources: readonly SourceClaim[];
};
```

### Structure attendue

```text
src/modules/catalog/
  domain/normalized-candidate.ts
  application/catalog-provider.ts
  application/search-catalog.ts
  adapters/google-books.ts
  adapters/open-library.ts
  adapters/bnf-sru.ts
src/app/catalogue/
  actions.ts
  catalogue-search.tsx
  ajout-manuel/page.tsx
  page.tsx
  state.ts
tests/e2e/faux-service-catalogue.mjs
```

Fichiers à mettre à jour sans casser leur contrat : `src/modules/identity/application/redirect-allowlist.ts` et ses tests (ajout littéral `/catalogue`), `src/app/bibliotheque/page.tsx` (action Catalogue), `src/app/globals.css` (surface accessible), `src/shared/config/environment.ts` et `.env.example` (configuration serveur), `playwright.config.ts` (faux Catalogue), `package.json` et `package-lock.json` (seule dépendance XML).

Réutiliser `src/modules/identity/application/session.ts`, les unions d’état de `src/app/connexion`, les primitives `src/shared/observability`, le faux service Playwright existant et les hooks Node de tests. Ne pas copier leur logique.

### Dépendances et versions

- Ajouter uniquement `fast-xml-parser@5.10.1`, version exacte vérifiée le 2026-08-07, pour le XML SRU BnF.
- Conserver toutes les versions de `package.json` et les overrides existants. Aucun SDK Google/Open Library/BnF n’est nécessaire : utiliser `fetch` serveur injecté/testable.

### Références

- [Epics et stories — Story 2.1 et ordre Epic 2](../planning-artifacts/epics-and-stories-my-bookshelf.md)
- [Sprint Change Proposal 2026-08-07](../planning-artifacts/sprint-change-proposal-2026-08-07.md)
- [Project Context](../../docs/project-context.md)
- [Architecture AD-1, AD-7, AD-10 à AD-12](../planning-artifacts/architecture/architecture-Bibiliothéque%20virtuelle-2026-07-27/ARCHITECTURE-SPINE.md)
- [UX — recherche Catalogue, états empty/unavailable et UJ-2](../planning-artifacts/ux-designs/ux-Bibiliothéque%20virtuelle-2026-07-24/EXPERIENCE.md)
- [Google Books API — volumes search](https://developers.google.com/books/docs/v1/using)
- [Open Library Search API](https://openlibrary.org/dev/docs/api/search)
- [BnF — API SRU Catalogue général 1.2](https://api.bnf.fr/fr/api-sru-catalogue-general)
- [Next.js — Forms and Server Actions](https://nextjs.org/docs/app/guides/forms)

## Dev Agent Record

### Agent Model Used

GPT-5 Codex avec sous-agents BMAD spécialisés domaine, adaptateurs, preuves négatives et revue adversariale.

### Implementation Plan

1. Écrire les tests du domaine candidat, de provenance et des outcomes avant les implémentations T1/T2.
2. Livrer les adaptateurs HTTP derrière un lecteur borné et des encodeurs dédiés, puis leurs tests d’intégration hostiles.
3. Construire la surface privée Catalogue et le transfert manuel, puis les preuves E2E/accessibilité.
4. Exécuter les portes ciblées, compléter les preuves BMAD et finir par `npm run ci:all`.

### Debug Log References

- `node --test tests/unit/catalog-domain.test.mjs tests/unit/catalog-search.test.mjs tests/integration/catalog-adapters.test.mjs tests/integration/catalog-session-boundary.test.mjs tests/leak/catalog-leak.test.mjs tests/leak/observability-leak.test.mjs` — 45/45 vert après correctifs de revue.
- `npx playwright test tests/e2e/catalogue.spec.ts --workers=1` — 24/24 vert sur les quatre projets.
- `npm run ci:database` avec cible locale explicite — vert ; le canari de cookie attendu classe l'indisponibilité sans échec de gate.
- `npm run ci:e2e` avec cible locale explicite — 156/156 vert sur les quatre projets.
- `npm run ci:all` avec cible locale explicite — vert en 689 s après nettoyage des processus résiduels du harnais.
- Revue adversariale indépendante : findings corrigés sur enveloppes, provenance, bornes, DTO, sessions, observabilité et éditions.

### Completion Notes List

- Domaine bibliographique non autoritatif livré avec provenance versionnée, `candidateRef` stable, fusion exacte transitive, limites et ordre Google > Open Library > BnF.
- Trois adaptateurs serveur bornés livrés avec validation stricte JSON/SRU, origine/MIME/redirection contrôlés, XML durci et aucun retry caché.
- Surface privée `/catalogue` et transfert `/catalogue/ajout-manuel` livrés sans mutation ; l’état client est réduit à un DTO d’affichage sans claims, empreintes, identifiants fournisseur ni URLs de droits.
- Preuves AC1–AC3 : `catalog-domain.test.mjs`, `catalog-search.test.mjs`, `catalog-adapters.test.mjs`, `catalog-boundaries.test.mjs` et `catalog-leak.test.mjs`.
- Preuves AC4–AC7 : `catalog-session-boundary.test.mjs`, `redirect-allowlist.test.mjs` et `catalogue.spec.ts`, incluant pointeur, tactile réel, clavier, axe, zoom 200 %, reflow 320 px et espacement WCAG 1.4.12.
- `ci:all` couvre lint, types, tests unitaires, intégration, fuite, environnement, base, recovery, E2E, budgets, build et mutations ; résultat final vert.

### File List

- `.env.example`
- `_bmad-output/implementation-artifacts/2-1-rechercher-une-oeuvre-par-titre-ou-auteur.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `package-lock.json`
- `package.json`
- `playwright.config.ts`
- `src/app/bibliotheque/page.tsx`
- `src/app/catalogue/actions.ts`
- `src/app/catalogue/ajout-manuel/page.tsx`
- `src/app/catalogue/catalogue-search.tsx`
- `src/app/catalogue/page.tsx`
- `src/app/catalogue/state.ts`
- `src/app/globals.css`
- `src/modules/catalog/adapters/adapter-types.ts`
- `src/modules/catalog/adapters/bnf-sru.ts`
- `src/modules/catalog/adapters/catalog-http.ts`
- `src/modules/catalog/adapters/google-books.ts`
- `src/modules/catalog/adapters/open-library.ts`
- `src/modules/catalog/adapters/query-encoding.ts`
- `src/modules/catalog/application/catalog-provider.ts`
- `src/modules/catalog/application/search-catalog.ts`
- `src/modules/catalog/domain/normalized-candidate.ts`
- `src/modules/identity/application/redirect-allowlist.ts`
- `src/shared/config/environment.ts`
- `src/shared/observability/index.ts`
- `src/shared/observability/logger.ts`
- `src/shared/observability/sentry.ts`
- `sentry.server.config.ts`
- `tests/e2e/catalogue.spec.ts`
- `tests/e2e/faux-service-catalogue.mjs`
- `tests/integration/catalog-adapters.test.mjs`
- `tests/integration/catalog-boundaries.test.mjs`
- `tests/integration/catalog-session-boundary.test.mjs`
- `tests/leak/catalog-leak.test.mjs`
- `tests/unit/catalog-domain.test.mjs`
- `tests/unit/catalog-search.test.mjs`
- `tests/unit/redirect-allowlist.test.mjs`

## Change Log

| Date | Changement |
|---|---|
| 2026-08-07 | Story créée après correct-course approuvé ; contrat non mutant, fournisseurs, UX, sécurité et preuves CI détaillés. |
| 2026-08-07 | Story 2.1 implémentée, revue adversarialement et corrigée ; validations ciblées et E2E complet verts ; statut passé à `review`. |
