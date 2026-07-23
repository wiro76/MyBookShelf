# PRD Quality Review — My BookShelf

## Overall verdict

Le PRD est **adequate** pour arrêter la vision et lancer la conception UX, mais il n’est pas encore assez précis pour alimenter directement l’architecture et les stories sans décisions intermédiaires. Sa thèse visuelle, son périmètre personnel et sa boucle Lecture–Pièces–Bibelots tiennent bien ; les principaux risques sont l’ouverture immédiate du Catalogue commun, l’absence de critères de recette sur plusieurs interactions centrales et un modèle de données visuelles encore ambigu.

## Decision-readiness — adequate

Les choix structurants sont généralement formulés comme des décisions : ordinateur et tablette au MVP (§4.6), téléphone reporté (§8.2), Catalogue multi-source (§6.3), distinction Œuvre–Édition–Exemplaire (§3–4.2), récompense cachée et décroissante (§4.5). Les deux questions de §10 sont réellement ouvertes et ne dissimulent pas une réponse déjà choisie.

En revanche, les décisions les plus coûteuses sont énoncées sans rendre leurs contreparties explicites. Un architecte peut comprendre ce qui a été choisi, mais pas toujours ce qui peut être simplifié si le coût dépasse celui d’un projet personnel.

### Findings

- **medium** Les décisions à fort coût ne portent pas leur règle d’arbitrage (§4.2 FR-7, §4.6 FR-24–25, §6.1) — Catalogue commun alimenté immédiatement, parité fonctionnelle tablette et conservation/provenance des images ont des conséquences d’architecture majeures, sans option de repli ni condition de dé-scope. *Fix:* ajouter trois `[NOTE FOR PM]` indiquant pour chaque tension l’alternative minimale acceptable, le coût consenti et le signal qui autorise un report.

## Substance over theater — adequate

La Vision est propre au produit : tranches visibles, rangement spatial persistant et boucle de décoration (§1). Les parcours UJ-1 à UJ-4 déterminent effectivement les FR ; les NFR concernent les risques particuliers du produit plutôt qu’une liste générique. L’addendum étaye honnêtement la différenciation et reconnaît le concurrent le plus proche.

Une capacité du MVP ressemble toutefois davantage à une possibilité ajoutée qu’à un besoin démontré.

### Findings

- **medium** Les suggestions de classement ne sont pas gagnées par la découverte (§4.3 FR-28, §8.1) — aucun parcours, problème utilisateur ou critère de réussite n’exige que le système suggère des Thèmes ou Regroupements ; la capacité introduit pourtant logique de recommandation, données et UX supplémentaires. *Fix:* retirer FR-28 du MVP, ou documenter le problème précis qu’elle résout, la source des suggestions et un critère d’utilité observable.

## Strategic coherence — adequate

Le PRD possède une thèse claire : l’attachement vient d’une bibliothèque visuelle fidèle et stable, enrichie par une gamification douce (§1, addendum « Cadrage concurrentiel »). Le périmètre privilégie logiquement l’expérience de collection et de décoration, et les contre-métriques SM-C1 à SM-C3 protègent cette thèse contre l’optimisation du volume ou du temps passé.

La mesure de réussite ne permet cependant pas encore de décider si la thèse est validée. Seul SM-1 possède un seuil ; les quatre signaux les plus directement liés à l’attachement restent subjectifs et sans protocole.

### Findings

- **high** Les métriques ne rendent pas la thèse falsifiable (§9 SM-2 à SM-5) — « régulièrement », « ne sont pas vécus comme une corvée », « parfois » et « donnent le sentiment » ne définissent ni fréquence, ni méthode de mesure, ni seuil de succès. Atteindre 25 livres peut mesurer un effort d’initialisation sans démontrer l’envie de revenir contempler la Bibliothèque. *Fix:* donner à chaque signal une observation sur 30 jours, par exemple jours actifs hebdomadaires, délai médian d’ajout, nombre de visites sans modification et une note qualitative post-session, avec seuils indicatifs adaptés à Zan.

## Done-ness clarity — thin

Quelques FR ont de bonnes conséquences vérifiables, notamment FR-1, FR-6, FR-7, FR-14 et FR-26. La majorité décrit néanmoins une capacité sans borner son résultat. Cela suffit pour discuter du produit, pas pour découper des stories dont l’acceptation serait stable.

Les exigences qui portent le cœur de l’expérience utilisent précisément les termes qui devront être définis en recette : « position compatible », « propre et lisible », « retour visuel continu », « sans dégradation gênante ». Les règles monétaires ne couvrent pas non plus l’idempotence, alors qu’une double récompense serait un défaut produit important.

### Findings

- **high** Les interactions spatiales n’ont pas de contrat de recette (§4.1 FR-2–4, §4.3 FR-11–15, §4.5 FR-23, §5 NFR-3–4) — l’état « exact », la compatibilité d’une position, le réagencement « propre et lisible » et une dégradation « gênante » sont laissés à l’interprétation. *Fix:* définir des invariants observables : ordre et Étagère restaurés, absence de chevauchement, indicateur de dépôt valide/invalide, comportement quand l’espace manque, annulation atomique, et budget mesurable de réponse sur une collection de 100 Exemplaires.
- **high** Le crédit de Pièces n’est pas défini comme une opération exactement-une-fois (§4.5 FR-19–21, §5 NFR-2) — une resauvegarde, un double clic, une reconnexion ou une requête rejouée pourraient théoriquement recréditer la même Lecture ; NFR-2 ne protège explicitement que le débit d’achat. *Fix:* identifier chaque Lecture récompensée, interdire un second crédit pour la même occurrence et préciser les résultats attendus en cas d’échec ou de reprise de sauvegarde.
- **medium** La qualité minimale d’une Tranche générée bloque encore la recette d’un invariant central (§4.2 FR-10, §10 question 1) — titre et traitement issu de la Couverture ne suffisent pas à déterminer lisibilité, dimensions, orientation, contraste ou comportement avec un titre long. *Fix:* convertir la question ouverte en critères minimaux de génération et laisser à l’UX seulement le choix esthétique entre variantes conformes.

