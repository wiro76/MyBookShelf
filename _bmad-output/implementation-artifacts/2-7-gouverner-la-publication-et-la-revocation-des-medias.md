---
story_id: "2.7"
story_key: "2-7-gouverner-la-publication-et-la-revocation-des-medias"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "4c2b37f"
---

# Story 2.7 : Gouverner la publication et la révocation des médias

Status: review

## Acceptance Criteria

1. Le cycle média est borné par `quarantined`, `private`, `published` et `revoked`.
2. La publication exige des droits connus ; les originaux et médias personnels restent privés.
3. Une révocation est irréversible, horodatée et conserve les références pour le futur GC.
4. Les changements passent par une fonction serveur contrôlée par propriétaire, jamais par une écriture navigateur directe.

## Tasks / Subtasks

- [x] T1 — Ajouter les invariants de transition dans le domaine et PostgreSQL.
- [x] T2 — Ajouter droits, horodatage et références d’actifs.
- [x] T3 — Ajouter la façade serveur de transition et les privilèges RLS.
- [x] T4 — Ajouter les tests unitaires et pgTAP.
- [x] T5 — Mettre à jour la roadmap BMAD.

## Dev Agent Record

- Le cycle est désormais explicite et irréversible après révocation.
- Une publication sans droits connus est refusée.
- Les références restent protégées jusqu’au futur GC de la Story 2.8.
