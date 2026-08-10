---
baseline_commit: db17b57421f2ebe9a22871702d0e781e17420f13
---

# Story 1.2 : Bloquer une livraison qui viole les garanties du MVP

Status: done

## Story

En tant que Zan,
je veux que les régressions soient arrêtées avant livraison,
afin que ma bibliothèque reste fiable et accessible.

## Critères d’acceptation

1. **Étant donné** une pull request, **quand** la CI s’exécute, **alors** elle lance et exige le succès de l’analyse statique, du lint, de la vérification des types stricts, des tests unitaires et des tests d’intégration.
2. **Étant donné** une modification de données ou commande, **quand** la CI s’exécute, **alors** elle bloque sur tout échec des tests RLS inter-utilisateurs, migrations aller/retour compatibles expand–migrate–contract, atomicité et idempotence.
3. **Étant donné** une interaction utilisateur, **quand** la suite navigateur s’exécute, **alors** Playwright couvre les parcours critiques, l’accessibilité WCAG 2.2 AA et la matrice FR-28/FR-29.
4. **Étant donné** 100 exemplaires, **quand** les budgets sont mesurés, **alors** la CI bloque si le retour dépasse 100 ms, la stabilisation 500 ms, ou si un chevauchement ou changement d’ordre relatif apparaît.
5. **Étant donné** local, preview par PR, staging et production, **quand** ils sont configurés, **alors** données et secrets sont isolés et aucune donnée de production ne quitte la production.

## Tâches / Sous-tâches

- [x] Installer une CI de pull request reproductible et bloquante (AC 1)
  - [x] Créer un workflow sous `.github/workflows/` avec permissions minimales `contents: read`, annulation des exécutions obsolètes et aucune permission d’écriture ou de déploiement.
  - [x] Utiliser Node.js `24.18.0`, `npm ci` et le lockfile existant ; conserver TypeScript 7 comme compilateur canonique de `typecheck` et TypeScript 6 uniquement pour la compatibilité Next/ESLint.
  - [x] Exposer dans `package.json` des commandes CI explicites pour statique, lint, types, unitaires, intégration, base/RLS/migrations, navigateur/accessibilité et budgets ; la porte statique est la compilation de production Next (`next build`), distincte des portes ESLint et TypeScript, et chaque commande doit échouer si sa suite attendue est absente ou ignorée.
  - [x] Garder `build` dépendant du `typecheck`; ne pas réintroduire le contournement qui permettait à un build de contourner TypeScript 7.
  - [x] Conserver sur échec les rapports utiles (Playwright, accessibilité, performance) sans publier de secret ni de donnée personnelle.
- [x] Poser les portes de données sans inventer le futur domaine (AC 2)
  - [x] Initialiser la configuration locale Supabase versionnée pour PostgreSQL 17, épingler le CLI stable `2.101.0` dans la commande/action CI, et exécuter les contrôles sur une pile éphémère dédiée à la CI, jamais sur un projet distant ou de production.
  - [x] Créer des canaris SQL/pgTAP strictement dédiés au harnais : deux identités prouvent un refus RLS inter-utilisateurs sur lecture et mutation. Ne pas introduire de table ou entité métier `Copy`, `UserWork` ou `Reading`.
  - [x] Prouver sur une base jetable qu’un historique de migrations se rejoue depuis zéro et qu’un client de l’ancien contrat puis un client du nouveau restent compatibles pendant expand–migrate–contract. L’éventuel SQL inverse de la fixture reste sous `tests/fixtures` : aucune migration descendante n’entre dans l’historique canonique forward-only `supabase/migrations`.
  - [x] Prouver par un canari applicatif qu’une faute injectée au milieu d’une transaction ne laisse aucun effet et que deux exécutions du même `commandId` rendent le même reçu sans doubler l’effet.
  - [x] Fournir une convention d’extension : toute future migration, politique RLS ou commande doit ajouter ses tests dans la porte existante ; aucun test vide ou pure inspection de texte ne vaut preuve.
