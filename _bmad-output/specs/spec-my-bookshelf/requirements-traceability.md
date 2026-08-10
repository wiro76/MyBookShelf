# Traçabilité des exigences produit

Ce compagnon est dérivé de `.memlog.md` et des deux sources produit qu’elle cite. Les détails d’expérience et d’architecture restent dans les compagnons adoptés.

## Capacités vers exigences

| Capacité | Exigences préservées | Compagnons contraignants |
|---|---|---|
| CAP-1 | FR-1, FR-2, NFR-1, NFR-7, NFR-8 | `EXPERIENCE.md`, `AD-3`, `AD-6`, `AD-10` |
| CAP-2 | FR-3, FR-4, NFR-1, NFR-4, NFR-9, NFR-10 | `DESIGN.md`, `EXPERIENCE.md`, `AD-5`, `AD-11` |
| CAP-3 | FR-5, FR-6, FR-8 | `EXPERIENCE.md`, `AD-4`, `AD-7` |
| CAP-4 | FR-7, FR-13 | `EXPERIENCE.md`, `AD-7`, `AD-8` |
| CAP-5 | FR-8 à FR-12 | `DESIGN.md`, `EXPERIENCE.md`, `AD-4`, `AD-7`, `AD-8` |
| CAP-6 | FR-14 à FR-19, NFR-2, NFR-3, NFR-10 | `DESIGN.md`, `EXPERIENCE.md`, `AD-5`, `AD-6`, `AD-11` |
| CAP-7 | FR-20 à FR-22 | `EXPERIENCE.md`, `AD-4`, `AD-6` |
| CAP-8 | FR-23 à FR-25 | `DESIGN.md`, `EXPERIENCE.md`, `AD-4`, `AD-9` |
| CAP-9 | FR-26 | `DESIGN.md`, `EXPERIENCE.md`, `AD-9`, `AD-10` |
| CAP-10 | FR-27, NFR-2, NFR-3, NFR-10 | `DESIGN.md`, `EXPERIENCE.md`, `AD-5`, `AD-9`, `AD-11` |
| CAP-11 | FR-28, FR-29, NFR-3, NFR-5, NFR-6, NFR-9 | `DESIGN.md`, `EXPERIENCE.md`, `AD-11` |
| CAP-12 | FR-23, FR-26, NFR-1, NFR-2, NFR-8 | `EXPERIENCE.md`, `AD-5`, `AD-6`, `AD-9`, `AD-12` |
| CAP-13 | FR-5, FR-7, FR-9 à FR-11, FR-13 | `EXPERIENCE.md`, `AD-7`, `AD-8` |

## Garde-fous préservés

- Images : provenance et droits connus, information sur le droit d’usage personnel, actifs communs indépendants des choix privés, tranche générée personnelle jusqu’à contribution explicite.
- Économie : gain caché, relectures non exploitables à l’infini, progression visible sans obligation ; aucun objet n’accorde capacité, place ou fonction.
- Données : Google Books principal, Open Library complémentaire, BnF pour l’enrichissement français, Amazon exclu ; indisponibilité externe non bloquante et données personnelles modifiables.
- Qualité : persistance, atomicité, retour continu, échelle de 100 exemplaires, alternatives accessibles, confidentialité privée par défaut, sauvegarde perceptible, retour <100 ms et stabilisation <500 ms, absence de chevauchement et préservation de l’ordre relatif.

## Mesures et contre-mesures

| Identifiant | Critère |
|---|---|
| SM-1 | Au moins 25 livres ajoutés et rangés au premier mois. |
| SM-2 | Au moins 8 sessions sur au moins 3 semaines distinctes en 30 jours. |
| SM-3 | Ajouter et ranger un livre du Catalogue en moins de 2 minutes sans aide. |
| SM-4 | Au moins 2 sessions consacrées uniquement à contempler ou décorer en 30 jours. |
| SM-5 | Au moins 3 bibelots achetés et placés et satisfaction visuelle d’au moins 4/5 à 30 jours. |
| SM-C1 | Ne pas optimiser le volume de lectures déclarées. |
| SM-C2 | Ne pas optimiser le temps passé. |
| SM-C3 | Ne pas optimiser la densité au détriment de la lisibilité et de la contemplation. |

## Décisions de l’addendum

- La qualité visuelle minimale de la tranche générée est résolue par `DESIGN.md` et `EXPERIENCE.md`; son pipeline déterministe et accessible est gouverné par `AD-8` et `AD-11`.
- Les contraintes d’import sont résolues par `AD-8` : JPEG/PNG/WebP/AVIF, 20 Mio, 40 MP, validation des octets, suppression EXIF, originaux privés et variantes produites hors requête.
- Les gestes de sélection, actions contextuelles, regroupements et repères sont résolus par `EXPERIENCE.md`; aucune action nécessaire ne dépend exclusivement du survol, clic droit, appui maintenu, glisser-déposer ou couleur.
- Le téléphone compagnon reste différé ; le cadrage concurrentiel justifie la différenciation par fidélité physique, liberté d’organisation, véritables tranches et gamification décorative douce sans ajouter d’exigence MVP.

## Contenu de wrapper écarté

Objet documentaire, statut et dates de production, références concurrentielles détaillées, et répétitions narratives des parcours dont les résultats sont déjà préservés dans les capacités et compagnons adoptés.
