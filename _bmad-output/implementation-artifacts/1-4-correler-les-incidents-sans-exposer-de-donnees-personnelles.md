---
baseline_commit: 948d5bae699f224bf3aa66506f1fe9baf822c46c
---

# Story 1.4 : Corréler les incidents sans exposer de données personnelles

Status: done

## Story

En tant que Zan,
je veux que les incidents soient diagnostiquables sans fuite,
afin que la fiabilité n'affaiblisse pas ma confidentialité.

**Traçabilité :** CAP-1, CAP-12 ; FR-1 ; NFR-7, NFR-8 ; AD-10, AD-12.

Story d'infrastructure, sans surface visible. Elle décide de ce qu'on saura quand quelque chose cassera en production — et de ce qu'on ne saura jamais, parce qu'on aura refusé de l'écrire.

## Critères d'acceptation

1. **Étant donné** une requête, commande ou tâche, **quand** elle traverse l'application, **alors** `requestId`, `commandId`, `actorId` pseudonymisé et `jobId` sont propagés selon le contexte.
2. **Étant donné** un événement observable, **quand** il est journalisé, **alors** logs JSON, OpenTelemetry et `@sentry/nextjs` partagent les correlation IDs.
3. **Étant donné** les journaux et traces, **quand** un test de fuite s'exécute, **alors** aucun email, titre personnel, contenu importé, URL signée, secret ou PII n'est présent.
4. **Étant donné** une erreur fournisseur, **quand** elle atteint l'interface, **alors** elle est convertie en erreur stable sans texte ni identifiant sensible du fournisseur.

## Décisions tranchées

Non négociables. Toute autre interprétation est un écart à signaler, pas à décider seul. Les noms sont imposés : ils partent en production.

| Sujet | Décision |
|---|---|
| Emplacement | `src/shared/observability/` — `context.ts`, `ids.ts`, `pseudonymize.ts`, `logger.ts`, `errors.ts`, `index.ts`. |
| Sens des dépendances | **`workers` importe `shared`, jamais l'inverse.** `createJobId` **déménage** du worker vers `src/shared/observability/ids.ts`, et le worker l'importe. Sans ce déplacement, `shared → workers` inverse la graine d'architecture et crée un cycle. |
| Import dans le worker | Le worker **importe** `@/shared/observability`. Conséquence obligatoire : copier le bloc `registerHooks` de `tests/integration/database-outbox-canary.mjs` (~lignes 60-95) dans `tests/unit/deferred-effects.test.mjs`, sinon `ci:unit` casse en `ERR_MODULE_NOT_FOUND`. Et **amender le commentaire d'en-tête du worker** (lignes 7-12) qui affirme « aucun import relatif à l'exécution » — il deviendrait faux. |
| Logger | **Écrit à la main, aucune dépendance.** Ni pino, ni winston. Vercel parse déjà le JSON écrit sur `console.*`. |
| Format de log | Une ligne JSON : `level`, `message`, `timestamp` ISO 8601, puis les identifiants présents. |
| Redaction | **Liste blanche.** Le logger n'accepte que des champs explicitement autorisés. Une liste noire laisse passer ce qu'on n'a pas anticipé. |
| Contexte | `AsyncLocalStorage` **dans un Route Handler uniquement**. Aucune traversée middleware → handler : non confirmé sur Next 16, en faire un invariant serait une fausse garantie. |
| Pseudonymisation | **HMAC-SHA256**, clé en variable d'environnement **`OBSERVABILITY_PSEUDONYM_KEY`**. Jamais en dur. Absence de clé = erreur explicite, **jamais** de repli sur un hachage nu. |
| Fonctions d'environnement | `readObservabilityEnvironment` (tolérante, build) et `requireObservabilityEnvironment` (stricte, exécution), en miroir exact du couple `read`/`requireDeferredEffectsEnvironment` existant. |
| OpenTelemetry | **Ne pas installer `@vercel/otel`.** `@sentry/nextjs` 10 embarque et initialise son propre SDK OpenTelemetry ; monter les deux provoque un double enregistrement de tracer provider où l'un perd le contexte — soit exactement la garantie de l'AC 2. L'architecture ne liste d'ailleurs que `@sentry/nextjs`. |
| Sentry | `@sentry/nextjs@10.68.0`, version épinglée par l'architecture. **Initialisation conditionnée à la présence du DSN** : sans DSN, no-op silencieux. Aucun compte Sentry n'existe encore. |
| Options PII Sentry | `dataCollection`, **pas** `sendDefaultPii` — déprécié depuis 10.54, supprimé en v11. |
| Fichier d'instrumentation | **`src/instrumentation.ts`**, pas la racine : le projet utilise `--src-dir`, Next résout le hook dans `src/` quand ce dossier existe. Posé à la racine, il ne serait jamais chargé, silencieusement, sans qu'aucune porte ne le voie. |
| Erreurs | `{ code, message, fieldErrors?, conflict? }`, prescrit par l'architecture. Le texte fournisseur est journalisé côté serveur sous un code, et ne franchit jamais la frontière HTTP. |
| Porte CI | `ci:leak` = `node --test tests/leak/*.test.mjs`. **Dossier `tests/leak/` dédié** : placé dans `tests/unit/`, le test serait déjà exécuté par `ci:unit` et la porte serait un doublon sans valeur. |