- [x] Étendre Playwright en matrice d’interaction et accessibilité (AC 3)
  - [x] Préserver les tests du scaffold et configurer au minimum les combinaisons ordinateur+souris, ordinateur+clavier, tablette+tactile et tablette+clavier, couvrant large/étroit et paysage/portrait selon la surface testée.
  - [x] Ajouter `@axe-core/playwright` verrouillé dans le lockfile et faire échouer la suite sur les violations automatisables WCAG 2.2 A/AA ; ne pas prétendre qu’axe couvre les contrôles manuels.
  - [x] Automatiser les preuves pertinentes disponibles aujourd’hui : nom/rôle/valeur, clavier, focus visible, zoom 200 %, reflow 400 %/320 CSS px, espacement WCAG 1.4.12, réduction des animations et absence de dépendance à la couleur ou au survol.
  - [x] Versionner une checklist de preuve manuelle pour contraste, dimensions réelles des cibles, restitution du focus, tactile et autres critères non automatisables ; chaque future surface interactive doit compléter automatisation et preuve manuelle.
  - [x] En CI, limiter Playwright à un worker pour la reproductibilité et installer Chromium avec ses dépendances ; ne pas ajouter de cible téléphone.
- [x] Créer un harnais déterministe pour les budgets UX et invariants spatiaux (AC 4)
  - [x] Créer une page-fixture Playwright hors `src/app`, composée de 100 éléments génériques à identifiants stables et d’une commande test-only de réagencement déterministe. Elle prouve le fonctionnement de la porte, pas la performance d’une bibliothèque métier inexistante ; chaque future surface de rangement devra fournir son propre scénario de 100 `Copy`.
  - [x] Depuis un clic Playwright, mesurer avec `performance.now()` le délai jusqu’à l’attribut/texte de feedback synchronisé (≤ 100 ms), puis jusqu’à un marqueur de stabilité posé après le dernier changement de géométrie sur deux `requestAnimationFrame` consécutifs (≤ 500 ms) ; échouer au-dessus des seuils, sans marge silencieuse.
  - [x] Vérifier par géométrie rendue l’absence de chevauchement/débordement et par identifiants stables la préservation de l’ordre relatif des éléments non déplacés.
  - [x] Isoler les fixtures et horloges pour éviter les faux verts et la floconnance ; conserver traces et mesures sur échec.
- [x] Verrouiller le contrat d’isolation des environnements (AC 5)
  - [x] Définir et valider au démarrage les variables attendues pour local, preview PR, staging et production, sans valeur secrète ni fallback de production dans le dépôt.
  - [x] Ajouter un garde CI fondé sur quatre fingerprints non secrets et versionnables de cibles (`local`, `preview`, `staging`, `production`) : ils doivent être tous renseignés hors secret et distincts, tandis que les URLs, clés et credentials restent secrets. Refuser tout partage de fingerprint ou référence de production hors production.
  - [x] Autoriser en pull request uniquement des services locaux éphémères ou des secrets explicitement propres à la preview ; le job PR ne référence jamais l’environnement GitHub `production` et ne reçoit aucun de ses secrets. Ne jamais copier, restaurer, journaliser ou tester des données de production hors production.
  - [x] Documenter la promotion : RPO, RTO, durée de rétention et preuve de restauration restent obligatoires avant production, mais leur valeur n’est pas fixée et ne bloque pas le développement du MVP.
- [x] Valider les portes elles-mêmes avant de déclarer la story terminée (AC 1–5)
  - [x] Exécuter localement toutes les commandes accessibles sous Node `24.18.0`, puis consigner les résultats.
  - [x] Utiliser des fixtures volontairement invalides ou des tests de mutation du pipeline pour prouver que chaque porte échoue réellement, puis retirer/restaurer ces fixtures avant validation finale.
  - [x] Vérifier que la CI n’emploie ni `continue-on-error`, ni `|| true`, ni suite vide, ni secret de production, et qu’aucun artefact ne contient de PII.

