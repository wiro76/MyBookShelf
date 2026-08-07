---
name: My BookShelf
status: final
sources:
  - ../../prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md
  - ../../prds/prd-Bibiliothéque virtuelle-2026-07-24/addendum.md
updated: 2026-07-27
---

# My BookShelf — Experience Spine

## Foundation

Application web complète sur ordinateur et tablette. Le téléphone compagnon est différé après validation du MVP. `DESIGN.md` est l’autorité visuelle ; ce document régit architecture de l’information, comportements, états, interactions, parcours et accessibilité. Les spines prévalent sur tout aperçu, wireframe ou import.

La métaphore physique est fonctionnelle : un Exemplaire occupe une position stable et se présente d’abord par sa Tranche. Elle ne masque jamais le modèle normatif : l’Œuvre porte l’état « À lire » et le suivi commun ; l’Édition porte les métadonnées et ressources éditoriales ; l’Exemplaire porte position et choix visuels ; chaque Lecture est une occurrence datée « Commencée » ou « Terminée ». Les trois bibliothèques visibles sont des projections spatiales de ces états, pas un nouveau champ de statut porté par l’Exemplaire. Couverture et Tranche sont indépendantes.

Principes :

1. retrouver un lieu stable avant d’administrer une collection ;
2. manipulation directe agréable, commande visible équivalente ;
3. sauvegarde et conséquences toujours perceptibles ;
4. récompense discrète, jamais incitation à lire ;
5. personnalisation cosmétique sans barrière de capacité.

## Information Architecture

| Surface | Accès | Rôle |
|---|---|---|
| Connexion / reprise de session | Ouverture sans session ou session expirée | Authentifier Romane puis restaurer la destination et le contexte demandés |
| Onboarding cosmétique | Première connexion | Choisir structure et finition gratuites, prévisualiser et confirmer |
| Bibliothèque — Terminés | Accueil, `navigation-principale` | Bibliothèque principale, modules, Étagères, À ranger, décoration |
| Bibliothèque — Envie de lire | `navigation-principale` | Exemplaires souhaités, ajoutés à la fin et librement réorganisables |
| Bibliothèque — En cours | `navigation-principale` | Exemplaires actifs et accès au panneau de Lectures |
| Vue Couvertures | Terminés uniquement | Voir de face tous les Exemplaires terminés |
| Panneau Lectures en cours | En cours | Couverture, titre, début, pages lues/total et mise à jour rapide |
| À ranger | Terminés uniquement | File temporaire des Exemplaires terminés sans position choisie |
| Rechercher dans ma bibliothèque | Action globale dédiée | Choisir un Exemplaire puis le localiser sans modifier le rangement |
| Rechercher dans le Catalogue | Action globale distincte | Rechercher une Œuvre, consulter sa Fiche, choisir une Édition et ajouter |
| Ajout manuel | Catalogue sans résultat | Créer une Œuvre avec titre et Couverture minimum, contrôler les doublons |
| Fiche de l’Œuvre | Activation d’un livre ou résultat Catalogue | Métadonnées, Éditions, Exemplaires, visuels, Lectures et données personnelles |
| Groupes et Thèmes | Action de sélection / Fiche | Gérer sélection ponctuelle, groupe durable transversal, Thèmes et repères |
| Boutique | Navigation globale | Catalogue e-commerce de Bibelots et ornements, solde et achats |
| Inventaire d’objets | Bibliothèque / Boutique | Retrouver les objets possédés, placés ou disponibles |
| Personnaliser ma bibliothèque | Navigation / réglages | Modifier style global et thème du chrome sans changer le rangement |
| Réglages | Navigation globale | Système/Clair/Sombre, réduire les animations, compte et préférences |

`navigation-principale` bascule uniquement entre Envie de lire, Terminés et En cours : aucun swipe entre statuts. Dans un statut, `navigateur-de-modules` et le défilement horizontal parcourent les modules ; le défilement vertical parcourt les Étagères du module courant. La dernière position consultée est restaurée à la reconnexion.

Références d’état : [fin de Lecture et À ranger](mockups/key-fin-lecture.html), [Boutique et états d’achat](mockups/key-boutique.html). Elles illustrent les règles ci-dessous ; les spines prévalent en cas de conflit.

