# Rapprochement final — Product Brief vers PRD

## Entrée rapprochée

- `_bmad-output/planning-artifacts/briefs/brief-Bibiliothéque virtuelle-2026-07-23/brief.md`
- `_bmad-output/planning-artifacts/briefs/brief-Bibiliothéque virtuelle-2026-07-23/addendum.md`
- `_bmad-output/planning-artifacts/briefs/brief-Bibiliothéque virtuelle-2026-07-23/.memlog.md`

## Sorties contrôlées

- `_bmad-output/planning-artifacts/prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md`
- `_bmad-output/planning-artifacts/prds/prd-Bibiliothéque virtuelle-2026-07-24/addendum.md`

## Verdict

**Rapprochement globalement satisfaisant, avec deux écarts fonctionnels à arbitrer et deux pertes documentaires mineures.**

Le PRD conserve fidèlement l’identité du produit : bibliothèque physique centrée sur les tranches, organisation libre et persistante, suivi de lecture, boucle Lecture–Pièces–Bibelots, usage personnel initial, confidentialité protectrice et limitation du MVP à l’ordinateur et à la tablette. Les décisions prises après le Product Brief précisent utilement le modèle Œuvre–Édition–Exemplaire, les relectures, les véritables tranches, la suppression, l’économie et les interactions tactiles sans contredire la vision source.

Aucun élément explicitement reporté par le Product Brief n’a été accidentellement réintroduit dans le MVP. Aucun bloc essentiel du MVP — bibliothèque visuelle, ajout, fiche, suivi, pièces ou bibelots — n’est absent.

## Couverture des décisions actives

| Élément du Product Brief final | Couverture dans le PRD | Observation |
|---|---|---|
| Bibliothèque réaliste, livres sur leur tranche, étagères extensibles | Complète | Vision, FR-2 à FR-4, NFR-1 |
| Organisation personnelle et catégories libres | Complète | FR-11 à FR-15 |
| Recherche et ajout depuis un catalogue | Complète | FR-5 et FR-6 |
| Ajout simplifié d’un ouvrage manquant | Complète | FR-7 et garde-fou d’indisponibilité du Catalogue |
| Fiches riches et distinction des éditions | Complète et approfondie | FR-7 à FR-10, modèle Œuvre–Édition–Exemplaire |
| Suivi commencé/terminé, dates, note et commentaire | Complète et approfondie | FR-16 à FR-18, ajout du statut À lire et des relectures |
| Pièces après lecture terminée | Complète et précisée | FR-19 à FR-21 |
| Boutique initiale limitée aux bibelots | Complète et précisée | FR-22 et FR-23 |
| Confidentialité protectrice par défaut | Complète pour le MVP | NFR-7 ; partage correctement reporté |
| Sources Google Books, Open Library, BnF ; Amazon écarté | Complète sur la décision | Section 6.3 |
| Import Booknode non promis et pistes alternatives reportées | Complète | Non-objectifs et périmètre reporté |
| Galerie de couvertures avec choix personnel | Partielle | Voir écart E2 |
| Suggestions facultatives de classement | Absente | Voir écart E1 |

## Écarts à traiter

### E1 — Suggestions facultatives de catégories ou de classement absentes

**Sévérité : moyenne — décision MVP omise**

Le Product Brief inclut explicitement la possibilité de recevoir des suggestions de classement sans jamais les subir, ainsi que des suggestions de catégories facultatives dans le périmètre de première version. Le PRD permet de créer et d’attribuer des Thèmes, mais ne prévoit aucune suggestion.

**Impact :** l’omission ne compromet pas la boucle centrale, mais retire une aide destinée à réduire l’effort de rangement initial.

**Action recommandée :** soit ajouter une exigence fonctionnelle légère permettant de proposer des Thèmes ou regroupements à partir des métadonnées, avec validation obligatoire par Zan, soit reporter explicitement cette capacité dans la section 8.2 afin que la réduction de périmètre soit consciente.

### E2 — Galerie de couvertures multiples insuffisamment spécifiée

**Sévérité : moyenne — capacité MVP seulement implicite**

Le Product Brief prévoit une galerie de couvertures permettant de choisir librement parmi des éditions françaises, japonaises, anglaises et autres illustrations officielles. FR-9 autorise le choix et la modification de la Couverture indépendamment de la Tranche, mais aucune exigence ne garantit que plusieurs couvertures disponibles soient consultables et sélectionnables dans une galerie.