### Constats de revue

- [x] [Review][Patch] Rendre les preuves de mutations bloquantes dans la CI et compléter l’agrégat `ci:all` [`.github/workflows/ci.yml`:23]
- [x] [Review][Patch] Durcir le harnais de mutations contre les collisions, transformations inopérantes et faux test statique [`scripts/verify-ci-mutations.mjs`:12]
- [x] [Review][Patch] Prouver réellement l’atomicité et l’idempotence sur un état persistant observable et plusieurs connexions [`tests/integration/database-command-canary.mjs`:7]
- [x] [Review][Patch] Rejouer un historique canonique réel et exercer les phases expand–migrate–contract [`supabase/tests/database/migration-compatibility.test.sql`:3]
- [x] [Review][Patch] Valider obligatoirement la configuration d’environnement au démarrage et supprimer les valeurs implicites de la porte CI [`src/shared/config/environment.ts`:5]
- [x] [Review][Patch] Rendre les preuves tablette/tactile, reduced-motion, zoom 200 % et reflow effectivement exécutables [`tests/e2e/accessibility.spec.ts`:10]
- [x] [Review][Patch] Mesurer la stabilisation et les invariants spatiaux sans dépendre du signal auto-déclaré de la fixture [`tests/e2e/ux-budgets.spec.ts`:11]
- [x] [Review][Patch] Isoler chaque exécution Supabase pour éviter les collisions avec une pile concurrente [`scripts/run-database-gates.mjs`:10]

## Notes de développement

### Contexte développeur et limites

- Cette story construit les portes transversales de livraison de l’Epic 1. Elle ne doit pas implémenter les traitements différés (1.3), l’observabilité Sentry/OpenTelemetry (1.4), la sauvegarde/restauration (1.5) ou l’authentification métier (1.6).
- La base métier n’existe pas encore. Les preuves RLS, transaction et idempotence doivent donc utiliser un harnais canari clairement isolé, supprimé ou encapsulé comme fixture de test, sans prétendre couvrir des tables futures.
- Ne créer aucune fausse donnée produit et aucun modèle `Copy`, `UserWork` ou `Reading`. Une intention « À lire » ne crée jamais de `Reading`; cette distinction reste hors implémentation ici mais ne doit pas être contredite par les fixtures.
- Les non-objectifs restent exclus : téléphone, import CSV, social, prêts, catalogage professionnel, promotions et capacités payantes.
- Les objectifs RPO/RTO et la rétention sont une condition de production, pas un blocage de développement ni un prétexte pour anticiper la Story 1.5.

### Exigences d’architecture

- `AD-3` : PostgreSQL 17/Supabase, mutations serveur uniquement, SQL paramétré via `pg`, une transaction portée par un seul client emprunté au Pool et RLS en défense en profondeur. Le navigateur ne doit jamais écrire directement les tables.
- `AD-5`/`AD-6` : une commande porte `commandId`, acteur, versions attendues et payload ; existence, ownership et disponibilité sont vérifiés avant une mutation tout-ou-rien. Le reçu idempotent est écrit dans la transaction. Un conflit est explicite et restaure le dernier état confirmé.
- `AD-10` : Next.js reste la seule façade des données privées ; session et ownership sont contrôlés avant RLS. Caches privés par utilisateur+version, URLs signées, service role serveur uniquement et audit expurgé.
- `AD-11` : DOM sémantique, jamais Canvas ; souris, tactile et clavier adaptent une même commande. Cibles 44 px pointeur/48 px tactile, focus 3:1 à deux tons sur images, live regions, dialogues et erreurs accessibles, feedback ≤ 100 ms et stabilisation ≤ 500 ms sur 100 exemplaires.
- `AD-12` : migrations sous `supabase/migrations` comme historique SQL unique, expand–migrate–contract, environnements isolés et CI bloquante sur toutes les portes. Ne pas introduire une seconde représentation canonique du schéma.

