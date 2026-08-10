# Isolation et promotion des environnements

Les cibles `local`, `preview`, `staging` et `production` utilisent chacune un fingerprint public distinct. URLs, clés et credentials sont injectés comme secrets et ne sont jamais stockés dans le dépôt.

Une pull request ne cible que la pile Supabase locale éphémère ou une preview explicitement isolée. Elle ne référence pas l'environnement GitHub `production`, ne reçoit aucun secret de production et ne copie, restaure, journalise ou teste aucune donnée de production.

La promotion suit `local → preview → staging → production`, avec les mêmes migrations forward-only et les mêmes portes CI. Le contrôle de reprise lit `config/recovery-policy.json` et s'exécute en mode fail-closed avant toute promotion production.

Les environnements `local`, `preview` et `staging` acceptent des objectifs de reprise absents afin de ne pas bloquer le développement du MVP. La promotion `production` est refusée tant que toutes les conditions suivantes ne sont pas réunies :

- `rpoMinutes`, `rtoMinutes` et `retentionDays` sont des entiers strictement positifs ;
- `platformBackupMode` vaut explicitement `pitr` ou `daily` ;
- `approvedAt` est une date UTC valide, non future, et `approvedByRole` correspond au rôle attendu par le pipeline protégé ;
- une preuve `passed` du trimestre civil UTC courant correspond à un manifeste intact et à son digest vérifié ;
- les fingerprints de la preuve correspondent aux frontières source et cible attendues ;
- les quatre contrôles DB et les vérifications de hashes, métadonnées et références Storage valent explicitement `true` ;
- PostgreSQL 17 et Supabase CLI `2.101.0` sont attestés dans le manifeste et la preuve ;
- la durée mesurée en millisecondes ne dépasse pas le RTO approuvé ;
- la destination hors site confirme sa rétention et son caractère non réinscriptible.

Les valeurs restent volontairement `null` et non approuvées dans le dépôt. Leur approbation est une décision opérateur injectée par le pipeline protégé, jamais une modification issue d'une pull request ordinaire.

Le pipeline de promotion exécute `scripts/verify-recovery-readiness.mjs` avant d'accéder à l'environnement GitHub `production`. Il reçoit explicitement `APP_ENV`, le chemin du point complet, son digest attendu, la preuve et les fingerprints source/cible ainsi que le rôle approbateur attendu. Un code d'échec stable, une preuve absente ou une erreur de lecture bloque la promotion. Aucun contournement manuel silencieux n'est admis.

Le runbook complet de création, restauration, preuve, nettoyage et reprise des workers est décrit dans [backup-and-restore.md](./backup-and-restore.md).
