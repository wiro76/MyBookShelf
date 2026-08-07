---
story_id: "2.8"
story_key: "2-8-collecter-les-medias-revoques-sans-compromettre-les-sauvegardes"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "40f1c7d"
---

# Story 2.8 : Collecter les médias révoqués sans compromettre les sauvegardes

Status: review

## Acceptance Criteria

1. Un actif n’est éligible au GC que s’il est révoqué, sans référence active et hors rétention.
2. Chaque hash présent dans un manifeste de sauvegarde protège l’objet jusqu’à expiration de `retained_until`.
3. La décision GC est idempotente et corrélable par `commandId`, sans donnée personnelle dans les journaux.
4. La décision SQL ne supprime jamais directement un objet Storage ; le worker reste responsable de la suppression physique vérifiée.

## Tasks / Subtasks

- [x] T1 — Ajouter la décision métier GC et ses quatre raisons stables.
- [x] T2 — Ajouter le registre des hashes de manifestes et les claims GC.
- [x] T3 — Ajouter la fonction serveur et les protections RLS.
- [x] T4 — Ajouter les tests unitaires et pgTAP.
- [x] T5 — Mettre à jour la roadmap BMAD.

## Dev Agent Record

- Le GC distingue explicitement référence active, rétention de sauvegarde et éligibilité.
- La suppression Storage est volontairement hors transaction SQL et sera exécutée par un worker idempotent.