### Correspondance entre interface et modèle normatif

| Libellé UI | Autorité normative | Règle de projection |
|---|---|---|
| Envie de lire | Œuvre « À lire » | Aucun exemplaire de l’Œuvre n’a de Lecture active ou terminée retenue pour cette vue. |
| En cours | Lecture « Commencée » | Une Lecture active prend temporairement priorité d’affichage pour l’Exemplaire concerné. Pour une relecture, sa place dans Terminés reste réservée. |
| Terminés | Lecture « Terminée » | En l’absence de Lecture active, au moins une Lecture terminée place l’Exemplaire dans la bibliothèque principale. Une relecture terminée ne supprime jamais les Lectures antérieures ni les Pièces acquises. |

Une action visible qui change de bibliothèque met à jour l’état normatif correspondant et la projection dans une même transaction. Elle ne réécrit ni l’historique des Lectures ni les gains passés. « Commencer une relecture » crée une nouvelle Lecture, affiche temporairement l’Exemplaire dans En cours et réserve sa place dans Terminés. Après sauvegarde de la fin, l’Exemplaire retourne automatiquement à cette place ; la nouvelle Lecture reste distincte et le gain réduit suit le PRD. Si la place réservée n’existe plus, l’Exemplaire rejoint À ranger.

## Voice and Tone

Tutoiement direct, chaleureux et respectueux. Phrases courtes, conséquences concrètes, enthousiasme retenu.

| Faire | Éviter |
|---|---|
| « Ton livre est enregistré. Tu as gagné 24 Pièces. » | « Félicitations !!! Une récompense incroyable ! » |
| « Enregistré » / « Sauvegarde… » | Une coche sans texte |
| « Cet emplacement manque de place. Déplace des livres ou choisis une autre Étagère. » | « Erreur de dépôt » |
| « Retirer cet Exemplaire » | « Supprimer le livre » sans préciser la portée |
| « La Lecture est enregistrée. Le crédit de Pièces est en attente. Réessayer. » | Laisser croire que la Lecture a échoué |

Les termes Œuvre, Édition, Exemplaire, Couverture, Tranche et Lecture sont employés avec leur sens normatif ; l’interface peut expliquer le terme à la première occurrence sans le remplacer.

## Component Patterns