### État actuel et fichiers à préserver

- `package.json` possède déjà `lint`, `typecheck`, `build`, `test` et `test:e2e`. Étendre ces scripts sans casser leurs usages ; ne pas dupliquer le runner Playwright.
- `playwright.config.ts` lance aujourd’hui deux projets Chromium et le serveur Next sur `127.0.0.1:3100`. Le faire évoluer vers la matrice requise ; conserver `reuseExistingServer: false` pour l’isolation et les tests de la Story 1.1.
- `tests/integration/scaffold.test.mjs` et `tests/e2e/scaffold.spec.ts` sont des régressions acquises. Ils doivent continuer à passer.
- `next.config.ts` ignore le type-check interne de Next uniquement parce que le projet valide TypeScript 7 avant chaque build. Le workflow CI doit conserver cette chaîne explicite.
- `supabase/migrations/` est vide. Les migrations produit futures y seront ajoutées ; garder les schémas canaris hors du domaine produit ou explicitement limités aux tests.
- Fichiers probables : `.github/workflows/ci.yml`, `package.json`, `package-lock.json`, `playwright.config.ts`, `supabase/config.toml`, `supabase/tests/database/*.test.sql`, `tests/{unit,integration,e2e,fixtures}/**`, `scripts/verify-*.mjs` et un exemple de configuration sans secrets. Les noms exacts peuvent suivre les conventions du code existant, mais ne pas disperser de logique métier dans `src/app`.

### Exigences de tests et définition de fini

- La CI doit être verte depuis une installation propre et rouge lorsque chacune des portes est volontairement violée. Une simple présence de fichier, recherche de motif ou suite vide ne satisfait pas les AC.
- Les tests SQL utilisent une transaction `begin`/`rollback` et pgTAP pour l’isolation lorsque pertinent ; les tests applicatifs emploient des identifiants uniques. Les cas négatifs lecture/écriture inter-utilisateurs sont obligatoires.
- Les tests d’atomicité injectent une faute après un premier effet ; l’état final doit être strictement inchangé. Les tests d’idempotence rejouent le même `commandId` et vérifient reçu identique et effet unique.
- Pour toute future migration destructive, la CI exige une phase d’expansion compatible, une migration des données et seulement ensuite un contrat. Le test doit repartir d’une base jetable et ne jamais cibler une base partagée.
- Axe automatise une partie de WCAG seulement. La preuve finale combine Playwright/axe et checklist manuelle versionnée ; elle ne déclare jamais automatiquement conforme un critère non mesuré.
- Les seuils de performance sont des limites maximales, pas des moyennes. Les mesures doivent être documentées, reproductibles et accompagnées des traces sur échec.

### Enseignements de la Story 1.1

- Le socle et son lockfile sont déjà validés sous Node `24.18.0` : Next.js `16.2.12`, React `19.2.8`, Playwright `1.62.1`, TypeScript 7 strict sous alias et TypeScript 6 pour Next/ESLint.
- La revue 1.1 a montré qu’une assertion statique CSS/TSX ne prouve ni accessibilité ni responsive. Les nouvelles garanties doivent observer le rendu et les comportements, avec preuves manuelles pour ce qui n’est pas automatisable.
- `npm run build` exécute désormais `typecheck` avant Next ; cette protection est acquise. L’arbre npm est valide et les versions WASM sont verrouillées par overrides.
- Les tests navigateur existants couvrent l’accueil, le clavier, le focus, le zoom/reflow et l’absence de faux livre. Les étendre plutôt que les remplacer.

### Intelligence Git

- Le commit de référence `db17b57421f2ebe9a22871702d0e781e17420f13` livre tout le scaffold et marque la Story 1.1 `done`.
- Les changements récents suivent une convention de commit française concise et conservent les artefacts BMad dans `_bmad-output/implementation-artifacts`.
- Aucun workflow `.github/`, aucune configuration Supabase locale et aucune suite RLS/migration n’existent au baseline : les créer une fois comme infrastructure partagée, sans runner concurrent.

