# Sauvegarde et restauration complète

Ce runbook couvre la sauvegarde coordonnée de PostgreSQL et Supabase Storage, puis la preuve trimestrielle de leur restauration. Les dumps, objets, manifestes et preuves détaillées sont des données privées critiques. Ils ne sont jamais commités, joints à une pull request ni publiés comme artefacts GitHub de courte durée.

## Responsabilités

| Rôle | Responsabilité |
|---|---|
| Responsable d'astreinte | Ouvre la fenêtre, active la barrière de maintenance, décide de la reprise ou de l'abandon. |
| Opérateur de reprise | Crée et vérifie le point, restaure la cible isolée et consigne le verdict. |
| Propriétaire plateforme | Confirme le mode `pitr` ou `daily`, la destination hors site et les capacités de rétention. |
| Approbateur production | Approuve RPO, RTO et rétention, puis accepte une preuve réussie du trimestre civil UTC courant. |

Une même personne peut tenir plusieurs rôles hors production. En production, l'opérateur ne peut pas auto-approuver les objectifs ni la preuve.

## Préconditions

- Utiliser PostgreSQL 17 et Supabase CLI `2.101.0`.
- Injecter les secrets depuis le coffre opérateur. Aucun secret ne vient du dépôt ou du runtime Next.js.
- Utiliser TLS pour toute source ou cible distante.
- Confirmer que la protection plateforme déclarée est `pitr` lorsqu'elle est disponible, sinon `daily`. L'export logique et la copie Storage hors site restent obligatoires dans les deux cas.
- Vérifier que la destination expose `putExclusive`, `read`, `list` et `verifyRetention`. En production, elle appartient à un autre compte ou projet, est chiffrée, non réinscriptible pendant la rétention et ne peut pas être un filesystem local.
- Préparer une cible de reprise protégée dans la frontière de production. Elle ne contient que les schémas plateforme Supabase : aucune migration, seed ou donnée applicative du dépôt.
- Désactiver sur la cible les cron, webhooks, workers, courriels et appels externes.

Une pull request utilise uniquement des données synthétiques et des piles locales jetables. Elle ne reçoit aucun secret de production et ne peut ni lire une sauvegarde réelle, ni cibler un environnement GitHub protégé.

## Barrière de maintenance

La cohérence entre base et objets repose sur une fenêtre sans écriture vérifiable. Avant l'inventaire initial :

1. Mettre l'application en lecture seule et bloquer les mutations directes.
2. Suspendre workers, imports, traitements média, migrations, webhooks entrants et tâches planifiées.
3. Attendre la fin ou l'abandon contrôlé des transactions et traitements déjà engagés.
4. Enregistrer l'identifiant de la barrière, son heure UTC et les composants arrêtés, sans donnée personnelle.
5. Vérifier continuellement la barrière jusqu'à l'écriture du marqueur final.

Toute écriture concurrente, migration ou perte de la barrière invalide le point. L'opérateur le marque `failed`, ne le réutilise pas et recommence depuis un nouvel identifiant de sauvegarde.

## Créer un point complet

1. Créer exclusivement un nouvel emplacement `<backup-id>` dans la destination hors site. Refuser un identifiant déjà présent.
2. Inventorier les métadonnées Storage et les références de la base.
3. Exporter avec la CLI épinglée : `roles.sql`, `schema.sql` et `data.sql --use-copy --data-only`. Exclure `storage.buckets_vectors` et `storage.vector_indexes` de l'export de données.
4. Exporter séparément `supabase_migrations` vers `history-schema.sql` et `history-data.sql`.
5. Copier chaque objet Storage vers `objects/<sha256>` et vérifier sa taille et son SHA-256 pendant la lecture.
6. Réinventorier Storage et les références. Refuser toute différence avec l'inventaire initial.
7. Générer le manifeste canonique versionné et trié, puis son digest SHA-256. Vérifier chaque export et objet par taille et SHA-256.
8. Écrire le marqueur final en dernier avec une création exclusive, puis vérifier la rétention déclarée par la destination.

Le manifeste conserve les clés Storage nécessaires à la restauration, mais la preuve publiable n'expose ni clé d'objet, ni chemin personnel, ni donnée métier. Un objet manquant, illisible, altéré ou référencé avec un hash différent fait échouer la finalisation. Un objet hors manifeste est signalé et n'est jamais restauré silencieusement.

## Restaurer dans une cible isolée

