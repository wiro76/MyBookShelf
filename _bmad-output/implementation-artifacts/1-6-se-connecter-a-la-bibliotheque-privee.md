---
baseline_commit: d04e63b39140ab77701fc4596c5b7e9fcb963cdf
---

# Story 1.6 : Se connecter à la bibliothèque privée

Status: ready-for-dev

## Story

En tant que Zan,
je veux m'authentifier,
afin que moi seul puisse consulter ou modifier ma bibliothèque.

**Traçabilité :** CAP-1, CAP-11 ; FR-1, FR-28, FR-29 ; NFR-5 à NFR-9 ; AD-3, AD-10, AD-11.

**C'est le premier écran réel du projet.** Jusqu'ici l'application est une carte d'accueil statique. Cette story livre la première interface manipulable, les premières tables métier et la première politique RLS applicative. Le rendu visuel devra être soumis à Romane : aucun test ne dira si l'écran est accueillant.

## Critères d'acceptation

1. **Étant donné** une session absente, **quand** une route privée est demandée, **alors** aucune donnée privée n'est rendue et le formulaire de connexion conserve seulement une destination relative autorisée.
2. **Étant donné** des identifiants valides, **quand** Zan se connecte, **alors** Supabase Auth établit la session et Next.js reste l'unique façade des données privées.
3. **Étant donné** des identifiants invalides, **quand** la connexion échoue, **alors** la saisie est conservée, l'erreur est reliée au champ, annoncée et focalisée selon le nombre d'erreurs.
4. **Étant donné** un autre utilisateur ou une commande sans ownership, **quand** une lecture ou mutation est tentée, **alors** l'autorisation serveur et RLS refusent l'accès sans divulguer la donnée.

## Décisions tranchées

Non négociables. Tout nom figurant ici est imposé — il part en production.

### Sécurité et données