| Composant | Usage | Règles comportementales |
|---|---|---|
| `navigation-principale` | Global | Trois boutons Envie de lire, Terminés, En cours ; l’actif expose `aria-current`. Changement explicite, sans geste obligatoire. |
| `navigateur-de-modules` | Chaque bibliothèque affichée | Précédent/suivant, « Module n sur N », défilement horizontal et focus conservé. Commandes distinctes pour Étagère précédente/suivante. Ne change jamais de bibliothèque. |
| `module-de-bibliotheque` | Bibliothèques | Largeur logique stable ; un module au départ, nouveau module à droite quand le précédent est plein, créé atomiquement. Structure sémantique statut > module > Étagère > Exemplaire. |
| `etagere` | Rangement | Expose positions d’insertion ; prévisualise le réagencement. Un dépôt invalide ne change rien et explique comment libérer de la place. |
| `tranche` | Exemplaire | Activation courte ouvre `fiche-oeuvre`; appui maintenu ouvre `barre-actions-contextuelles`. Alternative visible et clavier identique. |
| `barre-actions-contextuelles` | Tranche/Bibelot | Chaque cible focalisée expose « Actions pour [nom] ». La barre est un popover nommé relié au déclencheur ; focus initial sur la première action, fermeture par Échap/bouton Fermer/action extérieure, puis retour au déclencheur. Livre : déplacer, sélectionner/grouper, retirer. Objet : déplacer, remplacer, retirer. |
| `panneau-a-ranger` | Terminés | Liste persistante ; « Ranger maintenant » lance le choix de position. Quitter ne perd ni Lecture, ni projection dans Terminés, ni Pièces. |
| `vue-couvertures` | Terminés | Montre seulement les Couvertures des Exemplaires terminés ; activation ouvre la même Fiche ; aucun réordonnancement depuis cette vue. |
| `panneau-lectures-en-cours` | En cours | Une ligne par Lecture active ; pages facultatives ; « Enregistrer » explicite. Atteindre le total ne termine jamais la Lecture. |
| `recherche-interne` | Global | Résultats distincts par Exemplaire/Édition avec Couverture et statut. À l’activation, résoudre de nouveau la position courante ; un Exemplaire dans À ranger ouvre et focalise `panneau-a-ranger`. |
| `recherche-catalogue` | Global | Résultat ouvre la Fiche complète d’un candidat normalisé non persisté ; aucun ajout rapide. La provenance reste identifiable et seule l’action d’ajout explicite peut enrichir le canon. Indisponibilité du Catalogue propose l’ajout manuel. |
| `fiche-oeuvre` | Toutes bibliothèques/Catalogue | Sections séparées : Œuvre, Édition, Exemplaire, Couverture/Tranche, Lectures. Les modifications utilisent « Enregistrer ». |
| `selecteur-edition` | Fiche Catalogue/Exemplaire | Choix explicite avant ajout. Corriger l’Édition conserve Exemplaire, position et Lectures ; actualise les métadonnées. Une Couverture ou Tranche personnalisée est conservée sauf action explicite « Revenir aux visuels de l’Édition ». |
| `groupe-durable` | Organisation | Création explicite ; une Série peut être suggérée, jamais appliquée. Groupe transversal ; déplacement collectif limité aux membres placés du statut courant. Les membres À ranger sont exclus et comptés dans l’annonce. |
| `inventaire-objets` | Bibliothèque/Boutique | Tous les achats restent disponibles ; retirer un objet placé le renvoie ici. « Placer » lance le choix d’Étagère et position. |
| `carte-produit` | Boutique | Affiche prix, solde, manque éventuel, possession et multiplicité autorisée. Achat exige confirmation. Si le solde manque, l’action reste focusable avec `aria-disabled` et description ; elle ne déclenche aucun achat. |
| `configurateur-cosmetique` | Onboarding/Réglages | Étapes structure puis finition ; aperçu, retour, confirmation. Changer préserve strictement livres, groupes et Bibelots. |
| `indicateur-sauvegarde` | Global | Autosauvegarde : « Sauvegarde… » puis « Enregistré ». Erreur persistante et action Réessayer ; annonce non intrusive aux aides techniques. |
| `revelation-pieces` | Fin de Lecture | Après sauvegarde réussie seulement : montant et nouveau solde. Animation brève ou instantanée avec réduction des animations. |
| `dialogue-confirmation` | Fin, achat, retrait | Modal nommé et décrit par sa conséquence. Focus initial sur Annuler pour une action destructive ; action primaire spécifique. Après disparition du déclencheur, focus vers le prochain Exemplaire, À ranger, l’inventaire ou le titre de surface. |

## State Patterns

