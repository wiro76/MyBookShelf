---
baseline_commit: ea9bbc0aaf5a3e874ef2d46943c5952600b146ea
---

# Story 1.1 : Configurer le projet initial depuis le starter officiel

Status: in-progress

## Story

En tant que Zan,
je veux ouvrir un socle web cohérent,
afin que chaque incrément du MVP fonctionne sur la même fondation ordinateur et tablette.

## Critères d’acceptation

1. **Étant donné** un dépôt applicatif vide, **quand** le projet est créé, **alors** la commande officielle `create-next-app` active App Router, TypeScript strict, Tailwind, ESLint, Turbopack, l’alias `@/*` et l’option `--src-dir`.
2. **Étant donné** le projet généré, **quand** il est installé et construit, **alors** Next.js/React s’exécutent sur Node.js LTS et le gestionnaire choisi produit un lockfile versionné qui devient l’autorité des versions.
3. **Étant donné** la graine structurelle, **quand** les dossiers sont créés, **alors** `app` compose seulement le web, les modules suivent `domain/application/adapters`, et aucune règle métier n’est placée dans un composant.
4. **Étant donné** la page initiale, **quand** elle est ouverte sur ordinateur ou tablette, **alors** un contenu utile, un focus visible et un état de chargement sans faux livre sont rendus.

## Tâches / Sous-tâches

- [ ] Générer le projet depuis le starter officiel à la racine du dépôt (AC 1, 2)
  - [ ] Employer `create-next-app@16.2.12` en mode non interactif avec `--ts --tailwind --eslint --app --src-dir --turbopack --import-alias "@/*"` et un seul gestionnaire de paquets.
  - [ ] Ne pas utiliser `latest`, un template tiers, Pages Router, Webpack ou plusieurs lockfiles.
  - [ ] Fixer Node.js `24.18.0` LTS dans les métadonnées du projet et conserver un unique lockfile versionné.
  - [ ] Vérifier après génération Next.js `16.2.12`, React `19.2.8`, TypeScript `7.0.2`, `strict: true` et la résolution `@/*` vers `src/*` ; corriger explicitement toute dérive du générateur puis régénérer le lockfile.
- [ ] Installer la graine du monolithe modulaire hexagonal (AC 3)
  - [ ] Créer `src/modules/{identity,library,reading,catalog,media,economy}/{domain,application,adapters}`.
  - [ ] Créer `src/shared/{kernel,observability}`, `src/workers`, `supabase/migrations`, `tests/integration` et `tests/e2e`.
  - [ ] Garder `src/app` limité à la composition web ; ne créer aucune règle métier, donnée privée, authentification, accès Supabase ou entité factice.
  - [ ] Employer des marqueurs sobres pour versionner les répertoires vides, sans inventer d’API ni de dépendance envers une story future.
- [ ] Remplacer la page de démonstration par un état initial utile et accessible (AC 4)
  - [ ] Produire une page française, sémantique et sobre, adaptée à ordinateur et tablette, sans faux livre ni fausse donnée personnelle.
  - [ ] Fournir au moins une cible clavier utile avec focus visible conforme et un état `loading` respectant la géométrie sans simuler de collection.
  - [ ] Garder le DOM comme autorité ; ne pas introduire Canvas, glisser-déposer, animation obligatoire ou conception téléphone.
- [ ] Ajouter les vérifications minimales propres au scaffold (AC 1–4)
  - [ ] Prévoir des scripts séparés pour lint, vérification TypeScript sans émission et build ; ne pas supposer que `next build` exécute lint ou type-check via Turbopack.
  - [ ] Vérifier installation reproductible depuis le lockfile, lint, type-check strict et build de production sous Node `24.18.0`.
  - [ ] Vérifier ordinateur et tablette : contenu utile, navigation clavier, focus visible, zoom 200 %, reflow à 320 CSS px et absence de faux livre au chargement.
  - [ ] Vérifier automatiquement ou par inspection reproductible la structure attendue et l’absence de logique métier dans `src/app`.

