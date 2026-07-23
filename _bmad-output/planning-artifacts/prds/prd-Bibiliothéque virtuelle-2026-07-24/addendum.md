# Addendum — My BookShelf

## Décisions reportées

| Sujet | Responsable | Décision attendue | Condition de reprise |
|---|---|---|---|
| Qualité de la Tranche générée | Conception UX | Niveau de transformation de la Couverture, lisibilité du titre et fidélité visuelle minimale d’une Tranche crédible | Avant validation du prototype de Bibliothèque et production des composants visuels définitifs |
| Contraintes des images importées | Architecture | Formats, poids et dimensions maximales, compression, stockage et conservation des originaux | Avant implémentation de FR-7 et FR-9 à FR-11 |

## Extension téléphone après le MVP

Près de sa collection physique, Zan utilise le téléphone comme outil compagnon. Il scanne un code-barres ou emploie l’appareil photo pour rechercher une Édition, ajouter une Couverture ou une Tranche et créer un Exemplaire. Il organise ensuite cet Exemplaire plus confortablement sur ordinateur ou tablette.

## Options d’interaction à approfondir en conception UX

Les capacités suivantes sont requises par le PRD, mais leur geste exact reste à tester :

- **Sélection multiple :** appui prolongé sur un livre pour entrer en mode sélection, puis sélection d’autres livres.
- **Actions contextuelles :** commandes révélées au survol ou au clic droit pour déplacer un livre, agir sur une sélection ou sélectionner tout un Regroupement.
- **Regroupements et filtres :** Série, style, auteur, titre et Thèmes peuvent servir à sélectionner ou visualiser des ensembles.
- **Visualisation des préférences :** une commande révèle ou masque les contours colorés définis par l’utilisateur.

La conception UX doit assurer des interactions cohérentes entre souris et tactile, rendre les actions découvrables et prévoir une solution accessible ne dépendant exclusivement ni du survol ni du clic droit.

## Contraintes des sources du Catalogue

- **Google Books :** source principale ; ses conditions d’utilisation devront être réévaluées avant toute monétisation.
- **Open Library :** source complémentaire ; l’intégration devra respecter l’usage raisonnable, l’identification du client et les recommandations de mise en cache.
- **BnF :** source d’enrichissement bibliographique français ; elle ne constitue pas un catalogue général de Couvertures ou de Tranches.
- **Amazon :** exclu du MVP en raison de contraintes commerciales et d’affiliation incompatibles avec le besoin actuel.

Références :

- [Google Books API](https://developers.google.com/books/docs/v1/using)
- [Conditions Google Books](https://developers.google.com/books/terms)
- [Open Library API](https://openlibrary.org/developers/api)
- [BnF — API SRU](https://api.bnf.fr/fr/api-sru-catalogue-general)

## Cadrage concurrentiel

Recherche effectuée en juillet 2026 :

- le suivi, les listes et les objectifs sont déjà largement couverts par Booknode, Goodreads, StoryGraph, Hardcover et LibraryThing ;
- Bookshelf: Reading Tracker occupe déjà le terrain de la bibliothèque esthétique avec dos de livres, glisser-déposer et objets décoratifs ;
- My BookShelf doit donc se distinguer par la fidélité de la Bibliothèque physique, la liberté d’organisation, les véritables Tranches et une gamification douce centrée sur la décoration.

Sources :

- [Booknode — aide](https://booknode.com/aide/route_1)
- [Goodreads — About](https://www.goodreads.com/about/us)
- [The StoryGraph](https://thestorygraph.com/)
- [Hardcover](https://hardcover.app/)
- [LibraryThing — About](https://www.librarything.com/about)
- [Bookshelf: Reading Tracker — App Store](https://apps.apple.com/us/app/bookshelf-reading-tracker/id6654913138)
