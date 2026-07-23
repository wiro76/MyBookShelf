# Revue éditoriale structurelle — My BookShelf

## Document 1 — PRD

## Document Summary

- **Purpose:** spécification produit de référence destinée à guider la conception UX, l’architecture et le découpage en stories.
- **Audience:** Zan-missel et les workflows downstream chargés de la conception et de la réalisation.
- **Reader type:** humans ; les aides à la compréhension, exemples de parcours et résumés de périmètre doivent être préservés lorsqu’ils accélèrent l’orientation.
- **Structure model:** Strategic/Context (Pyramid), avec une section de référence fonctionnelle destinée à la consultation non linéaire.
- **Current length:** environ 3 444 mots répartis sur 11 sections principales.
- **Core question:** quelles capacités, qualités, limites et mesures définissent le MVP de My BookShelf ?
- **Existence statement:** ce document existe pour aider Zan-missel et les workflows downstream à concevoir et réaliser le même MVP sans réinterpréter l’intention produit.

### Structural map

| Section | Mots approx. | Sert directement le but ? | Observation |
|---|---:|---|---|
| 0. Objet du document | 68 | Oui | Orientation utile, mais plus longue que nécessaire. |
| 1. Vision | 124 | Oui | Bonne ouverture, boucle centrale immédiatement visible. |
| 2. Utilisateur cible | 482 | Oui | Les besoins et parcours donnent le contexte humain ; les non-utilisateurs recoupent les non-objectifs. |
| 3. Glossaire | 268 | Oui | Référence indispensable, mais plusieurs termes normatifs sont employés avant leur définition. |
| 4. Fonctionnalités et exigences fonctionnelles | 1 429 | Oui, central | Bonne organisation par capacités ; FR-29 est placé hors de son domaine naturel et les identifiants ne suivent plus l’ordre de lecture. |
| 5. Exigences non fonctionnelles | 245 | Oui, central | Dense et facilement consultable. |
| 6. Contraintes et garde-fous | 276 | Oui | Bonne séparation des contraintes visuelles, économiques et externes. |
| 7. Non-objectifs | 81 | Oui | Utile, mais doublonne partiellement les non-utilisateurs et le périmètre reporté. |
| 8. Périmètre du MVP | 189 | Oui, critique | Information structurante enterrée après les exigences et largement récapitulative. |
| 9. Critères de réussite | 192 | Oui, critique | Mesures solides mais trop tardives dans un document en pyramide. |
| 10. Questions ouvertes | 22 | Faiblement | Ne contient aucune question et ne justifie plus une section autonome. |

### Flow analysis

La lecture actuelle suit une progression compréhensible — vision, utilisateur, vocabulaire, exigences — mais ne respecte pas entièrement le modèle pyramidal attendu d’un PRD. Le lecteur doit parcourir environ 2 900 mots avant de rencontrer le périmètre explicite et les critères qui permettront de juger le MVP. Pour Zan-missel, ce délai reste tolérable ; pour les workflows downstream, il augmente le risque de lire une exigence sans savoir immédiatement si elle constitue une priorité de portée ou un simple détail de capacité.

Les parcours UJ-1 à UJ-4 forment une bonne transition entre vision et exigences. UJ-5 rompt cependant la concentration sur le MVP puisqu’il décrit une extension téléphone déjà classée comme reportée. Le glossaire est utile, mais le modèle Œuvre–Édition–Exemplaire est nécessaire dès les parcours ; sa définition après ces parcours crée une petite dette de compréhension.

La section fonctionnelle est le bon centre de gravité du document. Sa structure par groupes facilite la consultation. Deux irrégularités gênent néanmoins le balayage : FR-29, consacré au Catalogue, se trouve dans « Organisation et repérage », et les identifiants FR-27, FR-10, FR-26 apparaissent dans un ordre non numérique. Les identifiants annoncés comme stables doivent être normalisés une seule fois avant finalisation ou explicitement conservés comme tels.

Le document offre assez d’espace visuel grâce aux titres, listes et conséquences vérifiables. Les parcours, le glossaire, les critères et les contre-métriques sont de véritables aides de compréhension ; ils ne constituent pas du remplissage.

## Recommendations

### 1. MOVE - Périmètre du MVP et critères de réussite

