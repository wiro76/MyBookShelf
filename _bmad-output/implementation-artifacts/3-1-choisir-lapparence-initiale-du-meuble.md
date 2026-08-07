---
story_id: "3.1"
story_key: "3-1-choisir-lapparence-initiale-du-meuble"
epic: 3
status: ready-for-dev
created: "2026-08-07"
baseline_commit: "0147d60"
---

# Story 3.1 : Choisir l’apparence initiale du meuble

Status: ready-for-dev

## Story

En tant que Zan, je veux choisir gratuitement une structure et une finition, afin que la bibliothèque me ressemble dès la première utilisation.

## Critères d’acceptation

1. À la première connexion, plusieurs structures et finitions gratuites sont prévisualisables sans option présumée ni capacité payante.
2. Retour, annulation et confirmation conservent un état et un focus cohérents sur ordinateur, tablette et clavier.
3. Une confirmation persistée ne modifie aucun `Placement`, exemplaire ou statut de lecture.
4. Un échec conserve l’apparence précédente et rend l’intention réessayable.

## Contraintes techniques

- Réutiliser la transaction authentifiée et les garanties RLS de l’Epic 1.
- Persister uniquement une préférence d’apparence appartenant à l’utilisateur.
- Ne créer aucune projection parallèle du rangement.
- Tester le premier accès, l’annulation, le rejeu et l’échec sans mutation de bibliothèque.

## Tâches

- [ ] Définir le contrat domaine des structures, finitions et préférence par défaut.
- [ ] Ajouter la persistance privée idempotente et ses policies RLS.
- [ ] Construire la prévisualisation et le formulaire accessible.
- [ ] Ajouter les tests unitaires, intégration et E2E de non-régression du rangement.
- [ ] Mettre à jour la page d’état du projet et la roadmap visuelle.
