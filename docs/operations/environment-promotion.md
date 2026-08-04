# Isolation et promotion des environnements

Les cibles `local`, `preview`, `staging` et `production` utilisent chacune un fingerprint public distinct. URLs, clés et credentials sont injectés comme secrets et ne sont jamais stockés dans le dépôt.

Une pull request ne cible que la pile Supabase locale éphémère ou une preview explicitement isolée. Elle ne référence pas l'environnement GitHub `production`, ne reçoit aucun secret de production et ne copie, restaure, journalise ou teste aucune donnée de production.

La promotion suit `local → preview → staging → production`, avec les mêmes migrations forward-only et les mêmes portes CI. Avant la première production, les objectifs RPO, RTO, la durée de rétention et une preuve de restauration doivent être approuvés. Leur valeur reste à définir et ne bloque pas le développement du MVP.