| État | Surfaces | Traitement |
|---|---|---|
| Session absente/expirée | Connexion | Afficher le formulaire sans effacer la destination demandée. Identifiants refusés : erreur reliée au champ. Après succès, restaurer le statut, le module et l’Exemplaire visés s’ils existent encore, sinon la destination valide la plus proche. |
| Chargement initial | Bibliothèques, Catalogue, Boutique | Squelettes respectant la géométrie ; ne pas afficher de faux livres. Restaurer ensuite le dernier contexte. |
| Chargement secondaire | Vue Couvertures, Groupes et Thèmes, Inventaire, Onboarding, Réglages | Squelette ou progression nommé selon la surface ; conserver navigation et action Annuler. |
| Première collection vide | Chaque statut | Un module vide, explication brève et actions séparées vers Catalogue ou ajout manuel. |
| Surface secondaire vide | Vue Couvertures, Groupes, Inventaire | Expliquer ce qui apparaîtra ici et proposer une seule action pertinente ; ne pas afficher un faux contenu décoratif. |
| Module plein | Bibliothèque | Transaction unique « ajouter au dernier emplacement ou créer exactement un module suivant » ; annoncer le nouveau module, sans compression. |
| Module vidé | Bibliothèque | Conserver les modules intermédiaires pour préserver les positions. Supprimer uniquement les modules terminaux vides, sans renuméroter les modules restants pendant la session ; restaurer vers le module existant le plus proche. |
| À ranger vide/occupé | Terminés | Masqué ou résumé si vide ; compteur et action de reprise s’il contient des Exemplaires. |
| Recherche sans résultat | Interne | « Aucun Exemplaire trouvé. » Conserver la requête ; lien distinct vers Catalogue, sans fusionner les outils. |
| Catalogue sans résultat | Catalogue | Proposer ajout manuel ; expliquer les données minimales et les droits sur l’image. |
| Catalogue indisponible | Catalogue | Conserver la requête, proposer Réessayer et ajout manuel ; aucune bibliothèque bloquée. |
| Doublon ISBN | Ajout manuel | Bloquer la création et proposer l’Œuvre existante. |
| Similarité forte | Ajout manuel | Avertir et montrer les correspondances ; permettre « Créer quand même » après examen. |
| ISBN existant, second Exemplaire | Ajout manuel | Ne pas recréer l’Œuvre ou l’Édition ; proposer « Ajouter un autre Exemplaire » de l’Édition existante. |
| Fiche non modifiée/modifiée | Fiche | Bouton Enregistrer désactivé/activé ; quitter avec modifications non sauvegardées demande confirmation. |
| Validation de formulaire | Connexion, Fiche, ajout, progression | Libellé persistant, message adjacent relié au champ, `aria-invalid` et correction concrète. Une erreur : focus sur le champ ; plusieurs : résumé focalisé avec liens vers les champs. Conserver toutes les saisies. |
| Sauvegarde automatique | Rangement/personnalisation | Optimiste avec « Sauvegarde… » ; confirmer « Enregistré ». |
| Échec de sauvegarde | Toute mutation | Restaurer l’état précédent, conserver l’intention si possible, message et Réessayer ; jamais de réorganisation partielle. |
| Hors ligne | Global | Navigation et lecture des données en cache si disponibles ; mutations non garanties clairement signalées, jamais présentées comme enregistrées. À la reconnexion, une divergence de version ouvre un choix explicite entre rangement local et distant avec aperçu des conséquences. |
| Dépôt valide | Étagère | Position d’insertion, prévisualisation du reflow et annonce de destination. |
| Dépôt invalide | Étagère | Rouge + symbole + texte ; dépôt refusé, état précédent intact. |
| Sélection | Bibliothèque | Nombre sélectionné et actions visibles ; focus et état annoncé. |
| Localisation | Bibliothèque | Aller au bon statut/module/Étagère, focus sur la Tranche, contour + mouvement bref + annonce textuelle ; ordre inchangé. |
| Lecture à pages totales | En cours | Progression enregistrable ; aucune fin automatique, aucun gain. |
| Fin de Lecture enregistrée | Fiche/Terminés | Crédit idempotent, `revelation-pieces`, Exemplaire déplacé dans À ranger. |
| Crédit en attente | Fin de Lecture | Lecture et statut restent enregistrés ; montant stable non doublable, message et reprise du crédit. |
| Achat en cours/réussi | Boutique | Action verrouillée contre double soumission ; débit et possession confirmés atomiquement. |
| Achat à réponse inconnue | Boutique | Réinterroger le reçu avec la même clé d’idempotence avant d’affirmer échec ou succès ; afficher « Vérification de l’achat… ». |
| Achat échoué | Boutique | Aucun débit confirmé, objet non acquis, message et Réessayer. Le serveur revérifie le solde à la confirmation et retourne le manque courant. |
| Objet possédé/placé | Inventaire | État textuel ; retirer d’une Étagère rend Disponible sans supprimer l’achat. |
| Solde insuffisant | Boutique | Prix et manque indiqués ; achat indisponible sans culpabilisation. |
| Permission refusée | Bibliothèque privée/image | Surface privée inaccessible ; import refusé explique le droit requis et permet de choisir un autre fichier. |
| Focus clavier | Toutes | Ordre logique, focus toujours visible et non masqué par les barres flottantes. |

## Interaction Primitives

### Manipuler un Exemplaire ou un Bibelot

