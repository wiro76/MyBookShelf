---
name: 'My BookShelf'
type: architecture-spine
purpose: build-substrate
altitude: feature
paradigm: 'monolithe modulaire hexagonal'
scope: 'MVP web, données, intégrations, médias, économie et exploitation'
status: final
created: '2026-07-27'
updated: '2026-08-03'
binds: ['PRD MVP', 'addendum PRD', 'DESIGN', 'EXPERIENCE']
sources:
  - '../../prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md'
  - '../../prds/prd-Bibiliothéque virtuelle-2026-07-24/addendum.md'
companions: []
---

# Architecture Spine — My BookShelf

## Paradigme

**Monolithe modulaire hexagonal.** Chaque module possède son domaine et ses cas d’usage. Les dépendances pointent vers l’intérieur ; interface web, PostgreSQL, stockage, fournisseurs et workers sont des adaptateurs. Un module ne lit ni n’écrit les tables privées d’un autre : il appelle son API applicative ou consomme une projection publiée.

~~~mermaid
flowchart LR
  UI["Interface Next.js"] --> APP["Cas d'usage"]
  WORKERS["Workers"] --> APP
  APP --> DOM["Domaines"]
  ADAPTERS["PostgreSQL · Auth · Storage · Fournisseurs"] --> APP
~~~

## Invariants et règles

### AD-1 — Frontières et ownership [ADOPTED]

- **Binds:** tout le MVP.
- **Prevents:** couplage inter-domaines et propriété ambiguë des données.
- **Rule:** ownership exclusif : identity possède User/Session ; catalog Work/Edition/SourceClaim ; reading UserWork/Reading/RewardLineage/RewardClaim ; library Copy/Module/Shelf/Placement/Group/Theme/ColorMarkerDefinition/LibraryViewState ; media MediaAsset/Variant ; economy Wallet/LedgerEntry/RewardEntitlement/Product/Purchase/InventoryItem. Un module ne référence un objet externe que par identifiant et le valide via son port propriétaire. Un orchestrateur applicatif peut composer plusieurs ports dans une même unité de travail PostgreSQL, sans accès direct à leurs tables. Les effets différés utilisent {messageId, eventType, producer, aggregateId, aggregateVersion, payloadVersion, occurredAt, payload}, livraison au moins une fois, ordre par agrégat et consommateurs idempotents ; aucun ordre global. Aucune distribution en services séparés au MVP.

### AD-2 — Fondation web [ADOPTED]

