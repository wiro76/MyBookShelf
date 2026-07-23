# Addendum technique et éléments à approfondir

## Sources possibles pour les métadonnées des livres

Recherche vérifiée le 23 juillet 2026 :

**Décision recommandée pour le MVP :** utiliser Google Books comme source principale, Open Library et la BnF comme compléments, et écarter Amazon.

| Source | Rôle envisagé | Apports | Contraintes | Décision MVP |
|---|---|---|---|---|
| Google Books API | Recherche principale | Titre, auteurs, date, identifiants, pagination, catégories et couvertures | Conditions à réévaluer avant toute monétisation | Retenir |
| Open Library | Source complémentaire | Œuvres, éditions et couvertures | Usage raisonnable, identification du client et mise en cache | Retenir en complément |
| Catalogue général de la BnF | Enrichissement français | Validation et données bibliographiques ouvertes | Intégration moins simple et absence de catalogue général de couvertures | Retenir en complément |
| Amazon | Aucune pour le MVP | Données commerciales riches | Ancienne API dépréciée ; remplacement lié à l’affiliation et soumis à des conditions commerciales | Écarter |

Sources :

- [Utiliser Google Books API](https://developers.google.com/books/docs/v1/using)
- [Référence des volumes Google Books](https://developers.google.com/books/docs/v1/reference/volumes)
- [Conditions Google Books](https://developers.google.com/books/terms)
- [API Open Library](https://openlibrary.org/developers/api)
- [API de couvertures Open Library](https://openlibrary.org/dev/docs/api/covers)
- [API SRU du Catalogue général de la BnF](https://api.bnf.fr/fr/api-sru-catalogue-general)
- [Amazon Creators API](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/introduction)

## Import depuis Booknode

Aucune API publique ni fonction officielle d’export exploitable n’a été identifiée. Le produit ne doit donc pas promettre une synchronisation automatique avec Booknode. Options à étudier :

| Méthode | Prérequis | Statut |
|---|---|---|
| Import CSV générique | Fichier contenant au minimum titre, auteur, ISBN et statut de lecture | Piste réaliste |
| Assistant d’import manuel | Liste copiée ou exportée manuellement par l’utilisateur | Piste de secours |
| Import Booknode spécifique | Méthode autorisée et suffisamment fiable | Expérimental et reporté |

Références :

- [Demande communautaire d’API Booknode](https://forum.booknode.com/viewtopic.php?t=235483)
- [Discussion communautaire sur l’export Booknode](https://forum.booknode.com/viewtopic.php?f=7&p=21881393&t=93782)
