---
id: SPEC-my-bookshelf
companions:
  - requirements-traceability.md
  - ../../planning-artifacts/architecture/architecture-Bibiliothéque virtuelle-2026-07-27/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/DESIGN.md
  - ../../planning-artifacts/ux-designs/ux-Bibiliothéque virtuelle-2026-07-24/EXPERIENCE.md
sources:
  - ../../planning-artifacts/prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md
  - ../../planning-artifacts/prds/prd-Bibiliothéque virtuelle-2026-07-24/addendum.md
---

> **Contrat canonique.** Cette SPEC et ses `companions:` forment le contrat complet et validé. Les sources servent uniquement à la traçabilité.

# My BookShelf

## Why

Réaliser pour Zan-missel une bibliothèque web personnelle, stable et fidèle à une bibliothèque physique, qui réunit suivi des lectures, organisation libre et décoration douce afin de valider l’attachement à cette représentation avant toute extension sociale.

## Capabilities

- **CAP-1 — Accès privé et reprise**
  - **intent:** Zan accède à sa bibliothèque personnelle et retrouve son dernier contexte confirmé.
  - **success:** Une session authentifiée ouvre la bibliothèque au contexte restauré ; sans authentification, aucune donnée privée n’est consultable ou modifiable.
- **CAP-2 — Bibliothèque physique persistante**
  - **intent:** Zan contemple et étend une bibliothèque d’étagères, de livres verticaux présentés par leur tranche et de bibelots.
  - **success:** L’organisation confirmée persiste après reconnexion et au moins 100 exemplaires restent navigables, recherchables et manipulables sans limite arbitraire d’interface.
- **CAP-3 — Ajout depuis le Catalogue**
  - **intent:** Zan trouve une œuvre ou une édition par titre ou auteur et l’ajoute à sa collection.
  - **success:** L’action explicite crée immédiatement un exemplaire manipulable de l’édition choisie sans confondre Œuvre, Édition et Exemplaire.
- **CAP-4 — Ajout manuel intègre**
  - **intent:** Zan ajoute une édition absente sans dépendre d’un fournisseur externe.
  - **success:** Titre et couverture suffisent ; un ISBN identique bloque la recréation, une similarité avertit, et provenance, contributeur et date restent traçables.
- **CAP-5 — Exemplaires et visuels indépendants**
  - **intent:** Zan représente plusieurs exemplaires d’une œuvre avec les couvertures et tranches de son choix.
  - **success:** Les éditions partagent une fiche de lecture ; couverture et tranche se choisissent séparément ; une tranche authentique est prioritaire, sinon un fallback accessible et remplaçable est fourni ; aucun retrait personnel ne supprime un actif commun.
- **CAP-6 — Organisation et repérage libres**
  - **intent:** Zan range, regroupe, catégorise et retrouve ses exemplaires selon sa logique.
  - **success:** Déplacements unitaires ou collectifs sont atomiques ; thèmes multiples, groupes, repères non exclusivement colorés et suggestions opt-in sont disponibles ; la recherche interne localise sans réordonner.
- **CAP-7 — Lectures et relectures**
  - **intent:** Zan suit son intention de lire et chaque lecture commencée, terminée ou répétée avec ses données personnelles.
  - **success:** Chaque occurrence conserve dates et progression ; seule une fin explicite permet note sur 10 et commentaire ; atteindre le total de pages ne termine ni ne récompense ; l’historique commun persiste entre exemplaires.
- **CAP-8 — Récompenses discrètes**
  - **intent:** Zan découvre après une fin de lecture une récompense en pièces sans être incité à choisir ou prolonger une lecture pour elle.
  - **success:** Aucun montant n’apparaît avant sauvegarde ; la première lecture applique `min(100,max(5,arrondi(pages/10)))` ou 20 sans pagination ; chaque relecture divise le montant précédent par deux avec plancher ; tout crédit est unique et reprenable.
- **CAP-9 — Boutique et inventaire**
  - **intent:** Zan dépense ses pièces en bibelots uniquement cosmétiques et peut les conserver sans les placer.
  - **success:** L’assortiment initial contient 4 objets à 10, 4 à 25, 3 à 50 et 1 à 100 pièces ; débit, achat et possession sont atomiques et non doublables ; un solde insuffisant bloque sans culpabilisation.