## Tâches / Sous-tâches

- [x] **T1 — Identifiants et contexte de corrélation (AC: 1)**
  - [x] Déplacer `createJobId` de `src/workers/deferred-effects/index.ts` (ligne 324) vers `src/shared/observability/ids.ts`, et faire importer le worker. Conserver l'implémentation UUIDv7 telle quelle — 48 bits d'horodatage puis aléatoire, donc triable par date
  - [x] Créer `src/shared/observability/context.ts` : `AsyncLocalStorage` portant `{ requestId?, commandId?, actorId?, jobId? }`, **tous optionnels** — « propagés selon le contexte » : un worker n'a pas de `requestId`, une requête anonyme n'a pas d'`actorId`
  - [x] Exposer : ouvrir un contexte, en dériver un enrichi sans perdre l'existant, lire le contexte courant
  - [x] Exposer **`correlationAttributes()`**, fonction pure retournant les identifiants du contexte courant. C'est le point de convergence unique consommé par le logger, le scope Sentry et les attributs de span — la seule façon de rendre l'AC 2 testable (voir T4)
  - [x] Générer le `requestId` à l'entrée du Route Handler
  - [x] Ne stocker que des valeurs courtes et sérialisables

- [x] **T2 — Pseudonymisation (AC: 1, 3)**
  - [x] `src/shared/observability/pseudonymize.ts` : HMAC-SHA256 via `node:crypto`, clé `OBSERVABILITY_PSEUDONYM_KEY`
  - [x] Étendre `src/shared/config/environment.ts` avec `readObservabilityEnvironment` / `requireObservabilityEnvironment`. **Optionnelle au build** : la rendre obligatoire au démarrage casse `ci:static`, c'est déjà arrivé en 1.3
  - [x] Ajouter la variable à `.env.example` **et** au `.env` local, sans quoi rien ne s'exécute en développement
  - [x] Fournir la clé en CI : soit dans le bloc `env:` du job `quality` de `.github/workflows/ci.yml` (qui n'a aujourd'hui que 4 variables), soit injectée par le test lui-même. **Trancher et l'écrire** — sinon `ci:leak` échouera en CI alors que le code est sain
  - [x] Absence de clé ⇒ erreur explicite. Jamais de hachage nu de repli : sur un espace d'un seul utilisateur, un SHA-256 sans clé est réversible immédiatement

- [x] **T3 — Logger structuré (AC: 2, 3)**
  - [x] `src/shared/observability/logger.ts` : niveaux, JSON sur une ligne, horodatage ISO 8601, fusion automatique de `correlationAttributes()`
  - [x] Liste blanche stricte des champs acceptés
  - [x] Réutiliser `describeError` (worker, ligne 422, signature `(error: unknown) => { errorCode, errorMessage }`, bornée à 2000 caractères, rendue infaillible en revue de 1.3). **La déplacer avec `createJobId` vers `shared/observability/errors.ts`** — même raisonnement de sens de dépendance
  - [x] Tronquer avant la limite Vercel en gardant un JSON valide. Vérifier le plafond réel avant de figer le seuil : la valeur retenue est de 256 Ko par ligne, mais elle pilote une troncature, donc un chiffre faux la rend inutile ou destructrice
  - [x] Remplacer les 8 `console.error` — worker lignes **634, 731, 965, 974, 1029** ; route lignes **38, 47, 55**. Ils passent aujourd'hui l'objet `error` brut, dont la stack peut porter des fragments SQL