1. Confirmer que la cible est jetable, distincte de la source et autorisée pour la frontière des données. Une restauration production ne cible jamais local, preview ou staging.
2. Maintenir tous les effets externes désactivés.
3. Vérifier le digest du manifeste, le marqueur final, la rétention et tous les hashes avant d'exécuter le moindre SQL.
4. Restaurer rôles, schéma, données et historique des migrations avec PostgreSQL 17, `psql -X`, `ON_ERROR_STOP=1` et une transaction unique pour la partie base.
5. Réhydrater les octets Storage avec écrasement contrôlé des métadonnées restaurées. Ne pas recréer naïvement une seconde ligne `storage.objects`.
6. Comparer exactement buckets, métadonnées, références, tailles, hashes et octets au manifeste.
7. Vérifier l'authentification canari, les politiques RLS, les données applicatives, l'historique des migrations, les buckets privés et les objets de zéro octet.
8. Mesurer la durée totale en millisecondes, produire exclusivement une preuve horodatée et la verser dans le coffre immuable, même en cas d'échec.
9. Détruire la cible attestée après les vérifications. Un échec de nettoyage invalide l'exercice avec `RECOVERY_TARGET_CLEANUP_FAILED`.

PostgreSQL et Storage ne partagent pas de transaction. Tout échec produit `verdict: failed`, interdit la promotion et entraîne la destruction de la cible jetable ; aucun état partiel n'est déclaré restauré.

## Preuve et décision

La preuve expurgée contient au minimum l'identifiant de l'exercice et du point, les heures UTC, les fingerprints source et cible, le SHA-256 du manifeste, les contrôles base et Storage, la durée, les versions d'outils, le verdict et des codes d'échec stables. Elle ne contient aucun secret, chemin Storage ou contenu restauré.

La preuve réelle, le manifeste et son digest sont écrits dans le coffre immuable hors site. Les logs CI ne conservent que des diagnostics expurgés et les exercices de PR n'utilisent que des fixtures synthétiques. Le digest détecte une altération accidentelle ; l'origine et l'immutabilité reposent sur la frontière opérateur et le stockage WORM.

Un exercice est probant seulement si le manifeste est intact, ses cinq exports SQL sont présents, tous les contrôles base et Storage réussissent, la cible est attestée et isolée, le verdict vaut `passed`, les versions d'outils sont vérifiées et la durée respecte le RTO approuvé. La promotion production applique en plus les règles de [promotion des environnements](./environment-promotion.md).

## Échec, nettoyage et reprise

En cas d'échec :

1. Conserver la preuve expurgée avec `verdict: failed` et le code d'échec ; ne pas finaliser ou promouvoir le point fautif.
2. Maintenir les effets externes de la cible désactivés, puis détruire intégralement la cible jetable.
3. Vérifier qu'aucun credential temporaire, fichier SQL ou objet n'est resté sur le poste opérateur.
4. Si la création du point a échoué, conserver la source en lecture seule jusqu'à la décision explicite de recommencer ou d'abandonner.
5. Réactiver les migrations, imports, webhooks, tâches et workers de la source dans l'ordre inverse de leur arrêt, puis retirer la lecture seule.
6. Contrôler les files et traitements en attente avant de clore l'incident. Ne jamais rejouer aveuglément une opération dont l'état de confirmation est inconnu.

Une restauration de sinistre destinée à remplacer la production exige une décision séparée. La cible vérifiée n'est basculée qu'après validation opérateur ; l'ancienne source reste isolée pour permettre le retour arrière.

## Exercice trimestriel

Le workflow opérateur de reprise doit exposer `workflow_dispatch` et un calendrier `0 3 1 1,4,7,10 *` : 03:00 UTC le premier jour de chaque trimestre civil. Ce workflow protégé n'est pas créé par cette story tant que l'environnement de reprise et son approbateur n'existent pas. Le déclenchement planifié visera uniquement cet environnement et utilisera les secrets de son coffre. Le workflow d'une pull request ne référence jamais cet environnement et ne peut pas hériter de ses secrets.

Après chaque exercice, l'opérateur vérifie la preuve hors site, consigne l'approbation et confirme la destruction de la cible. Un trimestre sans production conserve le gate de production fermé ; un exercice synthétique de CI ne remplace pas une preuve réelle.

## Rétention et futur GC média

Le futur garbage collector de la story 2.7 doit consulter tous les manifestes finalisés dont la fenêtre de rétention n'est pas expirée. Un objet présent dans au moins un point retenu n'est pas supprimable, même s'il n'est plus référencé par l'état courant de la base. Une absence de hash ou l'impossibilité de lire les manifestes bloque le GC en mode fail-closed.

Les stories média 2.4 et 2.6 étendront l'inventaire aux états et variantes métier sans modifier cette garantie.