- Souris et tactile partagent le raccourci d’appui maintenu sur la cible pour ouvrir `barre-actions-contextuelles`.
- Un déplacement direct montre l’objet saisi, la destination et le reflow prévu ; il ne valide qu’au dépôt compatible.
- Pour un module hors écran, une zone de bord déclenche la navigation de module après délai ; la commande « Déplacer » reste l’alternative recommandée pour une destination éloignée.
- La commande visible « Déplacer » ouvre un parcours sans glisser-déposer : choisir statut si pertinent, module, Étagère, position, puis confirmer.
- Clavier : atteindre la Tranche, `Entrée` ouvre la Fiche ; touche Menu ou commande « Actions » ouvre la barre ; « Déplacer » utilise des listes de destination et des boutons Monter/Descendre/Avant/Après.
- Aucun comportement nécessaire ne dépend du survol ou du clic droit.

### Sélection et groupes

L’action « Sélection multiple » démarre depuis la barre ; clic/toucher/Space ajoute ou retire ensuite des Exemplaires. Le bandeau expose le compte, Déplacer, Créer un groupe durable, Ajouter un Thème et Annuler. Un groupe durable peut traverser les trois statuts ; le déplacement ne prend que ses membres placés dans le statut actif et annonce les membres exclus. Avant validation, réinterroger chaque identifiant et sa version ; toute divergence annule l’opération entière. Retirer un Exemplaire le détache de ses groupes et supprime un groupe devenu vide.

### Navigation spatiale

Le menu supérieur change de statut. Le défilement vertical reste dans le module ; le défilement horizontal change de module. Des boutons précédent/suivant offrent l’équivalent du geste. Le viewport est un composant composite : un arrêt Tab entre dans chaque module, les flèches parcourent les Exemplaires d’une Étagère, Haut/Bas changent d’Étagère, Home/End atteignent les extrémités et Page précédente/suivante change de module. Tab ressort vers le chrome. L’ordre DOM suit statut > module > Étagère > Exemplaire, y compris lorsque deux modules sont visibles. Toute cible focalisée est amenée dans la vue sans animation obligatoire.

Un geste commencé sur une Tranche n’est réservé à l’objet qu’après dépassement du délai d’appui maintenu sans mouvement. Avant ce seuil, le scroll natif reste prioritaire ; une rangée entièrement occupée n’emprisonne donc jamais le défilement.

### Réagencement autour d’un Bibelot

Choisir un objet dans `inventaire-objets`, puis une Étagère et une position. Le reflow reste limité à l’Étagère cible ; il ne pousse jamais implicitement des livres sur une autre Étagère. Si l’espace total suffit, les Exemplaires se déplacent automatiquement en préservant leur ordre relatif. Sinon, la prévisualisation devient invalide et la confirmation est impossible. Remplacer conserve la position si le nouvel objet tient ; sinon, demander une nouvelle destination. Annuler restaure l’objet original et sa position.

## Accessibility Floor

Minimum WCAG 2.2 AA sur ordinateur et tablette.