## Notes de développement

### Contexte et limites

- Cette story livre seulement le socle exécutable de l’Epic 1. Elle ne doit pas anticiper la CI exhaustive, RLS/migrations métier, jobs/outbox, observabilité ou restauration des stories 1.2 à 1.5.
- Aucun modèle `Copy`, `UserWork` ou `Reading` n’est créé ici. Aucun faux contenu ne doit préfigurer Catalogue, bibliothèque, lecture ou économie.
- Les non-objectifs restent hors périmètre : téléphone, import CSV, social, prêts, catalogage professionnel, promotions, capacité ou fonction payante.
- RPO, RTO et rétention restent obligatoires avant production, mais ne bloquent ni cette story ni le développement du MVP.

### Exigences techniques

- Versions normatives vérifiées par l’architecture au 2026-08-03 : Node.js `24.18.0` LTS, Next.js `16.2.12`, React `19.2.8`, TypeScript `7.0.2` strict. Le lockfile devient ensuite l’autorité des versions transitives et outils issus du scaffold.
- Next.js 16 utilise Turbopack par défaut ; le flag explicite reste requis par l’acceptation. Ne pas ajouter de configuration Webpack.
- Le code, les types, les contrats et futurs schémas sont nommés en anglais ; l’interface et les textes utilisateur sont en français.
- Les dépendances pointent vers l’intérieur. `src/app` compose l’interface et appellera plus tard les cas d’usage ; il ne porte pas de règles métier.
- Le DOM sémantique est l’autorité. Le plancher est WCAG 2.2 AA : focus perceptible et non masqué, information non exclusivement colorée, fonctionnement clavier, zoom et reflow sans perte.
- Les cibles futures devront respecter 44 px au pointeur et 48 px au tactile ; ne pas dégrader cette base dans la page initiale.

### Structure cible

```text
src/
  app/
  modules/
    identity/{domain,application,adapters}/
    library/{domain,application,adapters}/
    reading/{domain,application,adapters}/
    catalog/{domain,application,adapters}/
    media/{domain,application,adapters}/
    economy/{domain,application,adapters}/
  shared/{kernel,observability}/
  workers/
supabase/migrations/
tests/{integration,e2e}/
```

### Vérification et définition de fini

- Le projet s’installe depuis le lockfile et les scripts lint, type-check et build réussissent sous Node `24.18.0`.
- Les options exigées sont vérifiables dans les fichiers générés : App Router sous `src/app`, TypeScript strict, Tailwind, ESLint, Turbopack et alias `@/*`.
- La page initiale fonctionne sur ordinateur et tablette, au clavier, à 200 % de zoom et à 320 CSS px, avec focus visible et chargement sans faux livre.
- Aucun élément des stories futures ni non-objectif MVP n’est implémenté ou simulé.
- Ne déclarer la story terminée qu’après exécution et consignation des commandes et contrôles ci-dessus.

### Références

- [Source : `_bmad-output/planning-artifacts/epics-and-stories-my-bookshelf.md` — Epic 1, Story 1.1 et matrice FR-28/FR-29]
- [Source : `_bmad-output/specs/spec-my-bookshelf/SPEC.md` — Constraints et Non-goals]
- [Source : `_bmad-output/planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md` — AD-1, AD-2, AD-11, Stack de départ et Graine structurelle]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/DESIGN.md` — Colors, Layout & Spacing]
- [Source : `_bmad-output/planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md` — Foundation, Accessibility Floor, Responsive & Platform]
- [Documentation officielle `create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [Guide officiel Next.js 16](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Calendrier officiel des versions Node.js](https://nodejs.org/en/about/previous-releases)

## Enregistrement de l’agent de développement

### Modèle utilisé

À renseigner par l’agent de développement.

### Références du journal de débogage

### Notes de complétion

- Analyse exhaustive du contexte terminée ; guide d’implémentation complet créé.

### Liste des fichiers