## Scope honesty — adequate

Les non-objectifs et le report post-MVP sont explicites (§7–8), notamment pour le social, le téléphone compagnon, les promotions et l’import avancé. Le PRD reconnaît aussi ses deux questions encore ouvertes et distingue UJ-5 comme extension. Cette franchise est adaptée à un projet personnel.

Une contradiction de périmètre subsiste autour du Catalogue : le MVP crée déjà un actif partagé entre futurs utilisateurs tout en reportant les mécanismes qui le rendent exploitable comme actif commun.

### Findings

- **high** Le Catalogue commun introduit un périmètre communautaire sans ses garde-fous (§4.2 FR-7, §6.1, §8.2) — toute création manuelle rejoint immédiatement le Catalogue commun, tandis que détection des doublons, signalement, modération et « enrichissement communautaire » sont reportés. Même avec un seul utilisateur initial, ce choix façonne identité des données, droits sur les images, fusion et suppression. *Fix:* borner le MVP à des entrées communes mais privées/non publiées, ou inclure dès maintenant un minimum explicite de provenance, dédoublonnage, statut de validation, correction et retrait ; aligner ensuite §8.2.

## Downstream usability — thin

Le document est bien structuré, les UJ ont tous un protagoniste nommé et les termes principaux sont réunis dans un Glossaire. Les équipes UX peuvent extraire les parcours et les groupes de capacités. Pour l’architecture et les stories, le modèle normatif n’est cependant pas encore assez cohérent, particulièrement sur les visuels et le Catalogue.

La numérotation reste unique et complète de FR-1 à FR-28, mais son ordre éditorial et une référence de métrique compliquent l’extraction automatique.

### Findings

- **high** La propriété des Couvertures et Tranches est ambiguë dans le modèle normatif (§3, §4.2 FR-7 à FR-10 et FR-27, §6.1) — l’Édition « a » une Couverture et une Tranche, l’Exemplaire possède ses choix visuels, la Couverture peut représenter « une Œuvre ou un Exemplaire », et une image créée manuellement rejoint potentiellement le Catalogue commun. On ne peut pas déduire quelles ressources sont communes, lesquelles sont privées, ni ce qu’un choix utilisateur modifie. *Fix:* définir séparément Ressource visuelle commune, association à une Édition et sélection personnelle d’un Exemplaire ; préciser visibilité, provenance, remplacement et suppression pour chacune.
- **medium** La traçabilité FR/SM n’est pas fiable pour extraction (§4.2, §4.3, §9 SM-1) — FR-26 et FR-27 apparaissent avant FR-10/11, FR-28 après FR-15, et « FR-5 à FR-15 » omet ces trois exigences tout en prétendant couvrir le groupe fonctionnel. *Fix:* renuméroter les FR dans l’ordre ou adopter des IDs par domaine, puis remplacer les plages par des listes explicites de FR réellement validées par chaque SM.

## Shape fit — strong

La forme convient au produit et à sa destination. My BookShelf est un produit grand public à interaction spatiale significative : les UJ sont donc nécessaires, et quatre parcours MVP plus une extension clairement étiquetée ne constituent pas de la surformalisation. Le niveau de détail est raisonnable pour un projet personnel tout en préparant UX, architecture et stories ; les lacunes portent sur la précision de certains contrats, pas sur une mauvaise forme documentaire.

### Findings

Aucun constat substantiel.

## Mechanical notes

- **low** Glossaire — `Série` est employé comme terme de domaine capitalisé dans UJ-4, FR-7, FR-13 et l’addendum, mais n’est pas défini. Le mot générique « livre » reste parfois utilisé là où Œuvre ou Exemplaire est nécessaire, notamment SM-1. Ajouter `Série` et normaliser les occurrences ambiguës.
- **low** Assumptions Index — une seule hypothèse inline existe, dans FR-21, et aucun index des hypothèses n’est présent. Ajouter un index qui reprend exactement cette hypothèse, ou convertir l’arrondi en décision confirmée si elle ne constitue plus une hypothèse.
- IDs — UJ-1 à UJ-5, FR-1 à FR-28, SM-1 à SM-5 et SM-C1 à SM-C3 sont uniques et sans trou numérique. L’ordre des FR n’est pas continu dans le document, comme relevé ci-dessus.
- Cross-références — toutes les références UJ explicites résolvent. La plage FR-5 à FR-15 de SM-1 est syntaxiquement résolue mais sémantiquement incomplète ; aucune autre référence cassée n’a été trouvée.
- Protagonistes — chaque UJ nomme Zan et porte son contexte dans le parcours. UJ-5 est correctement marqué post-MVP, mais pourrait être déplacé en annexe pour éviter son extraction accidentelle dans les stories MVP.
- Sections — Vision, cible, parcours, Glossaire, FR, NFR, contraintes, non-objectifs, périmètre, critères de réussite et questions ouvertes sont présents. Pour les enjeux convenus, il ne manque pas de section structurante ; les compléments requis sont des contrats et décisions à l’intérieur de ces sections.