- [x] **T4 — Instrumentation et convergence (AC: 2)**
  - [x] Installer `@sentry/nextjs@10.68.0`. **Ne pas installer `@vercel/otel`**
  - [x] Créer **`src/instrumentation.ts`** : `register()` et `onRequestError` branché sur `Sentry.captureRequestError`
  - [x] Signature exacte : `onRequestError(error: unknown, request: { path, method, headers }, context: { routerKind, routePath, routeType, renderSource, revalidateReason, renderType })`. `error` est `unknown` — React a pu le retraiter, utiliser `digest`
  - [x] Configurer Sentry avec `dataCollection` fermé par défaut et un `beforeSend` en dernier filet. Init conditionnée au DSN
  - [x] Faire consommer `correlationAttributes()` par les trois sorties : logger, scope Sentry, attributs de span
  - [x] Si `sentry.server.config.ts` et `sentry.edge.config.ts` sont posés à la racine, **les ajouter au `include` de `tsconfig.typecheck.json`** — il ne couvre aujourd'hui que `next-env.d.ts`, `next.config.ts`, `playwright.config.ts`, `src/**` et `tests/**/*.ts`. Sinon la porte `types` est aveugle sur le code le plus neuf
  - [x] **Critère de sortie** : `next build` utilise Turbopack par défaut en Next 16 et `withSentryConfig` est historiquement un wrapper webpack. Si `ci:static` casse, retirer `withSentryConfig`, documenter la perte de sourcemaps, et continuer — la story n'est pas bloquée par ce point. Ne pas toucher à `typescript.ignoreBuildErrors: true`, qui est volontaire et indépendant

- [x] **T5 — Erreurs stables (AC: 4)**
  - [x] `src/shared/observability/errors.ts` : type `{ code, message, fieldErrors?, conflict? }` et conversion depuis une erreur quelconque. `fieldErrors` et `conflict` n'auront de producteur qu'à partir des stories de commandes — les typer sans les exercer
  - [x] Le texte d'origine et l'identifiant fournisseur sont journalisés côté serveur sous le code, jamais renvoyés
  - [x] Appliquer aux réponses **500** du Route Handler (`error: "configuration_invalide"` ligne 48, `error: "execution_echouee"` ligne 56). **Ne pas toucher aux chemins 200 et 401** : le canari outbox assert dessus (`skipped === false` ligne ~320, refus 401 lignes ~311-319) et `ci:database` casserait

