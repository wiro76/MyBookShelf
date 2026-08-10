# Revue contradictoire — passage final

**Cible :** `ARCHITECTURE-SPINE.md`  
**Date :** 2026-08-03  
**Verdict :** **PASS**

## Rejeu de la course concurrente

Deux clôtures concurrentes pour un même utilisateur et une même lignée ne peuvent plus recevoir le même rang :

- `reading` possède explicitement `RewardLineage` et `RewardClaim` ;
- `FinishReading` verrouille la légée avant d’allouer le rang ;
- clôture, allocation et outbox sont dans la même transaction ;
- l’unicité par `Reading` bloque le rejeu fonctionnel ;
- l’unicité `(userId, lineageId, rank)` bloque toute collision de rang résiduelle ;
- le consommateur `economy` reste idempotent et ne peut doubler le registre.

Deux features indépendantes conformes doivent donc sérialiser sur le même agrégat et produire des rangs successifs.

## Rejeu de la fusion canonique

La fusion de `Work` ne fragmente plus la continuité des récompenses :

- AD-7 impose la fusion des lignées avant publication du nouveau canon et conserve les sources comme redirections ;
- AD-9 verrouille toutes les lignées sources, somme leurs compteurs, crée/retient une lignée canonique et redirige les anciennes ;
- les montants historiques restent immuables ;
- le rang suivant poursuit le total et ne repart jamais à zéro.

Une lecture arrivant pendant la fusion doit attendre les verrous ou suivre la redirection canonique ; elle ne peut ouvrir une seconde lignée valide sans violer les AD.

## Rejeu des autres jointures

Les conclusions positives du passage précédent restent valides : ownership de `UserWork`, frontière `InventoryItem`/`Placement`, statut exclusif, contrat de messages, préférences média et crédit asynchrone possèdent tous une source de vérité et un protocole compatibles.

## Constats critiques ou hauts

Aucun.

## Conclusion

La tentative de construire deux unités de niveau story/feature respectant tous les AD mais incompatibles n’a plus produit de divergence critique ou haute. La spine passe le reviewer gate contradictoire.