- Toute interaction est réalisable clavier seul et sans glisser-déposer ; aucun besoin ne dépend du survol, du clic droit, de l’appui maintenu ou de la couleur.
- Cibles : `{spacing.pointer-target}` minimum au pointeur et `{spacing.touch-target}` au tactile, avec espacement empêchant les activations accidentelles.
- Focus visible à contraste 3:1, non masqué, ordre cohérent avec la lecture. Sur une Tranche ou image arbitraire, utiliser l’indicateur à deux tons `{colors.focus-light}` + `{colors.focus-dark-contrast}` défini dans `DESIGN.md`, complété par `{colors.focus}`. Après localisation, déplacement de statut ou fermeture d’un dialogue, le focus va à la destination logique.
- Lecteur d’écran : une Tranche expose titre, volume, Édition, statut, position « Étagère x, module y » et état sélectionné ; les images décoratives sont masquées.
- Les changements de sauvegarde, de solde, de module, de sélection et de dépôt sont annoncés via région live polie ; erreurs et confirmations critiques utilisent une annonce immédiate sans répétition.
- Le reflow ne doit pas déclencher une cascade d’annonces : annoncer le résultat global, pas chaque livre déplacé.
- Réduire les animations supprime glissements, pulsations et transitions de localisation ; l’état final et le focus suffisent.
- Zoom 200 % et reflow 400 % : texte et commandes restent disponibles sans défilement bidimensionnel du chrome. À 320 CSS px, navigation, actions, erreurs, confirmations et détails sortent du canevas spatial et refluent sur un seul axe ; seule la représentation physique du meuble conserve deux axes.
- Réglages WCAG 1.4.12 : hauteur de ligne 1,5×, espace après paragraphe 2×, lettres 0,12× et mots 0,16× sans perte, chevauchement ni contrôle masqué.
- Chaque région défilante est nommée, focalisable, possède une entrée et une sortie clavier prévisibles et ne coupe jamais la barre d’actions à ses bords.
- Contrastes et palettes suivent `DESIGN.md`; les repères colorés possèdent libellé, motif ou icône.
- Les dialogues piègent correctement le focus, `Échap` annule quand l’action n’est pas engagée, et le focus revient au déclencheur.
- Les dates ne dépendent pas d’un calendrier tactile : saisie clavier et format explicite sont disponibles.

## Responsive & Platform

| Contexte | Comportement |
|---|---|
| Ordinateur large | Un ou deux modules peuvent être visibles côte à côte à leur largeur de référence ; axe horizontal disponible pour les suivants. Chrome complet avec gouttière `{spacing.chrome-gutter}`. |
| Ordinateur étroit / tablette paysage | Un module prioritaire, panneau secondaire en volet ; navigation de modules visible. |
| Tablette portrait | Un module non compressé ; défilement horizontal entre modules et vertical entre Étagères dans le viewport dédié. Cibles `{spacing.touch-target}` et barres contextuelles repositionnées pour rester visibles. |
| Téléphone | Hors MVP. Aucun compromis téléphone ne doit dégrader la conception ordinateur/tablette. |

La souris, le tactile et le clavier atteignent les mêmes résultats. Le thème suit `prefers-color-scheme` par défaut, avec choix Système / Clair / Sombre. La préférence de réduction des animations suit le système et peut être renforcée dans les réglages.

## Invariants et limites opérationnelles

| Sujet | Contrat |
|---|---|
| Position restaurée absente | Résoudre par identifiant stable ; si le module n’existe plus, ouvrir le module existant le plus proche et annoncer le changement. |
| Concurrence de rangement | Chaque mutation porte une version. En cas de divergence locale/distante, aucune écriture « dernier arrivé gagne » silencieuse : montrer les deux états et demander lequel conserver. |
| Modules | La création du module suivant est atomique. Les modules intermédiaires vides restent pour préserver les positions ; seuls les modules terminaux vides peuvent disparaître. |
| Retrait d’Exemplaire | Détacher l’Exemplaire de ses groupes ; supprimer un groupe devenu vide. Une Lecture active et les données personnelles sont nommées séparément dans la confirmation. |
| Achat | Chaque requête réutilise une clé stable jusqu’au reçu autoritatif. Un produit déclare `unique` ou `multiple` ; seul `multiple` peut augmenter une quantité possédée. |
| Progression | Pages lues : entier ≥ 0 ; si la pagination est connue, valeur ≤ total. Atteindre le total ne termine rien. |
| Dates | La date de fin ne peut précéder la date de début. La double soumission de « Terminer » est verrouillée et réutilise le même identifiant de fin. |
| Changement cosmétique | Revérifier la possession d’un ornement à l’application ; en cas d’échec, conserver le style courant et tout le rangement. |
| Relecture | Créer une nouvelle Lecture sans modifier les précédentes. Réserver l’emplacement Terminés, afficher l’Exemplaire dans En cours, puis le restaurer après fin ; aucune relecture ne recrédite une première Lecture. |

## Inspiration & Anti-patterns

- Retenir l’immédiateté d’un rangement physique : position stable, Tranches jointives, objets intercalés.
- Retenir de la Boutique en ligne : comparaison lisible, prix, possession, solde et confirmation.
- Rejeter la grille de Couvertures comme accueil ; elle existe seulement comme vue secondaire de Terminés.
- Rejeter les fausses bibliothèques schématiques, les livres génériques uniformisés, les corniches et plinthes.
- Rejeter la gamification théâtrale, les récompenses anticipées et toute capacité payante.