### Informations techniques actuelles

- Playwright recommande en CI `npm ci`, l’installation des navigateurs avec leurs dépendances, puis `playwright test`; un seul worker est recommandé en CI pour la stabilité. Conserver la version `1.62.1` déjà verrouillée.
- La documentation Supabase recommande `supabase test db`/pgTAP pour la structure, RLS et intégrité, avec pile locale démarrée en CI. Utiliser le CLI stable `2.101.0`, vérifié au 2026-08-03, plutôt que `latest` ou une préversion.
- Les actions GitHub de référence actuelles utilisent `actions/checkout@v6` et `actions/setup-node@v6`; fixer Node depuis `.nvmrc` ou la version exacte et conserver `contents: read`.
- `@axe-core/playwright` `4.12.1` est la version stable vérifiée au 2026-08-03. La verrouiller dans `devDependencies` et le lockfile si elle reste compatible avec Playwright `1.62.1` après installation.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md` — Epic 1, Story 1.2, matrice FR-28/FR-29, dépendances et risques]
- [Source : `_bmad-output/specs/spec-my-bookshelf/SPEC.md` — CAP-11, CAP-12, contraintes et non-objectifs]
- [Source : `_bmad-output/specs/spec-my-bookshelf/requirements-traceability.md` — garde-fous qualité]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md` — AD-3, AD-5, AD-6, AD-10 à AD-12, conventions et stack]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/DESIGN.md` — Colors, Layout & Spacing, Components]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md` — Accessibility Floor, Responsive & Platform, invariants]
- [Source : `_bmad-output/planning-artifacts/implementation-readiness-report-2026-08-03.md` — contrôles AD-12 validés et verdict READY]
- [Source : `_bmad-output/implementation-artifacts/1-1-configurer-le-projet-initial-depuis-le-starter-officiel.md` — enseignements, revue et liste des fichiers]
- [Documentation officielle Playwright — CI](https://playwright.dev/docs/ci)
- [Documentation officielle Supabase — tests locaux et RLS](https://supabase.com/docs/guides/local-development/testing/overview)
- [Documentation officielle Supabase — workflow local et migrations](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Documentation officielle GitHub — Node.js en CI](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
- [Package officiel `@axe-core/playwright`](https://www.npmjs.com/package/@axe-core/playwright)

## Enregistrement de l’agent de développement

### Modèle utilisé

GPT-5.6

### Références du journal de débogage

- 2026-08-03 : RED confirmé pour le contrat CI (workflow absent), le harnais base (fichiers absents), l'accessibilité navigateur (dépendance/serveur absent), le budget UX (fixture absente) et l'isolation des environnements (configuration absente).
- 2026-08-03 : sous Node 24.18.0, unitaires 3/3, intégration 8/8, lint, TypeScript 7, garde d'environnement, Playwright Chromium 24/24 et build Next de production sont verts.
- 2026-08-03 : HALT sur la porte base après trois tentatives. Docker Desktop est sain, mais le pull de l'image PostgreSQL Supabase ne progresse pas et ne produit aucune erreur SQL ; le dernier lancement a été interrompu après plusieurs attentes de 30 s. La story reste `in-progress` et les tâches 2 à 5 ne sont pas cochées tant que la porte base et la régression complète ne passent pas.
- 2026-08-03 : reprise du HALT : cause du pull identifiée dans le helper d'identifiants Docker Desktop (`error getting credentials`). Une configuration Docker publique temporaire a permis de télécharger `supabase/postgres:17.6.1.106` et de terminer un premier `db reset`. Le montage du chemin du dépôt par `pg_prove` a ensuite laissé un conteneur de test sans volume bloqué en état `Created`. Deux autres conteneurs de test ont été supprimés sans toucher aux volumes ; `youthful_beaver` reste impossible à démarrer ou supprimer. Le redémarrage de Docker Desktop, qui interromprait temporairement onze conteneurs d'autres projets, a été refusé faute d'autorisation explicite. Nouveau HALT : approbation utilisateur requise pour ce redémarrage avant de relancer pgTAP et les régressions.
- 2026-08-03 : HALT levé après redémarrage autorisé de Docker Desktop. Le conteneur pg_prove orphelin a été supprimé sans volume. La porte base injecte les vrais scripts pgTAP par stdin pour éviter le montage Docker incompatible avec le chemin du dépôt ; elle échoue explicitement sur toute sortie `not ok`.
- 2026-08-03 : validation finale post-restauration sous Node 24.18.0 : `ci:all`, `ci:environment` et `ci:budgets` verts ; 3 tests unitaires, 8 intégration, RLS 4/4, migrations 2/2, canari transaction/idempotence, Playwright 24/24, budgets 4/4 et build Next réussis. Les neuf mutations sont toutes rejetées avec exit 1 et restaurées.
- 2026-08-04 : huit constats de revue corrigés. Régression `ci:all` verte sous Node 24.18.0 : Supabase réel isolé par exécution, RLS 4/4, historique expand–migrate–contract 4/4, canari persistant sur deux connexions distinctes, Playwright 32/32, budgets 4/4, build et neuf mutations bloquantes.

### Plan d'implémentation

- RED–GREEN–REFACTOR par porte, dans l'ordre de la story : contrat CI, canaris PostgreSQL, matrice Playwright/axe, fixture de budgets UX, puis fingerprints et promotion des environnements.
- Les canaris restent isolés du domaine produit ; la pile CI ne cible qu'un PostgreSQL local jetable et le runner arrête Supabase sans sauvegarde.

### Notes de complétion

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story préparée en français à partir du contrat canonique, du rapport READY, de la Story 1.1 et de l’état réel du dépôt.
- CI de pull request, scripts bloquants et conservation des rapports sur échec implémentés et validés sous Node 24.18.0.
- Harnais Supabase/pgTAP, canari applicatif transactionnel, matrice Chromium/axe, budgets UX et isolation des environnements implémentés ; validation base réelle en attente du pull Docker PostgreSQL.
- Validation Supabase réelle et régression complète terminées ; la story satisfait les cinq critères et est prête pour revue.

### Liste des fichiers

- .env.example
- .github/workflows/ci.yml
- .gitignore
- config/environments.json
- docs/operations/environment-promotion.md
- docs/quality/manual-accessibility-checklist.md
- eslint.config.mjs
- package-lock.json
- package.json
- playwright.config.ts
- scripts/run-database-gates.mjs
- scripts/verify-ci-mutations.mjs
- scripts/verify-environment-isolation.mjs
- src/shared/config/environment.ts
- supabase/config.toml
- supabase/migrations/20260804000100_ci_canary_expand.sql
- supabase/migrations/20260804000200_ci_canary_migrate.sql
- supabase/migrations/20260804000300_ci_canary_contract.sql
- supabase/tests/database/migration-compatibility.test.sql
- supabase/tests/database/rls.test.sql
- tests/e2e/accessibility.spec.ts
- tests/e2e/ux-budgets.spec.ts
- tests/fixtures/ci-gate-mutations.json
- tests/fixtures/migration-contract-down.sql
- tests/fixtures/ux-budget.html
- tests/integration/ci-contract.test.mjs
- tests/integration/ci-mutation.test.mjs
- tests/integration/database-command-canary.mjs
- tests/integration/database-gates.test.mjs
- tests/unit/environment-isolation.test.mjs

## Journal des modifications

- 2026-08-03 : ajout des portes CI, des harnais de données, accessibilité et performance, du contrat d'isolation des environnements et des tests de mutation ; validation complète terminée sous Node 24.18.0.
- 2026-08-04 : correction des huit constats de revue et validation finale de toutes les portes sous Node 24.18.0 ; story passée à `done`.