**Rationale:** placer le périmètre puis les critères immédiatement après la Vision et l’Utilisateur cible donne aux lecteurs le statut, les limites et la définition du succès avant le détail des parcours et exigences.

**Impact:** ~0 mot ; amélioration forte de l’orientation.

**Comprehension note:** le nouvel ordre recommandé est Vision → Utilisateur cible → Périmètre → Critères de réussite → Parcours → Glossaire → Exigences fonctionnelles → NFR → Contraintes.

### 2. MERGE - Non-utilisateurs, Non-objectifs et périmètre reporté

**Rationale:** ces trois zones décrivent largement les mêmes frontières et devraient avoir une source de vérité unique, avec les exclusions produit regroupées sous le périmètre.

**Impact:** économie estimée à ~110 mots.

**Comprehension note:** conserver séparément la phrase signalant les utilisateurs professionnels hors cible seulement si elle sert une décision de conception distincte.

### 3. MOVE - Glossaire de base et FR-29

**Rationale:** définir Œuvre, Édition, Exemplaire, Fiche et Lecture avant leur premier usage évite la lecture rétroactive, tandis que FR-29 appartient au groupe Catalogue plutôt qu’à l’organisation personnelle.

**Impact:** ~0 mot ; amélioration de la cohérence conceptuelle et de la consultation.

**Comprehension note:** le glossaire complet peut rester en référence, mais un mini-modèle de cinq termes placé avant les parcours suffirait à établir le vocabulaire.

### 4. MOVE - UJ-5 hors des parcours clés du MVP

**Rationale:** le parcours téléphone décrit une extension explicitement reportée et détourne momentanément l’attention des quatre parcours que les exigences doivent réellement satisfaire.

**Impact:** ~0 mot au niveau de l’ensemble documentaire ; environ 65 mots déplacés vers l’addendum ou le périmètre reporté.

**Comprehension note:** préserver le parcours dans l’addendum maintient l’intention future sans brouiller la portée actuelle.

### 5. CONDENSE - Objet du document et section Questions ouvertes

**Rationale:** l’objet peut tenir en deux phrases et la section « Questions ouvertes » peut être remplacée par une phrase d’état accompagnant le lien vers l’addendum.

**Impact:** économie estimée à ~40 mots.

### 6. QUESTION - Ordre et stabilité des identifiants FR

**Rationale:** l’ordre FR-9, FR-27, FR-10, FR-26 puis FR-11 nuit au balayage et doit être normalisé avant que les identifiants deviennent des références downstream impossibles à changer.

**Impact:** ~0 mot.

**Comprehension note:** si les IDs sont déjà consommés ailleurs, conserver leur stabilité et ajouter un index compact par domaine ; sinon, renuméroter une seule fois avant le statut final.

### 7. CONDENSE - Descriptions de groupes et répétitions de portée

**Rationale:** les phrases « Réalise UJ-N » et certains résumés de groupe peuvent être resserrés lorsque le lien avec les parcours est déjà évident dans les exigences.

**Impact:** économie estimée à ~45 mots.

**Comprehension note:** ne pas supprimer toutes les descriptions de groupe ; elles fournissent une orientation utile dans la partie la plus longue du document.

### 8. PRESERVE - Parcours MVP, glossaire normatif, conséquences vérifiables et contre-métriques

**Rationale:** ces éléments peuvent sembler redondants avec les FR, mais ils servent respectivement l’intention UX, la précision terminologique, la testabilité et la protection contre de mauvaises optimisations.

**Impact:** 0 mot économisé.

**Comprehension note:** leur suppression réduirait la compréhension et la fiabilité des handoffs.

## Summary

- **Total recommendations:** 8
- **Estimated reduction:** environ 195 mots, soit 5,7 % du PRD
- **Meets length target:** aucun objectif de longueur spécifié
- **Comprehension trade-offs:** aucune aide majeure ne doit être supprimée ; la réduction provient surtout de frontières répétées et de texte d’orientation devenu inutile.

---

## Document 2 — Addendum

## Document Summary

- **Purpose:** conserver les choix UX à tester, les contraintes techniques externes, les preuves concurrentielles et les décisions différées qui ne doivent pas alourdir le PRD.
- **Audience:** Zan-missel et les workflows UX et architecture qui reprendront les sujets différés.
- **Reader type:** humans ; la consultation sera surtout ponctuelle et orientée vers une décision.
- **Structure model:** Strategic/Context (Pyramid), avec des éléments de référence.
- **Current length:** environ 525 mots répartis sur 4 sections principales.
- **Core question:** quelles décisions ou contraintes complémentaires doivent être reprises, par qui et à quel moment ?
- **Existence statement:** ce document existe pour aider Zan-missel et les workflows downstream à retrouver les décisions différées et leur contexte sans encombrer le PRD principal.