- **Binds:** interface ordinateur/tablette, routes web et API.
- **Prevents:** assemblages greenfield incompatibles et divergence client/serveur.
- **Rule:** partir du starter officiel create-next-app avec App Router, TypeScript strict, Tailwind, ESLint, Turbopack, alias @/* et option --src-dir ; Next.js/React s’exécutent sur Node.js LTS dans Vercel. Les Server Components lisent, les Server Actions/Route Handlers adaptent les commandes vers les cas d’usage ; aucune règle métier dans les composants.

### AD-3 — Plateforme de données [ADOPTED]

- **Binds:** persistance, identité, fichiers, asynchronisme et sauvegardes.
- **Prevents:** logique dispersée dans le navigateur et contournement transactionnel.
- **Rule:** Supabase managé fournit PostgreSQL 17, Auth, Storage et Queues/Cron. Les adaptateurs repository utilisent node-postgres et du SQL paramétré explicite ; un client unique emprunté au Pool porte toute l’unité de travail et ses ports. Toute mutation métier passe par un cas d’usage serveur et une transaction PostgreSQL ; le navigateur n’écrit jamais directement les tables. RLS répète l’isolation comme défense en profondeur.

### AD-4 — Modèle bibliographique et de lecture [ADOPTED]

- **Binds:** catalogue personnel, fiche, envies, lectures, relectures et récompenses.
- **Prevents:** historique dupliqué, édition ambiguë et statuts contradictoires.
- **Rule:** Work et Edition sont communs ; chaque Copy personnel référence une Edition, provisoire si nécessaire. Tout nouveau Copy reste « À ranger », sauf si la même commande fournit et valide un Placement. UserWork conserve intention et historique même sans exemplaire. Toute Reading appartient à UserWork, peut cibler un Copy, et fige édition et pagination. La projection mutuellement exclusive suit cette priorité : Reading ouverte = « En cours » ; sinon intention explicite = « À lire » ; sinon historique terminé = « Terminés ». Une relecture réserve le placement Terminés, le restaure s’il existe encore, sinon projette le Copy dans « À ranger ». Retirer le dernier Copy conserve UserWork par défaut ; une purge distincte et confirmée retire notes, commentaires, statuts et détails de lecture, mais conserve un tombstone userId+workId avec dernier rang récompensé. Toute future lecture poursuit ce rang, jamais zéro.

### AD-5 — Rangement atomique [ADOPTED]

- **Binds:** modules, étagères, exemplaires, bibelots, groupes, déplacements et annulation.
- **Prevents:** positions concurrentes, mouvements partiels, capacité dépassée et undo destructif.
- **Rule:** Module, Shelf et Placement ont des identifiants stables, clés d’ordre et versions. Un Placement actif ou réservé relie une étagère à un Copy ou InventoryItem, avec rang lexicographique et largeur canonique. Group ordonne ses membres sans posséder de slot ; Theme, ColorMarkerDefinition et leurs affectations many-to-many restent indépendants du placement. Le dernier module plein crée atomiquement exactement un suivant ; les modules intermédiaires vides persistent et seuls les terminaux vides sont supprimables, sans renumérotation. La capacité est géométrique et extensible, jamais une limite de collection. Une commande verrouille dans l’ordre des identifiants, vérifie existence, ownership et disponibilité de toutes ses cibles, puis applique tout ou rien ; sinon conflit explicite, restauration du dernier état confirmé et « À ranger » seulement si aucun Placement confirmé valide ne subsiste. L’annulation est une commande inverse soumise aux versions attendues. La recherche personnelle est une projection reconstruisible distincte du catalogue et retourne le Placement stable sans le modifier ; LibraryViewState conserve module, étagère et position de reprise sans devenir autorité du rangement.

### AD-6 — Commandes, concurrence et hors-ligne [ADOPTED]

- **Binds:** autosauvegarde, multi-appareils, reprise réseau et économie.
- **Prevents:** dernier arrivé gagne, double exécution et faux succès hors ligne.
- **Rule:** toute mutation utilise une enveloppe {commandId, commandType, actorId, aggregateIds, expectedVersions, payload, occurredAt}. La transaction écrit mutation et reçu idempotent ; seul ce reçu autorise l’état « Enregistré ». Realtime invalide les lectures seulement. IndexedDB peut garder une intention explicitement non enregistrée et la rejouer avec le même commandId ; une version divergente produit un conflit local/distant explicite. Sur conflit, restaurer la dernière projection confirmée, conserver l’intention, recharger et proposer Réessayer ; « À ranger » n’est produit que si l’état confirmé n’a plus de Placement valide. Crédit et achat exigent un reçu en ligne.

### AD-7 — Canon bibliographique et provenance [ADOPTED]

- **Binds:** recherche, ajout manuel, enrichissement et contributions communes.
- **Prevents:** dépendance à un fournisseur, fusion irréversible et perte de provenance.
- **Rule:** le catalogue canonique local est enrichi à la demande : Google Books principal, Open Library complémentaire, BnF enrichissement français ; Amazon est exclu. Ces adaptateurs ne produisent que des candidats normalisés et leur panne ne bloque jamais l’ajout manuel. Notice et valeur retenue gardent fournisseur, identifiant, empreinte, date, droits et provenance. ISBN normalisé identique fusionne une Edition ; un identifiant source déjà lié la résout ; la similarité seule propose un rapprochement réversible. Fusionner des Work conserve les sources comme redirections et orchestre la fusion de leurs lignées de lecture/récompense avant publication du canon. Une création manuelle écrit atomiquement une contribution commune révisionnée Work/Edition (titre et couverture requis) puis le Copy privé. Toute suggestion reste sans effet avant commande explicite.

### AD-8 — Ressources visuelles [ADOPTED]

- **Binds:** couvertures, tranches, imports personnels et diffusion.
- **Prevents:** fuite d’originaux, URL externe autoritative et rendu non reproductible.
- **Rule:** les métadonnées sont en PostgreSQL et les fichiers immuables, adressés par SHA-256, dans Storage. Leur cycle est quarantined > private/published > revoked ; révoquer détache les références, et un GC asynchrone ne supprime l’objet qu’après disparition de toute référence et expiration de la rétention de sauvegarde. Un actif commun ne disparaît jamais en cascade avec un choix personnel. Quarantaine, originaux et personnels sont privés ; un dérivé commun n’est public que si ses droits sont connus. UserWork porte une couverture préférée nullable et Copy une tranche préférée nullable, chacune commune ou personnelle. Accepter JPEG/PNG/WebP/AVIF, au plus 20 Mio et 40 MP, valider les octets et supprimer EXIF. Sharp produit les variantes en worker. La tranche de secours est une recette versionnée, déterministe et idempotente ; attente ou échec affiche un placeholder accessible.

### AD-9 — Économie explicable [ADOPTED]

- **Binds:** récompenses, portefeuille, boutique, inventaire et reçus.
- **Prevents:** double crédit/débit, solde inexplicable et quantité non positionnable.
- **Rule:** finir une Reading verrouille sa RewardLineage reading-owned, alloue atomiquement le rang suivant, puis écrit clôture et RewardClaim unique comme message d’outbox dans la même transaction ; contrainte unique sur Reading et sur (userId, lineageId, rank). L’interface affiche « crédit en attente » jusqu’au reçu economy. Le consommateur idempotent crée atomiquement RewardEntitlement, crédit de registre et nouveau solde ; un retry ne double rien. Une première lecture rapporte min(100, max(5, round(pages/10))) pièces, ou 20 sans pagination ; chaque relecture divise le montant précédent par deux, arrondi inférieur, jusqu’à zéro. RewardClaim et RewardEntitlement figent formulaVersion, pagination, rang et montant. Lors d’une fusion de Work, verrouiller les RewardLineage sources, sommer leurs compteurs dans une lignée canonique et rediriger les sources ; les montants historiques restent immuables et le prochain rang poursuit le total. Un achat verrouille portefeuille et produit, puis écrit débit, achat, reçu et InventoryItem identifiés atomiquement. Les produits uniques refusent le doublon ; les multiples créent des unités distinctes. Les produits sont uniquement cosmétiques et n’accordent jamais capacité, place ou fonction. Toute correction est compensatoire.

### AD-10 — Confidentialité et autorisation [ADOPTED]

- **Binds:** identité et toute donnée personnelle.
- **Prevents:** fuite inter-utilisateurs, secret client et contournement du domaine.
- **Rule:** Supabase Auth identifie ; Next.js reste l’unique façade des données privées. Chaque commande vérifie session et ownership, puis RLS répète l’isolation. La bibliothèque est mono-propriétaire au MVP. Caches privés indexés par utilisateur+version et jamais publics ; médias personnels par URL signée ; clé de service côté serveur seulement. Audit expurgé ; retour d’authentification limité à un chemin relatif autorisé. Après expiration, reprendre un contexte non sensible validé côté serveur, sans donnée privée dans l’URL.

### AD-11 — Interface accessible et performante [ADOPTED]

- **Binds:** bibliothèque visuelle, clavier, tactile, animation et budgets UX.
- **Prevents:** interface graphique parallèle inaccessible, focus perdu et logique de drag divergente.
- **Rule:** le DOM sémantique est l’autorité, jamais Canvas. LibraryViewport est une projection reconstruisible fenêtrée par module : visibles et voisins chargés, cible focalisée ou opérationnelle jamais démontée. La hiérarchie clavier est statut > module > étagère > exemplaire : un arrêt Tab par module, flèches dans l’étagère, Haut/Bas entre étagères, Home/End, Page précédente/suivante entre modules ; toute région défilante est nommée et focalisable, le scroll natif précède l’appui maintenu. La largeur logique de module est 560 px sans compression ; DOM/CSS suit l’ordre canonique et le reflow pur, testé sans chevauchement et préservant l’ordre relatif, reste local à l’étagère. Souris, tactile et clavier adaptent la même commande. WCAG 2.2 AA est le plancher : cibles 44 px pointeur/48 px tactile, zoom 200 %, reflow à 400 %/320 CSS px, focus visible 3:1 à deux tons plus accent, régions live, dialogue avec restitution du focus, erreurs liées aux champs, aucune information par couleur seule ni geste obligatoire. Changements de thème/meuble sont des projections cosmétiques sans mutation des Placements. Feedback <100 ms et stabilisation <500 ms sur 100 exemplaires. États Sauvegarde/Enregistré/erreur sont textuels et annoncés sans cascade. Les tokens viennent de DESIGN et le mouvement exige accord du système et de la préférence utilisateur.

### AD-12 — Livraison et exploitation [ADOPTED]

- **Binds:** environnements, schéma, CI, traitements, supervision et restauration.
- **Prevents:** dérive de schéma, fuite inter-environnements, tâche perdue et sauvegarde incomplète.
- **Rule:** isoler local, preview par PR, staging persistant et production sur Vercel+Supabase ; aucune donnée production hors production. supabase/migrations est l’unique historique SQL et suit expand–migrate–contract. Publier les jobs pgmq avec la transaction métier ; Supabase Cron déclenche des Route Handlers Node Vercel protégés, proches de la base, qui consomment des lots bornés sous maxDuration, visibilité, retries, DLQ et idempotence. CI bloque sur statique, types, unités, intégrations, RLS, migrations, atomicité, Playwright, accessibilité et budgets de performance. Logs JSON, OpenTelemetry et @sentry/nextjs partagent des correlation IDs et excluent les PII. La plateforme possède le runbook de reprise : PITR si disponible, sinon sauvegarde quotidienne, plus export logique et copie Storage hors site. Chaque point de sauvegarde porte un manifeste des hashes Storage référencés ; le GC les retient pendant la fenêtre de sauvegarde. Le test trimestriel restaure base+objets, vérifie toutes les références et conserve la preuve.

## Conventions de cohérence

| Sujet | Convention |
| --- | --- |
| Langue et nommage | Code, schéma et contrats en anglais ; interface et textes utilisateur en français. Modules en minuscules ; types/entités PascalCase ; commandes impératives et événements au passé. |
| Identifiants | UUIDv7 générés par l’application ; aucun identifiant fournisseur utilisé comme clé primaire. |
| Temps et formats | Instants UTC timestamptz ; dates de lecture civiles en date ; pièces entières ; ISBN normalisé avec forme source conservée. |
| Contrats | Entrées validées aux frontières ; commandes, messages et projections versionnés. Erreurs stables {code, message, fieldErrors?, conflict?}; aucun texte fournisseur ne traverse l’adaptateur. |
| Transactions | Une commande = un cas d’usage = une transaction. Tout effet externe part d’une file/outbox durable créée dans cette transaction. |
| Configuration | Validation au démarrage ; secrets uniquement dans les magasins Vercel/Supabase ; aucun fallback secret ni configuration production dans le dépôt. |
| Observabilité | requestId, commandId, actorId pseudonymisé et jobId propagés ; journaux sans email, titre personnel, contenu importé ni URL signée. |

## Stack de départ

| Nom | Version vérifiée le 2026-08-03 |
| --- | --- |
| Node.js | 24.18.0 LTS |
| Next.js | 16.2.12 Active LTS |
| React | 19.2.8 |
| TypeScript | 7.0.2, mode strict |
| PostgreSQL Supabase | 17 |
| @supabase/supabase-js | 2.110.8 |
| pg (node-postgres) | 8.22.0 |
| Sharp | 0.35.3 |
| @sentry/nextjs | 10.68.0 |

Les versions transitives et outils de test sont ceux du starter au premier scaffold, puis deviennent propriété du code et de son lockfile.

## Graine structurelle

~~~text
src/
  app/                         # composition web seulement
  modules/
    identity/{domain,application,adapters}/
    library/{domain,application,adapters}/
    reading/{domain,application,adapters}/
    catalog/{domain,application,adapters}/
    media/{domain,application,adapters}/
    economy/{domain,application,adapters}/
  shared/{kernel,observability}/
  workers/
supabase/
  migrations/
tests/{integration,e2e}/
~~~

~~~mermaid
flowchart TB
  Browser["Navigateur"] --> Vercel["Next.js sur Vercel"]
  Vercel --> Auth["Supabase Auth"]
  Vercel --> PG["PostgreSQL 17 + RLS"]
  Vercel --> Storage["Supabase Storage"]
  Vercel --> Queue["pgmq"]
  Queue --> Workers["Route Handlers Node Vercel bornés"]
  Workers --> PG
  Workers --> Storage
  Workers --> Providers["Google Books · Open Library · BnF"]
  Vercel --> Telemetry["OpenTelemetry · Sentry"]
  Workers --> Telemetry
~~~

## Carte capacité → architecture

| Capacité | Propriétaire | Gouvernée par |
| --- | --- | --- |
| Connexion, session, confidentialité | identity | AD-3, AD-10 |
| Bibliothèque, étagères, groupes, placements | library | AD-5, AD-6, AD-11 |
| Thèmes, repères colorés, recherche et suggestions personnelles | library | AD-5, AD-7, AD-11 |
| Envies, lectures, relectures, historique | reading | AD-4, AD-6 |
| Œuvres, éditions, recherche et provenance | catalog | AD-4, AD-7 |
| Couvertures, tranches et imports | media | AD-7, AD-8 |
| Pièces, récompenses, achats et inventaire | economy | AD-9, AD-10 |
| Livraison, files, supervision et reprise | composition/plateforme | AD-12 |
| Expérience visuelle et accessibilité | app + projections des modules | AD-11, DESIGN, EXPERIENCE |

## Différé

- Application mobile compagnon et synchronisation dédiée : revisiter après validation du MVP web.
- Partage, fonctions sociales, multi-propriétaire et modération : revisiter avec leurs exigences produit et de confidentialité.
- Rapprochement bibliographique automatique au-delà des identifiants exacts : rester en proposition réversible jusqu’à disposer d’un corpus mesuré.
- Génération visuelle non déterministe/IA : exclue du chemin canonique ; revisiter avec politique de droits, coût et modération.
- Extraction en services séparés : seulement si mesures de charge ou autonomie d’équipe montrent une frontière stable.
- Bibliothèque de composants et outils de test précis : choisir au scaffold selon les contrats ci-dessus ; le lockfile devient l’autorité.
- Objectifs chiffrés RPO/RTO et durée de rétention : fixer avant production selon le niveau Supabase retenu et tester par restauration.
