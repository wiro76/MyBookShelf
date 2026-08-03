# Reviewer Gate — Actualité et réalité technologiques

**Date de recontrôle :** 2026-08-03  
**Périmètre :** `ARCHITECTURE-SPINE.md`, après corrections du premier passage.  
**Verdict :** **PASS**

## Résultat

Les cinq corrections demandées sont présentes et techniquement réalistes :

| Point recontrôlé | Résultat |
| --- | --- |
| Workers Vercel bornés | AD-12 fixe désormais Supabase Cron comme déclencheur de Route Handlers Node Vercel protégés, avec consommation pgmq par lots bornés, `maxDuration`, visibility timeout, retries, DLQ applicative et idempotence. Vercel documente le runtime Node des Route Handlers et la configuration directe de `maxDuration` ; Supabase Cron sait effectuer des appels HTTP planifiés. |
| Sauvegarde exclusive | AD-12 dit explicitement « PITR si le plan le permet, sinon sauvegarde quotidienne — jamais les présenter comme simultanés ». C'est conforme au fonctionnement Supabase, où PITR remplace les sauvegardes quotidiennes. La copie Storage reste indépendante, ce qui est nécessaire car les objets ne sont pas inclus dans les sauvegardes PostgreSQL. |
| SDK Sentry exact | La règle et la table nomment maintenant `@sentry/nextjs` 10.68.0, package officiel et compatible Next.js 16. |
| Starter `src/` reproductible | AD-2 impose l'option `--src-dir` avec les autres valeurs réelles de `create-next-app` : App Router, TypeScript strict, Tailwind, ESLint, Turbopack et alias `@/*`. La graine `src/app` est donc reproductible. |
| `pg` 8.22.0 | `pg` / node-postgres 8.22.0 existe, est le tag npm actuel au 2026-08-03 et fournit client, transactions et pooling PostgreSQL pour Node. Il comble correctement le besoin de transactions multi-instructions côté serveur sans introduire une seconde autorité de migrations. |

## Compatibilité de la stack

La combinaison reste cohérente : Node.js 24.18.0 LTS satisfait Next.js 16.2.12, Sharp 0.35.3, `@supabase/supabase-js` 2.110.8, `pg` 8.22.0 et `@sentry/nextjs` 10.68.0. Next.js 16.2.12 est le patch stable qui inclut le backport de support TypeScript 7.0.2. React 19.2.8 est la version stable associée à la ligne Next.js 16.

PostgreSQL 17 est bien le défaut Supabase actuel. `pgmq`, `pg_cron`, Auth, Storage, RLS, Branching preview/persistant et URLs signées existent. Les choix de la spine n'exigent aucune extension retirée de PostgreSQL 17 sur Supabase.

## Constat restant non bloquant

Le diagramme d'exploitation conserve le libellé générique « Workers Node » et le dossier graine `src/workers/`, tandis qu'AD-12 fixe plus précisément des Route Handlers Node sur Vercel. La règle normative lève l'ambiguïté ; harmoniser ultérieurement le diagramme en « Route Handlers workers — Vercel Node » améliorerait seulement la lisibilité.

## Sources primaires

- [Node.js — versions supportées](https://nodejs.org/en/about/previous-releases)
- [Next.js — create-next-app](https://nextjs.org/docs/app/api-reference/cli/create-next-app)
- [Next.js 16 — prérequis et Turbopack](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Vercel — durée maximale des Functions](https://vercel.com/docs/functions/configuring-functions/duration)
- [Vercel — runtime Node.js](https://vercel.com/docs/functions/runtimes/node-js)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [Supabase Queues / pgmq](https://supabase.com/docs/guides/queues)
- [Supabase — sauvegardes et PITR](https://supabase.com/docs/guides/platform/backups)
- [`pg` 8.22.0 sur npm](https://www.npmjs.com/package/pg)
- [`@sentry/nextjs` sur npm](https://www.npmjs.com/package/@sentry/nextjs)
- [Sharp sur npm](https://www.npmjs.com/package/sharp)
- [`@supabase/supabase-js` sur npm](https://www.npmjs.com/package/@supabase/supabase-js)