### Structural map

| Section | Mots approx. | Sert directement le but ? | Observation |
|---|---:|---|---|
| Options d’interaction UX | 151 | Oui | Détails actionnables pour la conception, bien regroupés. |
| Cadrage concurrentiel | 161 | Partiellement | Justification utile, mais trop haut placée et légèrement longue pour un addendum de reprise. |
| Contraintes des sources du Catalogue | 96 | Oui | Référence compacte et correctement sourcée. |
| Décisions reportées | 92 | Oui, critique | Contient responsables, décisions et conditions de reprise, mais arrive en dernier. |

### Flow analysis

L’addendum commence par des mécanismes UX, enchaîne sur l’analyse concurrentielle, puis n’atteint les décisions différées qu’à la fin. Ce parcours privilégie l’origine des décisions plutôt que la prochaine action du lecteur. Pour une reprise UX ou architecture, l’ordre le plus efficace est : décisions reportées → options UX → contraintes des sources → cadrage concurrentiel.

Les deux décisions reportées utilisent un schéma répétitif et cohérent — responsable, décision, condition — qui se prêterait mieux à un tableau de référence. Le cadrage concurrentiel est pertinent comme justification de la différenciation, mais il peut être condensé sans perdre ses conclusions ni ses sources.

L’espacement, les listes et les liens offrent une bonne lisibilité. Aucun exemple ou résumé essentiel ne manque.

## Recommendations

### 1. MOVE - Décisions reportées en tête de l’addendum

**Rationale:** les décisions à reprendre, leurs responsables et leurs déclencheurs constituent l’information la plus actionnable et doivent précéder leur contexte.

**Impact:** ~0 mot ; amélioration forte du temps d’accès.

### 2. MOVE - Cadrage concurrentiel en fin de document

**Rationale:** l’analyse concurrentielle justifie les choix mais ne pilote pas directement la prochaine décision UX ou architecture.

**Impact:** ~0 mot ; meilleure hiérarchie pyramidale.

### 3. MERGE - Décisions reportées dans un tableau de suivi unique

**Rationale:** un tableau « Sujet / Responsable / Décision attendue / Condition de reprise » rend les deux dossiers comparables et extensibles.

**Impact:** économie estimée à ~20 mots.

**Comprehension note:** le tableau améliore la consultation aléatoire sans supprimer d’information.

### 4. CONDENSE - Cadrage concurrentiel

**Rationale:** trois conclusions suffisent — suivi déjà banalisé, différenciation par la bibliothèque physique, gamification douce — tandis que la liste des concurrents et les sources peuvent rester intactes.

**Impact:** économie estimée à ~55 mots.

### 5. PRESERVE - Options UX et références des sources

**Rationale:** les gestes à tester et les contraintes d’API sont précisément le type de détails qui appartient à l’addendum et qui sera nécessaire aux handoffs.

**Impact:** 0 mot économisé.

**Comprehension note:** retirer ces éléments déplacerait de nouveau l’incertitude vers les workflows downstream.

## Summary

- **Total recommendations:** 5
- **Estimated reduction:** environ 75 mots, soit 14,3 % de l’addendum
- **Meets length target:** aucun objectif de longueur spécifié
- **Comprehension trade-offs:** aucune perte attendue si les conclusions concurrentielles et toutes les références sont conservées.

---

## Synthèse globale

- **Longueur actuelle combinée:** environ 3 969 mots
- **Réduction estimée:** environ 270 mots, soit 6,8 %
- **Ordre cible recommandé:** décision et périmètre d’abord, parcours et exigences ensuite, contraintes puis preuves en dernier
- **Priorités:** remonter périmètre et succès ; fusionner les frontières répétées ; replacer FR-29 ; isoler le parcours téléphone ; ouvrir l’addendum sur les décisions reportées
- **Verdict structurel:** architecture documentaire saine, sans besoin de refonte ; une réorganisation ciblée améliorera nettement la vitesse de lecture et la sécurité des handoffs.
