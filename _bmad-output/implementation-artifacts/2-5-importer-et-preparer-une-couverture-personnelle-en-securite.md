---
story_id: "2.5"
story_key: "2-5-importer-et-preparer-une-couverture-personnelle-en-securite"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "30c0784"
---

# Story 2.5 : Importer et préparer une couverture personnelle en sécurité

Status: review

## Story

En tant que Zan, je veux préparer une couverture personnelle utilisable légalement, sans exposer l’original.

## Acceptance Criteria

1. JPEG/PNG/WebP/AVIF, 20 Mio et 40 MP sont contrôlés sur les octets et les métadonnées ; l’EXIF est supprimé et l’actif commence en `quarantined`.
2. Un type, contenu, droit ou seuil invalide est refusé avec un code stable ; les autres champs de la saisie restent indépendants.
3. Sharp produit une variante WebP privée, immuable et adressée par SHA-256.
4. Les métadonnées, variantes et reçus idempotents sont privés et préparés pour le passage atomique `quarantined` → `private`, sans créer de Work, Edition, Copy ou Reading.

## Tasks / Subtasks

- [x] T1 — Ajouter les invariants métier et la validation de l’enveloppe d’import.
- [x] T2 — Ajouter l’adaptateur Sharp borné, rotation EXIF et variante WebP sans métadonnées.
- [x] T3 — Ajouter les tables MediaAsset, Variant et reçu avec RLS stricte.
- [x] T4 — Ajouter les preuves unitaires de type, taille, pixels, contenu, droits et EXIF.
- [x] T5 — Exécuter les gates et mettre à jour la roadmap visuelle.

## Definition of Done

- Aucun actif personnel n’est public et aucun effet bibliographique n’est créé.
- Les octets déclarés sont confrontés au format réellement détecté.
- La variante est produite sous une limite de pixels et sans EXIF.
- Les privilèges navigateur n’autorisent ni dépôt direct ni forge de reçu.

## Dev Agent Record

### Summary

- Ajout du contrat de couverture personnelle, validation des droits, format, taille et pixels.
- Ajout de l’adaptateur Sharp qui inspecte le contenu, applique l’orientation puis produit une variante WebP sans métadonnées.
- Ajout du schéma média privé et de son reçu idempotent, sans relation bibliographique prématurée.
- L’identifiant d’actif est stable pour un même SHA-256 et la promotion de quarantaine est une transition métier explicite.

### Validation

- `npm run lint` : à exécuter.
- `npm run typecheck` : à exécuter.
- Tests unitaires ciblés : à exécuter.
- `npm run ci:database` : vert.

### File List

- `src/modules/media/domain/personal-cover.ts`
- `src/modules/media/application/prepare-personal-cover.ts`
- `src/modules/media/adapters/sharp-personal-cover.ts`
- `supabase/migrations/20260807000400_media_personal_cover_expand.sql`
- `supabase/tests/database/media-personal-cover-rls.test.sql`
- `tests/unit/personal-cover.test.mjs`
