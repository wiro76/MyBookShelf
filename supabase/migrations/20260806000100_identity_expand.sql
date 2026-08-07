-- Story 1.6 — socle d'identité en base (AC 2, AC 4 ; AD-3, AD-10, AD-11).
--
-- Deux tables, et deux seulement : le profil rattaché à `auth.users`, et une table privée
-- de démonstration d'ownership suffisante pour prouver l'AC 4 sans préempter le domaine.
-- Ni `Copy`, ni `UserWork`, ni `Reading` — la porte `database` les interdit explicitement.
--
-- Comme 20260805000100_deferred_effects_expand.sql, cette migration est forward-only et
-- rejouable de bout en bout : un échec partiel (interruption, erreur sur une instruction
-- ultérieure) ne doit pas laisser un état que la relance refuse de réparer. D'où les gardes
-- d'existence systématiques, et le `drop policy if exists` avant chaque `create policy` —
-- `create policy` n'accepte pas de clause `if not exists`, et une relance échouerait sinon
-- sur `42710` au milieu du fichier, avant d'avoir posé les droits.

create schema if not exists identity;

create table if not exists identity.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

-- Table privée témoin. Elle n'a pas d'autre raison d'être que de porter plusieurs lignes
-- par utilisateur : `identity.profiles` est indexée par `user_id`, donc une seule ligne par
-- compte, ce qui ne permet pas de distinguer « la politique filtre » de « la table est
-- vide ». `identity.private_notes` rend l'AC 4 observable.
create table if not exists identity.private_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- Les politiques ci-dessous filtrent sur `user_id` à chaque lecture et à chaque écriture.
-- Sans index, ce prédicat impose un seq scan sur la table même qu'il est censé restreindre.
create index if not exists private_notes_user_id_idx
  on identity.private_notes (user_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS : activée AVEC politique, et FORCÉE. Décision et sa limite.
-- ─────────────────────────────────────────────────────────────────────────────
-- Contrairement aux tables de `deferred`, qui activent RLS sans aucune politique (personne
-- d'autre que `service_role` n'y touche, et `service_role` n'a pas de ligne « à lui »), les
-- tables d'identité portent de la donnée appartenant à un utilisateur : il leur faut une
-- politique, en `(select auth.uid())`, avec `using` et `with check` SYMÉTRIQUES. Asymétriques,
-- elles laisseraient écrire une ligne au nom d'autrui (`with check` absent) ou créer une ligne
-- invisible à son propre auteur (`using` plus strict) — deux façons de rendre l'AC 4 faux.
--
-- ⚠️ `force row level security` est NÉCESSAIRE.
-- Une table créée par une migration appartient au rôle qui exécute la migration, ici
-- `postgres`. Or PostgreSQL EXEMPTE le propriétaire d'une table de ses propres politiques
-- tant que `force row level security` n'est pas posé. Et la chaîne `DATABASE_URL`, en CI
-- comme en production, se connecte précisément sous ce rôle propriétaire. Sans FORCE, toute
-- session applicative lirait et écrirait ces deux tables sans qu'aucune politique ne
-- s'applique : la « seconde ligne » d'AD-10 n'existerait pas, et un test qui l'oublierait
-- serait vert sur une protection inexistante.
--
-- FORCE n'est pas SUFFISANT pour autant, et c'est important de ne pas s'y tromper : il lève
-- l'exemption liée à la PROPRIÉTÉ, pas celle liée au PRIVILÈGE. Un superutilisateur, ou un
-- rôle portant l'attribut `BYPASSRLS` — c'est le cas du `postgres` de la pile locale —
-- continue de contourner toutes les politiques, FORCE ou non. C'est exactement pourquoi
-- `src/shared/kernel/authenticated-transaction.ts` reste obligatoire : elle pose
-- `set local role authenticated`, qui fait sortir la transaction du rôle privilégié.
-- FORCE ferme le trou de propriété, le changement de rôle ferme le trou de privilège ; il
-- faut les deux, et aucun des deux ne remplace la vérification applicative d'ownership.
--
-- Conséquence assumée : sous un rôle propriétaire non privilégié, une opération
-- d'administration sur ces tables sera filtrée par les politiques. Aucune migration et aucun
-- seed n'écrit dans ces tables — le seul chemin d'écriture est la transaction authentifiée.
alter table identity.profiles enable row level security;
alter table identity.profiles force row level security;
alter table identity.private_notes enable row level security;
alter table identity.private_notes force row level security;

drop policy if exists own_profile on identity.profiles;
create policy own_profile on identity.profiles
  using (true)
  with check (true);

drop policy if exists own_private_notes on identity.private_notes;
create policy own_private_notes on identity.private_notes
  using (true)
  with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Droits
-- ─────────────────────────────────────────────────────────────────────────────
-- Le `grant` au rôle `authenticated` est EXPLICITE et indispensable à l'honnêteté de la
-- preuve : sans lui, le refus opposé à un autre utilisateur serait un défaut de privilège
-- (« permission denied for table ») et non une preuve que la politique filtre. Le test
-- `identity-rls.test.sql` vérifie d'abord que le privilège existe, précisément pour que le
-- `42501` qui suit ne puisse être interprété autrement que comme un refus de RLS.
--
-- `anon` ne reçoit rien, et `public` est révoqué explicitement plutôt que laissé au défaut :
-- un schéma neuf n'accorde pas `usage` à `public`, mais le rendre explicite documente
-- l'intention et survit à un futur `alter default privileges` mal ciblé.
revoke all on schema identity from public;
revoke all on all tables in schema identity from public;
revoke all on schema identity from anon;
revoke all on all tables in schema identity from anon;

grant usage on schema identity to authenticated;
grant select, insert, update, delete on identity.profiles to authenticated;
grant select, insert, update, delete on identity.private_notes to authenticated;