## Key Flows

### UJ-1 — Zan termine une lecture et personnalise son étagère

**Protagoniste UX : Romane, heureuse d’avoir terminé un livre, sur son ordinateur.**

1. Romane ouvre l’Exemplaire dans En cours et accède à sa Fiche.
2. Elle renseigne la date de fin, éventuellement sa note et son commentaire, puis choisit explicitement « Terminer la Lecture ».
3. La date est validée ; `dialogue-confirmation` récapitule et verrouille une seule soumission. La progression en pages, renseignée ou non, ne conditionne rien.
4. Après succès, `revelation-pieces` affiche discrètement le montant gagné et le nouveau solde.
5. L’Exemplaire rejoint Terminés dans `panneau-a-ranger`. Romane peut différer sans rien perdre.
6. Elle choisit « Ranger maintenant », puis module, Étagère et position ; la prévisualisation montre l’insertion.
7. **Climax : Romane voit la véritable Tranche de son nouveau livre installée à l’endroit choisi dans sa bibliothèque principale agrandie.**
8. Plus tard, elle peut ouvrir la Boutique, acheter un Bibelot, le retrouver dans l’inventaire et le placer ; les livres se réorganisent autour.

Échec : si la fin ne se sauvegarde pas, l’Exemplaire reste En cours et aucun gain n’est montré. Si seule l’attribution des Pièces échoue après la Lecture, le statut reste Terminés, le crédit est signalé en attente et le réessai idempotent.

### UJ-2 — Zan ajoute et range un livre trouvé dans le Catalogue

**Protagoniste : Romane, devant son ordinateur, veut ajouter l’Édition exacte qu’elle possède.**

1. Romane ouvre « Rechercher dans le Catalogue », distinct de la recherche interne.
2. Elle cherche une Œuvre et ouvre la Fiche complète du candidat normalisé depuis un résultat, sans mutation du Catalogue canonique.
3. Elle compare les Éditions et en choisit une dans `selecteur-edition`.
4. Elle active « Ajouter à ma bibliothèque », puis confirme Envie de lire ; En cours et Terminés restent indisponibles tant qu’aucune Reading valide n’existe.
5. Couverture et Tranche par défaut de l’Édition sont appliquées automatiquement.
6. L’Exemplaire rejoint atomiquement la fin du dernier module réel d’Envie de lire.
7. **Climax : Romane voit la Tranche de l’Édition exacte prendre place dans la destination choisie.**

Échec : si l’ajout échoue, aucun Exemplaire fantôme n’apparaît ; la Fiche, l’Édition et la destination choisies restent prêtes à être réessayées.

### UJ-3 — Zan ajoute un livre absent du Catalogue

**Protagoniste : Romane, sur tablette, possède une Édition introuvable.**

1. La recherche Catalogue ne trouve pas le bon résultat ; Romane choisit « Ajouter manuellement ».
2. Elle saisit le titre et importe une Couverture, puis complète facultativement auteur, résumé, pagination, Série, tome, date, ISBN et Édition.
3. Un ISBN identique bloque la recréation et propose l’Œuvre/Édition existante avec « Ajouter un autre Exemplaire » ; une forte similarité déclenche un avertissement mais permet « Créer quand même » après examen.
4. Romane confirme qu’elle dispose du droit d’utiliser l’image.
5. Le système privilégie une Tranche authentique ; sinon il génère un fallback provisoire depuis la Couverture, le titre et le numéro de volume.
6. Elle choisit le statut et confirme l’ajout.
7. **Climax : l’Édition absente devient un Exemplaire reconnaissable par sa Tranche et manipulable dans sa bibliothèque.**

Échec : source externe indisponible ou génération de Tranche échouée ne bloque pas la saisie ; un placeholder textuel accessible reste remplaçable et l’intention est conservée.

### UJ-4 — Zan retrouve et réorganise une collection importante