**Impact :** une implémentation conforme au texte actuel pourrait n’offrir qu’une image importée ou une couverture par défaut, tout en satisfaisant formellement FR-9.

**Action recommandée :** préciser dans FR-9 que Zan peut consulter les Couvertures disponibles pour l’Œuvre ou ses Éditions et en sélectionner une indépendamment de la Tranche. L’ajout communautaire de nouvelles Couvertures peut rester reporté.

### E3 — Portée de l’ajout manuel par rapport au Catalogue commun ambiguë

**Sévérité : faible à moyenne — divergence de portée potentielle**

Le Product Brief indique que la création d’un ouvrage absent enrichit progressivement le catalogue commun sans intervention administrative systématique. FR-7 permet de créer l’Œuvre, tandis que la section 8.2 reporte « l’enrichissement communautaire du Catalogue ». Le PRD ne dit donc pas clairement si l’entrée créée manuellement est privée à Zan, ajoutée à un catalogue commun, ou destinée à être promue plus tard.

**Impact :** cette ambiguïté influence le modèle de données, la déduplication, la provenance des images et les besoins de modération.

**Action recommandée :** pour le MVP personnel, déclarer explicitement que l’ajout manuel crée une entrée utilisable dans la Bibliothèque de Zan sans publication communautaire ; réserver la promotion vers le Catalogue commun à la phase reportée. Si le Catalogue doit être enrichi dès le MVP, retirer cette capacité des reports et définir les garde-fous minimaux.

### E4 — Contraintes d’exploitation des sources externes non retransmises

**Sévérité : faible — perte d’addendum**

La sélection des sources est bien reprise, mais le PRD et son addendum ne conservent pas plusieurs précautions du Product Brief : réévaluation des conditions Google Books avant monétisation, usage raisonnable et mise en cache pour Open Library, et limites de la BnF concernant les couvertures. Les références officielles ont également disparu.

**Impact :** aucune lacune fonctionnelle immédiate, mais une partie du contexte utile à l’architecture et à la conformité pourrait être perdue lors du passage en réalisation.

**Action recommandée :** reporter ces contraintes et leurs liens dans l’addendum du PRD, sans alourdir les exigences fonctionnelles.

## Contradictions et reports contrôlés

### Contradictions

Aucune contradiction majeure n’a été relevée entre la version finale du Product Brief et le PRD.

- La récompense fondée uniquement sur la pagination dans le MVP est compatible avec le Brief, qui réservait une formule enrichie par la rareté à une évolution ultérieure.
- Le choix indépendant de la Couverture et de la Tranche approfondit le choix esthétique personnel sans le contredire.
- L’ajout du statut **À lire**, des relectures, des Exemplaires multiples et de la suppression étend le MVP sans remettre en cause ses invariants.

### Éléments correctement reportés

Les éléments suivants ne sont pas inclus accidentellement dans le MVP : amis, fil d’activité, partage public, quiz, défis, alertes de nouveaux tomes, récompenses de contributions, statistiques communautaires, import Booknode avancé, téléphone compagnon, meubles, arrière-plans, thèmes complets et objets saisonniers.

Le parcours téléphone figure uniquement comme extension post-MVP et ne crée pas d’exigence applicable à la première version.

## Idées qualitatives préservées

Les idées qualitatives les plus importantes du Brief restent visibles dans le PRD :

- plaisir de contempler une bibliothèque familière ;
- illusion d’une bibliothèque physique plutôt qu’une grille de couvertures ;
- stabilité et sentiment d’ordre entre les visites ;
- liberté d’organisation sans classement imposé ;
- personnalisation reconnaissable comme appartenant à Zan ;
- gamification douce, expressive et non coercitive ;
- priorité donnée à l’attachement plutôt qu’au temps passé ou au volume de lectures.

## Conclusion

Le PRD peut poursuivre sa finalisation sans reprise structurelle. Avant le polish final, il est recommandé de trancher E1 et E2, car ils concernent deux capacités annoncées dans le périmètre MVP du Product Brief. E3 doit être clarifié avant l’architecture afin d’éviter une interprétation communautaire prématurée. E4 peut être corrigé dans l’addendum sans modifier le produit.
