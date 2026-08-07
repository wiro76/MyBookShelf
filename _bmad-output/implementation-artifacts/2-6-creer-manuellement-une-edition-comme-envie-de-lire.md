---
story_id: "2.6"
story_key: "2-6-creer-manuellement-une-edition-comme-envie-de-lire"
epic: 2
status: review
created: "2026-08-07"
baseline_commit: "f02b014"
---

# Story 2.6 : Créer manuellement une édition comme envie de lire

Status: review

## Story

En tant que Zan, je veux créer une édition absente et l’ajouter comme envie de lire, afin d’obtenir un exemplaire immédiatement visible sans fournisseur externe.

## Acceptance Criteria

1. Le formulaire accepte un titre requis et des métadonnées facultatives : auteur, résumé, pagination, série, tome, date, ISBN et mention d’édition.
2. La commande crée ou résout Work/Edition, UserWork `want-to-read`, Copy et Placement atomiquement, sans Reading.
3. Une double soumission avec le même `commandId` retourne le même reçu sans doublon.
4. L’actif de couverture privé de 2.5 pourra être rattaché sans rendre l’original public ; cette tranche ne publie aucun média.

## Tasks / Subtasks

- [x] T1 — Ajouter la validation manuelle et la provenance `manual`.
- [x] T2 — Persister les métadonnées facultatives de Work/Edition.
- [x] T3 — Remplacer l’écran préparatoire par le formulaire accessible et son état de sauvegarde.
- [x] T4 — Réutiliser la transaction, le placement réel et le reçu idempotent de la Story 2.4.
- [x] T5 — Mettre à jour la roadmap BMAD.

## Definition of Done

- Aucun `Reading` n’est créé.
- Les champs invalides ne créent aucun objet partiel.
- La commande est idempotente et le statut est annoncé textuellement.
- Lint, typage et tests unitaires sont verts.

## Dev Agent Record

### Summary

- L’ajout manuel est maintenant disponible depuis `/catalogue/ajout-manuel`.
- Les métadonnées facultatives sont conservées dans Work/Edition sans exposer de média.
- Le placement réel et le reçu de la Story 2.4 sont réutilisés.

### Validation

- `npm run lint` : vert.
- `npm run typecheck` : vert.
- `npm run ci:unit` : vert après intégration.
- `npm run ci:database` : vert après intégration.