| Sujet | Décision |
|---|---|
| Méthode d'authentification | **E-mail + mot de passe.** Choix de l'utilisateur. Ni lien magique (exigerait Mailpit), ni OAuth (ferait sortir une donnée personnelle vers un tiers, en tension avec AD-10). |
| Rôle de `supabase-js` | **Identifier, et rien d'autre.** AD-3 impose node-postgres et du SQL paramétré explicite pour toute donnée. Il ne lit ni n'écrit aucune table métier. |
| **Origine du `sub`** ⚠️ | L'identifiant passé à la transaction authentifiée provient **exclusivement de `supabase.auth.getUser()` exécuté côté serveur à chaque requête**. **Jamais `getSession()`**, qui décode le cookie sans vérifier sa signature, et jamais un champ de formulaire. Sans cela, les deux couches de la double barrière reposeraient sur une valeur contrôlée par le client, et l'AC 4 serait vert sur une protection contournable. |
| **Application effective de RLS** | En CI comme en production, la chaîne de connexion utilise le rôle **propriétaire**, qui contourne RLS. Créer `src/shared/kernel/authenticated-transaction.ts`, signature imposée : `authenticatedTransaction<T>(userId: string, work: (client: PoolClient) => Promise<T>): Promise<T>`. Elle ouvre la transaction, y pose `set local role authenticated` **et** `select set_config('request.jwt.claim.sub', $1, true)`, exécute, valide ou annule. Toute donnée appartenant à un utilisateur passe par là, jamais par le Pool nu. |
| Double barrière | AD-10 : session **et** ownership vérifiés applicativement, **puis** RLS répète l'isolation. RLS est la seconde ligne, jamais la seule. |
| Découplage du Pool | `getDatabasePool()` dépend de `requireDeferredEffectsEnvironment`, qui exige `DEFERRED_EFFECTS_WORKER_SECRET` — sans rapport avec la connexion d'un utilisateur. Extraire la lecture de `DATABASE_URL` sans casser l'appelant existant. |
| Destination de retour | Liste blanche **littérale** : `["/", "/bibliotheque"]`. Rejeter toute URL absolue, tout `//`, tout `\`, tout schéma, toute valeur hors liste. En cas de rejet, retomber silencieusement sur `/` — ne jamais réafficher la valeur refusée. |
| Message d'identifiants refusés | **Un seul message, identique** que le compte existe ou non : distinguer « compte inconnu » de « mot de passe incorrect » est un oracle d'énumération. |
| Journalisation | **Jamais l'e-mail saisi.** La liste blanche du logger le détruira — ne pas chercher à contourner. `pseudonymizeActor` pour l'`actorId`. |
| Caches | Toute route privée est explicitement non mise en cache. |

### Noms imposés

| Élément | Nom |
|---|---|
| Migration | `supabase/migrations/20260806000100_identity_expand.sql` |
| Schéma et tables | `identity.profiles(user_id uuid primary key references auth.users(id) on delete cascade, display_name text not null, created_at timestamptz not null default now())` et `identity.private_notes(id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, body text not null, created_at timestamptz not null default now())` — la seconde existe pour prouver l'AC 4 sans préempter le domaine |
| Transaction | `src/shared/kernel/authenticated-transaction.ts` |
| Session serveur | `src/modules/identity/application/session.ts` |
| Route de connexion | `/connexion` → `src/app/connexion/page.tsx` |
| Route privée témoin | `/bibliotheque` → `src/app/bibliotheque/page.tsx` |
| Validation de destination | `src/modules/identity/application/redirect-allowlist.ts` |
| Test RLS | `supabase/tests/database/identity-rls.test.sql` |
| Canari d'authentification | `tests/integration/database-identity-auth-canary.mjs` — **sans `.test.`** : `ci:integration` globbe `*.test.mjs` et n'a pas de base, un canari ainsi nommé casserait la porte |
| Variables d'environnement | `SUPABASE_SERVICE_ROLE_KEY`, couple `readIdentityEnvironment` / `requireIdentityEnvironment` |
| Compte de test | `zan@exemple.test` / `mot-de-passe-de-test-1234`, définis dans `tests/fixtures/identity-test-user.json` |

### Harnais et preuves

| Sujet | Décision |
|---|---|
| Services | **Retirer `gotrue` et `kong` de la liste `--exclude`** de `run-database-gates.mjs` ligne 61 — ils y sont aujourd'hui. Tout le reste demeure exclu, `mailpit` compris, la confirmation d'e-mail étant désactivée. |
| Clés de la pile éphémère | Le harnais ne les capture pas aujourd'hui : `stdio: "inherit"` jette la sortie. Appeler `supabase status -o json` avec `stdio: "pipe"`, en extraire l'URL de l'API et les clés, et les injecter dans l'`env` du canari. |
| Création du compte | Voie **API admin** : `POST /auth/v1/admin/users` avec la clé de service, `email_confirm: true`. Ne pas insérer à la main dans `auth.users` — sans ligne `auth.identities` conforme, GoTrue refuse le login. |
| **Répartition des preuves** ⚠️ | Le job `browser` de la CI n'a **ni Docker ni Supabase**, et `playwright.config.ts` porte une clé anon factice sur un port où rien n'écoute. Donc : **l'AC 2 est prouvé par le canari Node**, dans la porte `database`. Les **AC 1 et 3 sont prouvés en e2e** avec une session simulée par cookie injecté. Ne pas tenter de démarrer Supabase depuis Playwright. |
| **Mutation CI** ⚠️ | La mutation vise la porte **`database` existante**. L'ajouter dans `scripts/verify-ci-mutations.mjs`, qui l'exécute réellement — **pas** dans `tests/integration/ci-mutation.test.mjs`, qui ne fait que comparer des chaînes. Rendre permissive la politique de la nouvelle migration et vérifier que `ci:database` échoue. **La liste figée ligne 8 et `ci-gate-mutations.json` restent inchangées** : aucune porte n'est créée. |
| Tests RLS | Le gabarit `rls.test.sql` **n'a besoin ni de GoTrue ni de Kong** : `set local role authenticated` + `set_config(…, true)` suffisent. L'utiliser tel quel. |
| Coût | `ci:mutations` invoque `ci:database` **deux fois**, et le job `database` une troisième. Deux conteneurs de plus voient donc leur surcoût triplé, sous un `timeout-minutes: 20`. Mesurer avant et après, relever le plafond si nécessaire. |

### Interface

| Sujet | Décision |
|---|---|
| Composants | `DESIGN.md` ne définit **aucun** composant de champ, d'étiquette, d'erreur ni de bouton. Les dériver des tokens : contrôles en 8px, Inter (jamais Lora), accent `#9A3412` sur `#FFFFFF` en clair, `#FDBA74` sur `#431407` en sombre, cibles ≥ 44px au pointeur et ≥ 48px au tactile. |
| Tokens manquants | `globals.css` ne déclare que 10 variables en clair et 7 en sombre. **À ajouter** : `error`, `error-soft`, `focus`, `surface-subtle`, `border-strong`, `ink-disabled` et leurs équivalents sombres. |
| ⚠️ Collision de nom | `globals.css` définit déjà `--focus-dark: #171412`, qui correspond au token `focus-dark-contrast` de `DESIGN.md`, alors que `DESIGN.md` appelle `focus-dark` la valeur `#FDBA74`. **Renommer l'existant en `--focus-contrast`** avant d'ajouter le focus sombre, sinon l'indicateur deux tons du bouton est écrasé. |
| Erreur d'identifiants et règle de focus | Le refus d'identifiants est **une erreur unique** : `aria-invalid` sur les deux champs, message relié aux deux par `aria-describedby`, focus sur le champ e-mail. La règle « plusieurs erreurs → résumé focalisé » ne s'applique qu'aux **erreurs de validation locale** (format d'e-mail, mot de passe vide). |
| Chrome | Pas de `navigation-principale` : elle ne sert qu'à basculer entre les trois bibliothèques, inutilisable sans session. Surface autonome centrée, structure `.welcome-shell` / `.welcome-card` réutilisée. Son rayon actuel est de 16px : le conserver, c'est un panneau. |
| `@supabase/ssr` | **Utilisé**, pour la gestion des cookies httpOnly en App Router. Vérifier la version compatible avec `supabase-js@2.110.8` et **l'épingler exactement**, comme toutes les dépendances du projet. |
| ⚠️ Projet Playwright défaillant | `tablet-keyboard-landscape` est aujourd'hui **identique à `desktop-keyboard`** : `Desktop Chrome`, 1024×768, sans `hasTouch` ni `isMobile`. La branche « tablette clavier » de la matrice d'audit n'est donc pas couverte, alors qu'elle est exigée pour cette story. **Le corriger** en `devices["iPad (gen 7)"]` en paysage. |

## Tâches / Sous-tâches

- [ ] **T1 — Socle d'identité en base (AC: 2, 4)**
  - [ ] Migration : schéma `identity`, table de profil rattachée à `auth.users` par `user_id uuid`, RLS **activée avec politique** `using`/`with check` symétriques sur `(select auth.uid())` — forme sous-requête, comme le gabarit existant
  - [ ] `grant` explicite au rôle `authenticated` : sans lui, un refus serait un défaut de privilège et non une preuve de RLS
  - [ ] Créer aussi une table privée de démonstration d'ownership, suffisante pour prouver l'AC 4 sans préempter le domaine. **Ne pas créer `Copy`, `UserWork` ni `Reading`** — `database-gates.test.mjs` les interdit
  - [ ] Migration forward-only, format d'horodatage à 14 chiffres

- [ ] **T2 — Transaction authentifiée (AC: 2, 4)**
  - [ ] `src/shared/kernel/authenticated-transaction.ts` selon la décision tranchée. Un seul client emprunté au Pool porte toute l'unité de travail (AD-3)
  - [ ] `set local` et `set_config(..., true)` : la portée doit être la transaction, jamais la session — un client rendu au Pool en conservant un rôle ou un claim contaminerait la requête suivante. C'est le piège central de cette tâche
  - [ ] Découpler la lecture de `DATABASE_URL` de `requireDeferredEffectsEnvironment`, sans casser l'appelant existant
  - [ ] Tests unitaires : le rôle et le claim sont bien posés, ils sont bien annulés au retour au Pool, une erreur déclenche `ROLLBACK`

- [ ] **T3 — Authentification serveur (AC: 1, 2, 3)**
  - [ ] Installer `@supabase/supabase-js@2.110.8`, version épinglée par l'architecture. Évaluer `@supabase/ssr` pour la gestion des cookies de session en App Router et **justifier le choix** dans les notes de complétion
  - [ ] Server Action ou Route Handler de connexion : valide l'entrée, appelle Supabase Auth, établit la session par cookie **httpOnly**. Le navigateur n'appelle jamais Supabase directement pour les données (AD-10)
  - [ ] Garde de route privée côté serveur : sans session, aucun rendu de donnée privée. Créer une route privée minimale pour le prouver
  - [ ] Validation de la destination de retour selon la décision tranchée, avec tests unitaires sur les cas hostiles : `https://evil.test`, `//evil.test`, `\\evil.test`, `javascript:`, chemin hors liste, chaîne vide
  - [ ] Étendre `src/shared/config/environment.ts` pour ce qui manque, en suivant le couple `read`/`require` existant. Aucun secret dans le dépôt

- [ ] **T4 — Écran de connexion (AC: 1, 3)**
  - [ ] Créer la page et les composants de formulaire dérivés des tokens
  - [ ] Structure de champ : étiquette **persistante** (jamais un simple placeholder), champ, aide, message d'erreur adjacent, relié par `aria-describedby` et `aria-invalid`
  - [ ] **Règle de focus, prescrite par `EXPERIENCE.md`** : une seule erreur → focus sur le champ invalide ; **deux ou plus** → focus sur un résumé d'erreurs portant un lien vers chaque champ. Dans tous les cas, **conserver toutes les saisies**
  - [ ] Erreur réseau globale : alerte distincte, qui **n'efface pas** les erreurs de validation
  - [ ] Annonces : région live polie pour les changements d'état, annonce immédiate sans répétition pour les erreurs
  - [ ] Jamais la couleur seule : erreur = couleur **et** icône **et** texte
  - [ ] Libellés à rédiger — aucun n'est prescrit. Registre imposé par `EXPERIENCE.md` : **tutoiement**, chaleureux, phrases courtes, conséquence concrète. Le message d'échec doit proposer une correction sans jamais révéler si le compte existe
  - [ ] Thème clair **et** sombre, les deux jeux de tokens existent

- [ ] **T5 — Harnais et preuves base (AC: 2, 4)**
  - [ ] Ajouter la section `[auth]` à `supabase/config.toml` : confirmation d'e-mail désactivée pour se passer de Mailpit. **Vérifier les noms de clés réels pour la CLI 2.101.0** — la surface `[auth]` a bougé entre versions, ne pas les deviner
  - [ ] **Retirer** `gotrue` et `kong` de la liste `--exclude` de `run-database-gates.mjs` ligne 61 — ils y figurent aujourd'hui. `apiPort` est déjà réservé et substitué mais inutilisé : il devient fonctionnel
  - [ ] Traiter le piège des ports fixes selon la décision tranchée
  - [ ] `supabase/tests/database/identity-rls.test.sql`, calqué sur `rls.test.sql` : le propriétaire lit et écrit, un autre utilisateur ne lit rien et voit son insertion refusée en `42501`, `anon` n'a aucun accès. Compter le `plan(N)` exactement, et **ajouter le fichier au tableau `sql` du harnais** — la liste est codée en dur, un fichier oublié n'est jamais exécuté
  - [ ] Canari d'authentification : semer un utilisateur, se connecter réellement via GoTrue, vérifier que la session est établie, puis qu'une lecture sous l'identité d'un autre utilisateur ne renvoie rien

- [ ] **T6 — Preuves d'interface (AC: 1, 3)**
  - [ ] Tests e2e sur les **quatre** projets Playwright — la matrice d'audit l'impose pour cette story
  - [ ] Corriger `tablet-keyboard-landscape` selon la décision tranchée : sans cela, la branche « tablette clavier » n'est pas réellement exercée et la preuve serait fausse
  - [ ] Prouver : redirection sans session, conservation de la saisie après échec, liaison erreur↔champ, **règle de focus selon le nombre d'erreurs**, focus visible à 3:1, zoom 200 %, reflow 400 % à 320 px, espacement de texte WCAG 1.4.12
  - [ ] Session simulée par **cookie injecté** — le job `browser` n'a ni Docker ni Supabase. Ne pas tenter d'y démarrer une pile
  - [ ] Ajouter la mutation dans `scripts/verify-ci-mutations.mjs`, ciblant la porte `database` existante. **Ne pas toucher** à `ci-mutation.test.mjs` ni à `ci-gate-mutations.json` : aucune porte n'est créée

## Notes de développement

### Contexte développeur et limites

**Rien n'existe** en matière d'authentification : les six dossiers `src/modules/*` sont vides, aucune route `/login`, aucun `middleware.ts`, aucune Server Action, aucune migration touchant `auth.users`, aucune politique RLS applicative. Le seul RLS du dépôt est un canari créé **à l'intérieur** d'un test pgTAP.

Périmètre exclu : pas d'inscription publique (la bibliothèque est mono-propriétaire au MVP), pas de réinitialisation de mot de passe, pas de reprise de contexte (story 1.7), pas d'indicateur de sauvegarde (story 1.8). La procédure de création du compte unique de Zan n'est décrite nulle part — la traiter comme une opération d'administration, pas comme une surface produit.

### Exigences d'architecture

**AD-10**, verbatim :
> « Supabase Auth identifie ; Next.js reste l'unique façade des données privées. Chaque commande vérifie session et ownership, puis RLS répète l'isolation. La bibliothèque est mono-propriétaire au MVP. Caches privés indexés par utilisateur+version et jamais publics ; médias personnels par URL signée ; clé de service côté serveur seulement. Audit expurgé ; retour d'authentification limité à un chemin relatif autorisé. »

**AD-3**, verbatim :
> « Les adaptateurs repository utilisent node-postgres et du SQL paramétré explicite ; un client unique emprunté au Pool porte toute l'unité de travail et ses ports. Toute mutation métier passe par un cas d'usage serveur et une transaction PostgreSQL ; le navigateur n'écrit jamais directement les tables. RLS répète l'isolation comme défense en profondeur. »

**CAP-1** : « Une session authentifiée ouvre la bibliothèque au contexte restauré ; sans authentification, aucune donnée privée n'est consultable ou modifiable. »

**CAP-11** : « Ordinateur et tablette donnent les mêmes résultats ; chaque glisser-déposer a une commande visible ; le plancher WCAG 2.2 AA est satisfait sans dépendance exclusive au geste, survol, clic droit ou couleur. »

**Observabilité**, verbatim : « journaux sans email, titre personnel, contenu importé ni URL signée ».

### Fondations visuelles

Tokens prescrits par `DESIGN.md`, à utiliser tels quels.

**Clair** — surface `#FAFAF9`, surface haute `#FFFFFF`, encre `#1C1917`, encre secondaire `#57534E`, bordure `#D6D3D1`, accent `#9A3412`, survol `#7C2D12`, sur accent `#FFFFFF`, focus `#9A3412`, erreur `#B91C1C` sur `#FEE2E2`.

**Sombre** — surface `#171412`, surface haute `#211D1A`, encre `#FAFAF9`, encre secondaire `#D6D3D1`, bordure `#57534E`, accent `#FDBA74`, survol `#FED7AA`, sur accent `#431407`, erreur `#FCA5A5` sur `#481B1B`.

**Typographie** — `body` Inter 16px/400, interligne 1.55 ; `label` Inter 14px/600 ; `heading-md` Lora 22px/600. Règle : **aucun contrôle n'utilise une serif**. Les formulaires sont en Inter.

**Espacement** sur grille de 4px : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64. Gouttière 24px sur ordinateur, 20px sur tablette.

**Rayons** : 8px pour les contrôles, 12px pour les panneaux.

**Accessibilité chiffrée** : cibles 44px au pointeur et 48px au tactile ; focus visible à 3:1 non masqué ; texte 4,5:1, grands textes et bordures 3:1 ; zoom 200 % et reflow 400 % à 320 px sans défilement bidimensionnel ; espacement de texte WCAG 1.4.12 sans perte ni chevauchement ; `prefers-reduced-motion` supprime glissements et transitions.

**Ton** — tutoiement direct, chaleureux, phrases courtes, conséquences concrètes, enthousiasme retenu. Exemples attestés du registre : « Ton livre est enregistré. », « Cet emplacement manque de place. Déplace des livres ou choisis une autre Étagère. », « Réessayer ». À éviter : « Erreur de dépôt », les points d'exclamation multiples, une coche sans texte.

### État actuel et fichiers à préserver

**`supabase/tests/database/rls.test.sql`** — 27 lignes, le gabarit exact de l'AC 4. `begin` / `plan(4)` / `set local role authenticated` / `set_config('request.jwt.claim.sub', '<uuid>', true)` / `results_eq` / `is_empty` / `throws_ok(…, '42501', …)` / `finish` / `rollback`. La politique y est écrite en `(select auth.uid())` avec `using` et `with check` symétriques, et le `grant` au rôle `authenticated` est explicite. Reproduire ce motif.

**`scripts/run-database-gates.mjs`** — trois ports réservés dynamiquement, `mkdtemp`, `project_id` unique, substitutions par regex **non globales**, exclusion de tous les services sauf `db`, pgTAP injecté par stdin, liste de fichiers SQL **codée en dur**.

**`src/shared/kernel/pool.ts`** — singleton paresseux, `max: 4`. Se connecte en `postgres`, donc hors RLS. C'est le point de départ de T2.

**`playwright.config.ts`** — quatre projets correspondant exactement à la matrice d'audit. `baseURL` sur le port 3100, `webServer` ne lance que Next, `SUPABASE_ANON_KEY` factice.

**`src/app/globals.css`** — porte déjà `.welcome-shell` et `.welcome-card`, structure réutilisable pour une surface centrée.

**Le canari outbox** assert sur les réponses 200 et 401 de la route existante : ne pas y toucher.

### Exigences de tests et définition de fini

`node:test` avec `node:assert/strict`, aucun framework tiers, noms en français. Le pattern d'import TypeScript depuis un `.mjs` est établi dans `tests/unit/deferred-effects.test.mjs` — import direct, relance avec `--experimental-strip-types`, retrait de `NODE_TEST_CONTEXT`, et bloc `registerHooks` pour l'alias `@/`.

Aucune inspection de texte ne vaut preuve. Chaque porte a sa mutation.

Fini quand : les quatre AC sont prouvés par test exécutable, les onze portes passent, la mutation associée prouve que la nouvelle preuve bloque, et `sprint-status.yaml` est à jour.

### Enseignements des stories précédentes

1. **Ce que le harnais ne voit pas.** `publish_effect` était inutilisable par `service_role` parce que la CI se connecte en propriétaire. **Le même piège guette ici, en plus grave** : tester RLS avec un rôle propriétaire donnerait un test vert sur une protection inexistante. Toujours poser explicitement le rôle et le claim.
2. **Une garde qui ne garde rien** — un court-circuit avait désactivé la protection anti-production. Ici l'équivalent serait une validation de destination qui accepte une chaîne vide ou un `//`.
3. **Une porte non câblée dans le workflow** — `ci.yml` n'appelle jamais `ci:all`, il énumère les portes une par une.
4. **La liste figée** ligne 8 de `ci-mutation.test.mjs` casse `ci:integration` dès qu'on ajoute une entrée au fixture.
5. **Docker sous Windows** : injection SQL par stdin, jamais de montage. Aucune action destructive sur l'environnement partagé sans accord.
6. **Les quantificateurs non bornés** dans une expression régulière sur du texte utilisateur produisent une rétrogradation quadratique. La validation de destination et celle d'e-mail traitent toutes deux de l'entrée utilisateur.

### Informations techniques actuelles

`@supabase/supabase-js` **n'est pas installé** ; l'architecture épingle 2.110.8. `@supabase/ssr` non plus.

`supabase/config.toml` n'a **aucune section `[auth]`**. Les noms de clés exacts pour la CLI 2.101.0 sont à vérifier, pas à deviner.

Le harnais n'exécute aujourd'hui que le conteneur `db`. `auth.uid()` y fonctionne néanmoins, le schéma `auth` étant fourni par l'image de base — c'est ce qui rend les tests RLS possibles sans GoTrue.

Playwright n'a ni `globalSetup`, ni `storageState`, ni projet de préparation. Le motif d'authentification partagée reste entièrement à construire.

**Trois points à vérifier plutôt qu'à supposer :**
1. Les noms de clés de la section `[auth]` pour la CLI épinglée.
2. Si `postgrest` est une dépendance de démarrage de GoTrue dans la CLI — il n'est pas nécessaire fonctionnellement, AD-3 imposant node-postgres.
3. L'impact réel de `gotrue` et `kong` sur la durée de `ci:database`. Aucune mesure n'existe aujourd'hui ; en prendre une avant et après.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md#Epic-1-Story-1.6`]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md#AD-3`, `#AD-10`, `#AD-11`]
- [Source : `_bmad-output/specs/spec-my-bookshelf/SPEC.md#CAP-1`, `#CAP-11`]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/DESIGN.md`] — tokens
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md`] — patterns de formulaire, règle de focus, ton
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/review-accessibilite.md#A11Y-05`]
- [Source : `supabase/tests/database/rls.test.sql`] — gabarit RLS

## Enregistrement de l'agent de développement

### Modèle utilisé

_À renseigner par l'agent de développement._

### Références du journal de débogage

### Plan d'implémentation

### Notes de complétion

### Liste des fichiers

## Journal des modifications

| Date | Description |
|---|---|
| 2026-08-05 | Story créée et contextualisée, statut `ready-for-dev`. Méthode d'authentification tranchée par l'utilisateur : e-mail + mot de passe. |