- [x] **T6 — Test de fuite et porte CI (AC: 3)**
  - [x] Créer `tests/leak/observability-leak.test.mjs` : soumettre au logger un jeu d'entrées **hostiles** — email, titre de manga, contenu importé, URL signée, secret de worker, chaîne de connexion Postgres, JWT — et échouer si l'une ressort sous quelque forme que ce soit
  - [x] Couvrir le chemin indirect : objet imbriqué, `payload` d'enveloppe, erreur dont la stack contient un secret. C'est par là que les fuites arrivent réellement
  - [x] Tests unitaires : contexte, pseudonymisation (même entrée et même clé ⇒ même sortie ; clés différentes ⇒ sorties différentes ; jamais l'entrée en clair), conversion d'erreur, `correlationAttributes()`
  - [x] Copier le bloc `registerHooks` du canari dans `tests/unit/deferred-effects.test.mjs` (voir décision tranchée)
  - [x] Ajouter le script `"ci:leak": "node --test tests/leak/*.test.mjs"` dans `package.json` et l'inscrire dans l'agrégat `ci:all`
  - [x] Ajouter l'étape `- run: npm run ci:leak` au job `quality` de `.github/workflows/ci.yml`. ⚠️ **La CI n'appelle jamais `ci:all`** : elle énumère les portes une par une. Une porte ajoutée au seul agrégat n'est pas bloquante en pull request
  - [x] Ajouter l'entrée `{ "gate": "leak", "mutation": "<description>", "expectedExit": 1 }` dans `tests/fixtures/ci-gate-mutations.json`. `expectedExit` doit être non nul, une assertion le vérifie
  - [x] **Mettre à jour `tests/integration/ci-mutation.test.mjs` ligne 8.** Valeur actuelle exacte :
    `["lint", "types", "unit", "integration", "database", "outbox", "browser", "budgets", "environment", "static"]`
    Cible, `"leak"` inséré après `"outbox"` :
    `["lint", "types", "unit", "integration", "database", "outbox", "leak", "browser", "budgets", "environment", "static"]`
    Cet ordre est celui du **fixture**, qui n'est pas l'ordre d'exécution de `verify-ci-mutations.mjs` — ne pas se fier à ce dernier pour choisir la position
  - [x] Ajouter la mutation dans `scripts/verify-ci-mutations.mjs` : casser la redaction et prouver que `ci:leak` échoue

### Review Findings

- [x] [Review][Patch] Expurger les événements Sentry avant toute sortie externe : supprimer `user`, `extra`, `contexts`, breadcrumbs et texte d'exception brut, puis réinjecter uniquement la corrélation sûre.
- [x] [Review][Patch] Brancher la corrélation sur les spans Sentry via `beforeSendSpan`, sans installer `@vercel/otel`.
- [x] [Review][Patch] Refuser un `actorId` brut dans le contexte et dans les champs explicites du logger ; seul le pseudonyme HMAC hexadécimal de 64 caractères est conservé.
- [x] [Review][Patch] Expurger les motifs sensibles avant toute troncature pour éviter les fragments de secret au point de coupe.
- [x] [Review][Patch] Étendre `ci:leak` et `ci:mutations` aux gardes principales : whitelist, actorId brut et expurgation Sentry.

## Notes de développement

### Contexte développeur et limites

Le projet n'a **aucune observabilité** : 8 `console.error` dispersés, aucun format, aucune corrélation, aucune dépendance installée. `src/shared/observability/` ne contient qu'un `.gitkeep`.

**L'`actorId` n'a aucun producteur aujourd'hui** — l'authentification est la story 1.6. Il ne peut être exercé qu'en test unitaire, sur une valeur fabriquée. Ne pas partir en quête d'une session inexistante.

Périmètre exclu : aucun tableau de bord, aucune alerte, aucune métrique métier, aucune rétention de logs (non spécifiée par l'architecture). On livre la corrélation, le format, la redaction et leur preuve.

Ne pas créer de table métier ni préempter un nom de domaine — `database-gates.test.mjs` interdit `Copy`, `UserWork`, `Reading`.

### Ce que l'AC 2 peut et ne peut pas prouver

À lire avant de commencer, pour ne pas se retrouver coincé entre deux exigences.

L'AC 2 demande que logs, OpenTelemetry et Sentry partagent les correlation IDs. **Sans compte Sentry ni déploiement Vercel, la corrélation bout en bout n'est pas démontrable** : sans DSN Sentry est un no-op, et aucun collecteur OTel ne tourne en local. Or « Fini quand » exige quatre AC couverts par un test exécutable, et la règle héritée de 1.2 interdit l'inspection de texte comme preuve.

La stratégie imposée : `correlationAttributes()` est une **fonction pure unique**, consommée par les trois sorties. On teste cette fonction, puis chacun des trois adaptateurs contre un double, en vérifiant qu'il reçoit bien les mêmes identifiants. C'est une preuve réelle du partage, pas une inspection.

**La corrélation réelle bout en bout sera vérifiée au premier déploiement, hors CI.** L'écrire dans les notes de complétion plutôt que de laisser croire que la CI la couvre.

### Exigences d'architecture

**AD-12**, verbatim : « Logs JSON, OpenTelemetry et @sentry/nextjs partagent des correlation IDs et excluent les PII. »

**Conventions de cohérence**, ligne Observabilité, verbatim : « requestId, commandId, actorId pseudonymisé et jobId propagés ; journaux sans email, titre personnel, contenu importé ni URL signée. »

**AD-10** : « Audit expurgé », Next.js unique façade des données privées, médias personnels par URL signée. Une URL signée dans un log est un accès en clair à un média privé — la fuite la plus facile à commettre sans y penser.

**NFR-7** : bibliothèque et données de lecture privées par défaut.

Langue : anglais pour le code, français pour l'UI et les noms de tests.

### État actuel et fichiers à préserver

**Les 8 `console.error`**, inventaire vérifié :

| Fichier | Lignes |
|---|---|
| `src/workers/deferred-effects/index.ts` | 634 (verrou consultatif), 731 (routage DLQ), 965 (archivage DLQ), 974 (mise à l'écart), 1029 (rejeu DLQ) |
| `src/app/api/deferred-effects/process/route.ts` | 38 (secret absent), 47 (config invalide), 55 (échec worker) |

Aucun ne journalise de PII aujourd'hui — ils portent `jobId`, `msgId`, `messageId`, noms de queues. **Cette propriété tient au hasard, pas à une garde.** Le `payload` métier n'est jamais journalisé parce que personne ne l'a encore fait. C'est ce que la liste blanche doit rendre structurel.

**`createJobId()`** — worker ligne 324. UUIDv7 fait main, triable par date, son commentaire annonce cette story. À déplacer.

**`describeError()`** — worker ligne 422, bornée par `ERROR_MESSAGE_MAX_LENGTH` ligne 238, `try/catch` de dernier recours ligne 433. À déplacer.

**`src/shared/config/environment.ts`** — `readDeferredEffectsEnvironment` ligne 42, `requireDeferredEffectsEnvironment` ligne 53. Miroir à suivre.

**`src/shared/kernel/pool.ts`** — Pool construit paresseusement, jamais à l'import. Même exigence pour tout module d'observabilité atteint par le build.

**`next.config.ts`** — 14 lignes, aucune section webpack ni turbopack. `typescript.ignoreBuildErrors: true` est volontaire.

**Le canari outbox** assert sur les réponses 200 et 401 du Route Handler. Les modifier casse `ci:database`.

### Exigences de tests et définition de fini

`node:test` avec `node:assert/strict`, fichiers `*.test.mjs`, aucun framework tiers. Noms de tests en français.

**Le pattern d'import TypeScript depuis un `.mjs`** est résolu dans `tests/unit/deferred-effects.test.mjs` : import direct ligne 44, relance unique en sous-processus avec `--experimental-strip-types` sur `ERR_UNKNOWN_FILE_EXTENSION`, sentinelle `TESTS_UNITAIRES_EFFACEMENT_TYPES`, et **retrait de `NODE_TEST_CONTEXT`** ligne 48 — sans quoi `node:test` détecte un lancement récursif, n'exécute aucun test et rend un succès en trompe-l'œil.

**Ce pattern seul ne suffira plus** dès que le worker aura un import relatif : il faut aussi le bloc `registerHooks` du canari (`tests/integration/database-outbox-canary.mjs` lignes 5 et ~60-95) qui résout `@/…`, les extensions et les JSON.

Règle héritée de 1.2 : aucune inspection de texte ne vaut preuve. Chaque porte a sa mutation qui prouve qu'elle mord.

Fini quand : les quatre AC sont traités — trois prouvés par test exécutable, l'AC 2 par la convergence testée et son report explicite au déploiement —, `npm run ci:all` passe, `ci:leak` est câblée **dans le workflow**, sa mutation prouve qu'elle bloque, et `sprint-status.yaml` est à jour.

### Enseignements de la Story 1.3

1. **Une garde qui ne garde rien** — un court-circuit avait désactivé la protection anti-production quand `APP_ENV` était absent. Ici, l'équivalent serait un repli silencieux sur un hachage sans clé.
2. **Une porte non câblée dans le workflow** — `ci.yml` n'appelle jamais `ci:all`.
3. **La liste figée** ligne 8 de `ci-mutation.test.mjs` casse `ci:integration` dès qu'on ajoute une entrée au fixture sans la mettre à jour.
4. **Ce que le harnais ne voit pas** — `publish_effect` était inutilisable par `service_role` parce que la CI se connecte en propriétaire. Pour chaque garantie, se demander si le test l'exerce dans les conditions réelles ou dans des conditions plus favorables.
5. **Docker sous Windows** : injection SQL par stdin, jamais de montage. Aucune action destructive sur l'environnement partagé sans accord.

### Intelligence Git

```
948d5ba docs: clore la story 1.3 en done
abf1a4e feat: honorer l ordre par agregat et livrer la purge d idempotence
2f5e5e8 docs: refleter la resolution des constats de revue sur la story 1.3
ccfc5c6 fix: durcir l outbox suite aux constats de revue
```

Conventional Commits en français, sujet en minuscule sans point final. Corps expliquant le pourquoi. Trailer `Co-Authored-By` quand un agent a contribué. Chaque commit de story met à jour `sprint-status.yaml`.

### Informations techniques actuelles

**`instrumentation.ts`** est **stable** depuis Next 15, `onRequestError` inclus. Racine **ou `src/` si le projet l'utilise** — c'est le cas ici. Jamais dans `app/`.

`register()` est appelé une fois par instance serveur, avant toute requête. `onRequestError` capture les erreurs serveur non gérées des Server Components, Route Handlers et Server Actions. Brancher par runtime via `process.env.NEXT_RUNTIME`.

**`@sentry/nextjs`** : 10.69.0 publiée, l'architecture épingle **10.68.0** — c'est la version à installer. Fichiers attendus : `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, l'instrumentation, `withSentryConfig`, `app/global-error.tsx`.

Filtres : `beforeSend`, `beforeSendTransaction`, `beforeSendSpan`, `beforeSendLog`. `dataCollection` remplace `sendDefaultPii`.

**Vercel** : 256 Ko par ligne, 256 lignes et 1 Mo par requête. Vercel parse le JSON de `console.*`.

**Spans personnalisés non supportés sur Edge.** Next propage nativement le contexte de trace entrant depuis la 13.4.

**Pseudonymisation** : la CNIL recommande le hachage à sel secret ou une fonction à clé — HMAC de préférence, parce que reconstruire l'entrée exige la clé et non la simple connaissance du sel.

**Trois points à vérifier plutôt qu'à supposer :**
1. L'isolation d'`AsyncLocalStorage` entre middleware et Route Handler n'est pas confirmée sur Next 16 — d'où la décision de ne pas traverser cette frontière. Ne pas revenir dessus sans l'avoir testé.
2. Le plafond de 256 Ko par ligne et la dépréciation de `sendDefaultPii` viennent de sources en ligne. Le premier pilote un seuil de troncature : le confirmer avant de figer.
3. Le flush explicite des spans en serverless est recommandé par des blogs tiers, pas par la documentation officielle. Ne pas en faire une décision d'architecture.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md#Epic-1-Story-1.4`]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-10`, `#AD-12`]
- [Source : `_bmad-output/specs/spec-my-bookshelf/SPEC.md#CAP-1`, `#CAP-12`]
- [Source : `_bmad-output/implementation-artifacts/1-3-executer-les-traitements-differes-sans-perte-ni-doublon.md`]
- [Next.js — instrumentation](https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation) · [OpenTelemetry](https://nextjs.org/docs/app/guides/open-telemetry)
- [Sentry — options](https://docs.sentry.io/platforms/javascript/configuration/options/) · [migration v9 → v10](https://docs.sentry.io/platforms/javascript/guides/nextjs/migration/v9-to-v10/)
- [Vercel — limites de logs](https://vercel.com/changelog/updated-logging-limits-for-vercel-functions)
- [CNIL — chiffrer, garantir l'intégrité ou signer](https://www.cnil.fr/fr/securite-chiffrer-garantir-lintegrite-ou-signer)

## Enregistrement de l'agent de développement

### Modèle utilisé

Claude Opus 5 (`claude-opus-5`), en supervision de trois sous-agents : socle, intégration, preuves.

### Références du journal de débogage

**Défaut corrigé — rétrogradation quadratique dans l'expurgation.** L'agent chargé du test de fuite a mesuré **72 secondes** pour formater une seule ligne portant une valeur de 300 000 caractères sans séparateur, et l'a signalé comme hors de son périmètre plutôt que de le contourner en silence. Cause : les motifs d'expurgation utilisaient des quantificateurs non bornés (`+`, `\S+`, `{40,}`) sur des classes de caractères larges ; le moteur d'expressions régulières repart alors depuis chaque position. C'est un déni de service déclenchable par un `errorMessage` volumineux venu d'un fournisseur — sur le chemin de journalisation, donc exactement quand on cherche à comprendre un incident.

Correction : bornes supérieures sur tous les quantificateurs (les valeurs réelles le sont — RFC 5321 plafonne une partie locale à 64 caractères), plus un plafond de 8192 caractères appliqué avant expurgation en défense en profondeur. Mesure avant/après sur la même entrée : **76 139 ms → 74 ms**, motifs toujours détectants.

**Conséquence assumée de la bascule du worker.** Le worker gagne un import à l'exécution (`@/shared/observability`), ce qui rend caduque l'affirmation de son en-tête. `tests/unit/deferred-effects.test.mjs` a reçu le bloc `registerHooks` déjà éprouvé dans le canari, et le commentaire a été amendé plutôt que laissé mensonger.

### Plan d'implémentation

Contrat d'API figé en amont par le superviseur, puis trois lots :

1. **Socle** — `ids`, `context`, `pseudonymize`, `errors`, `logger`, baril, et le couple `read`/`requireObservabilityEnvironment`.
2. **Intégration** — bascule du worker et de la route, `src/instrumentation.ts`, configuration Sentry, erreurs stables sur les 500.
3. **Preuves** — test de fuite, porte `ci:leak`, mutation associée, mise à jour des verrous de liste.

### Notes de complétion

Les AC 1, 3 et 4 sont prouvés par exécution réelle. L'AC 2 est traité comme la story le prescrivait : `correlationAttributes()` est une fonction pure unique consommée par le logger, Sentry et les attributs de span, testée elle-même et par ses consommateurs.

**La corrélation bout en bout entre logs, traces et erreurs n'est pas vérifiée** et ne peut pas l'être ici : sans DSN Sentry est un no-op, et aucun collecteur OpenTelemetry ne tourne. À vérifier au premier déploiement.

`@vercel/otel` n'a pas été installé : Sentry 10 embarque son propre SDK OpenTelemetry, et le monter en double provoquerait un tracer provider concurrent où l'un perd le contexte.

`withSentryConfig` est conservé — Sentry 10 supporte Turbopack, le critère de sortie n'a pas eu à jouer. Les sourcemaps sont désactivées volontairement : sans organisation ni jeton, leur téléversement échouerait à chaque build.

**Non fait, assumé :** `instrumentation-client.ts` et `app/global-error.tsx` (poids client inutile sans DSN) ; la corrélation sur le runtime Edge (jamais alimentée, la route est en runtime Node) ; aucun test d'intégration réel sur `onRequestError`.

**Limites du filet d'expurgation, documentées et non assertées :** un titre de manga ou du contenu importé glissé dans le `message` libre ou dans `errorMessage` n'est reconnu par aucun motif — la garantie est la liste blanche, d'où la règle « `message` = littéral statique ». `actorId` ne traverse plus le contexte qu'après pseudonymisation HMAC ; les autres champs de corrélation restent des identifiants techniques courts.

**Champ abandonné :** `ADVISORY_LOCK_KEY` ne figure plus dans les journaux du verrou consultatif, aucune clé de la liste blanche ne lui convenant sémantiquement. C'est une constante du code source, donc retrouvable.

### Liste des fichiers

Fichiers créés :

- `src/shared/observability/ids.ts`
- `src/shared/observability/context.ts`
- `src/shared/observability/pseudonymize.ts`
- `src/shared/observability/errors.ts`
- `src/shared/observability/logger.ts`
- `src/shared/observability/redaction.ts`
- `src/shared/observability/sentry.ts`
- `src/shared/observability/index.ts`
- `src/instrumentation.ts`
- `sentry.server.config.ts`
- `sentry.edge.config.ts`
- `tests/unit/observability.test.mjs`
- `tests/leak/observability-leak.test.mjs`

Fichiers modifiés :

- `src/workers/deferred-effects/index.ts`
- `src/app/api/deferred-effects/process/route.ts`
- `src/shared/config/environment.ts`
- `tests/unit/deferred-effects.test.mjs`
- `tests/integration/ci-mutation.test.mjs`
- `tests/fixtures/ci-gate-mutations.json`
- `scripts/verify-ci-mutations.mjs`
- `.github/workflows/ci.yml`
- `.env.example`
- `next.config.ts`
- `tsconfig.typecheck.json`
- `package.json`, `package-lock.json`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-05 | Revue BMAD appliquée : expurgation Sentry, corrélation de span, refus d'`actorId` brut, expurgation avant troncature et mutations renforcées. Portes `ci:types`, `ci:lint`, `ci:unit`, `ci:leak`, `ci:mutations` vertes. Statut `done`. |
| 2026-08-05 | Implémentation livrée : socle, intégration, test de fuite et porte ci:leak. Dix portes vertes. Statut `review`. |
| 2026-08-05 | Story créée, puis révisée après validation adverse : sens des dépendances tranché, `@vercel/otel` écarté au profit du seul SDK Sentry, `src/instrumentation.ts` imposé, noms et porte CI fixés. Statut `ready-for-dev`. |