- **CAP-10 — Décoration sans altération**
  - **intent:** Zan personnalise le meuble et place, déplace ou retire ses bibelots sans perdre son rangement.
  - **success:** Les choix cosmétiques préservent toutes les positions ; un placement valide réorganise localement sans chevauchement ; un placement invalide ou un échec restaure l’état confirmé ; un retrait rend l’objet disponible.
- **CAP-11 — Expérience accessible équivalente**
  - **intent:** Zan accomplit toutes les actions du MVP à la souris, au tactile ou au clavier avec une information perceptible.
  - **success:** Ordinateur et tablette donnent les mêmes résultats ; chaque glisser-déposer a une commande visible ; le plancher WCAG 2.2 AA de `DESIGN.md` et `EXPERIENCE.md` est satisfait sans dépendance exclusive au geste, survol, clic droit ou couleur.
- **CAP-12 — Sauvegarde et reprise fiables**
  - **intent:** Zan sait si ses actions sont enregistrées et reprend après erreur réseau ou conflit sans corruption silencieuse.
  - **success:** Sauvegarde, succès et erreur sont perceptibles ; les mutations sont tout-ou-rien et idempotentes ; un conflit local/distant exige un choix ; aucun faux succès hors ligne, débit orphelin ou rangement partiel n’est possible.
- **CAP-13 — Catalogue résilient et maîtrisable**
  - **intent:** Zan bénéficie de données bibliographiques enrichies tout en gardant la maîtrise de ses choix personnels.
  - **success:** Google Books est principal, Open Library complémentaire et la BnF enrichit le français ; Amazon est exclu ; les données personnelles restent modifiables et les rapprochements non exacts réversibles.

## Constraints

- `AD-1` à `AD-12` dans `ARCHITECTURE-SPINE.md` gouvernent intégralement l’architecture : frontières et ownership (`AD-1`), fondation web (`AD-2`), données (`AD-3`), modèle bibliographique/lecture (`AD-4`), rangement (`AD-5`), commandes et hors-ligne (`AD-6`), canon/provenance (`AD-7`), médias (`AD-8`), économie (`AD-9`), confidentialité (`AD-10`), interface accessible et budgets (`AD-11`), livraison et exploitation (`AD-12`).
- `DESIGN.md` et `EXPERIENCE.md` gouvernent sans duplication l’apparence, l’architecture de l’information, les interactions, états, parcours, responsive et accessibilité.
- Les ressources visuelles conservent provenance et droits ; les fournisseurs externes ne bloquent jamais l’ajout manuel ; toute suggestion exige une confirmation explicite.
- Le produit n’optimise ni le volume de lectures, ni le temps passé, ni la densité visuelle au détriment de la simplicité et de la contemplation.

## Non-goals

- Téléphone compagnon ; promotions temporaires ; import CSV ou assistant d’import.
- Amis, partage, social, quiz, défis, contributions récompensées, alertes de sorties, enrichissement communautaire, signalement et modération.
- Meubles, arrière-plans, thèmes complets ou saisonniers au-delà des choix cosmétiques de base ; toute capacité, place ou fonction payante.
- Prêts, emprunteurs et catalogage professionnel.

## Success signal

Dans les 30 premiers jours, Zan ajoute et range au moins 25 livres, réalise au moins 8 sessions sur 3 semaines, ajoute et range un livre du Catalogue en moins de 2 minutes sans aide, consacre au moins 2 sessions à contempler ou décorer, puis achète et place au moins 3 bibelots avec une satisfaction visuelle d’au moins 4/5.

## Assumptions

- Les structures et finitions gratuites de `DESIGN.md` et `EXPERIENCE.md` sont des projections cosmétiques de base compatibles avec l’exclusion PRD des meubles, arrière-plans et thèmes complets.

## Open Questions

- Quels objectifs chiffrés RPO/RTO et quelle durée de rétention retenir avant production selon le niveau Supabase choisi (`AD-12`) ?