**Protagoniste : Romane, avec plus de cent Exemplaires, cherche une édition collector précise.**

1. Elle ouvre « Rechercher dans ma bibliothèque ».
2. Les correspondances affichent séparément chaque Exemplaire/Édition avec Couverture, statut et identification.
3. Elle choisit l’édition collector ; l’application va au bon statut, module et Étagère.
4. La Tranche reçoit focus, contour, bref repère de localisation et annonce textuelle ; aucun livre ne bouge.
5. Romane ouvre la barre d’actions, démarre une sélection, ajoute d’autres tomes et crée un groupe durable transversal.
6. Dans Terminés, elle déplace ensemble les membres visibles du groupe par drag ou commande de destination.
7. **Climax : toute la série terminée se retrouve en un bloc ordonné, tandis que les tomes En cours et Envie de lire restent reliés au groupe global.**

Échec : une destination trop petite refuse l’opération entière et restitue exactement l’ordre précédent.

### Parcours — Suivre une Lecture sans la terminer

**Protagoniste : Romane, en pause de lecture sur tablette.**

1. Elle ouvre En cours puis `panneau-lectures-en-cours`.
2. Elle repère la Couverture, le titre, la date de début et « pages lues / total ».
3. Elle met à jour les pages et choisit Enregistrer.
4. Si la valeur atteint le total, rien d’autre ne se déclenche.
5. **Climax : la progression mise à jour est visible au-dessus de sa bibliothèque, sans pression à déclarer la fin.**

Échec : la saisie invalide reste dans le champ avec une explication ; une erreur réseau conserve la valeur pour Réessayer.

### Parcours — Acheter, placer puis retirer un Bibelot

**Protagoniste : Romane, qui veut utiliser ses Pièces sans interrompre son rangement.**

1. Elle ouvre la Boutique autonome et voit son solde.
2. Elle consulte une `carte-produit`, son prix, son état et sa multiplicité, puis confirme l’achat.
3. L’achat atomique débite une seule fois et ajoute l’objet à `inventaire-objets`; elle peut quitter sans le placer.
4. Depuis Terminés, elle ouvre l’inventaire, choisit l’objet, une Étagère et un intervalle.
5. La prévisualisation réorganise les Exemplaires. Si l’espace manque, le dépôt est rouge, marqué et expliqué.
6. Elle confirme un emplacement compatible.
7. **Climax : le Bibelot s’intercale et la rangée se reforme proprement autour de lui sans rangement manuel.**
8. Plus tard, elle le retire ; il revient Disponible dans l’inventaire.

Échec : achat échoué = aucun débit ; placement impossible = aucune réorganisation partielle.

### Parcours — Personnaliser la bibliothèque

**Protagoniste : Romane, lors de sa première connexion puis plusieurs mois plus tard.**

1. L’onboarding présente plusieurs structures gratuites avec aperçus réalistes.
2. Romane choisit une structure, puis une finition (par exemple blanc, marron ou effet bois).
3. Elle revient en arrière si nécessaire, puis confirme.
4. **Climax : sa collection apparaît dans une bibliothèque qui lui ressemble, sans que le produit ait présumé son goût.**
5. Plus tard, elle ouvre « Personnaliser ma bibliothèque », prévisualise un autre style ou un ornement acquis et l’applique.
6. Tous les Exemplaires, groupes et Bibelots gardent strictement leurs positions.

Échec : si l’application du style échoue, l’ancien style reste actif et le rangement est inchangé.

### Parcours — Se reconnecter et retrouver sa place

**Protagoniste : Romane, de retour sur son ordinateur après l’expiration de sa session.**

1. Romane demande Terminés depuis un favori ou rouvre l’application.
2. La session expirée ouvre Connexion en conservant la destination demandée.
3. Elle s’authentifie ; en cas d’erreur, la saisie reste présente et le champ concerné est expliqué.
4. L’application résout la dernière position par identifiants stables.
5. **Climax : Romane revient au même statut, au même module et à la même Tranche, ou au voisin valide le plus proche avec une explication.**

Échec : si la reprise des données échoue après connexion, Romane reste authentifiée, voit un état de reprise et peut Réessayer sans être renvoyée au formulaire.
