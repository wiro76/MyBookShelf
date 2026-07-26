# Revue accessibilité — WCAG 2.2 AA

**Périmètre :** `DESIGN.md`, `EXPERIENCE.md`, `.memlog.md`, PRD et addendum ; MVP ordinateur et tablette.  
**Verdict :** contrat solide mais **non validable WCAG 2.2 AA en l’état** tant que les lacunes ci-dessous ne sont pas intégrées aux spines.  
**Comptage :** 0 critique · 2 haute · 5 moyenne · 0 basse.

## Lacunes

### A11Y-01 — Haute — Le focus sur une Tranche n’est pas garanti sur un visuel arbitraire

**Emplacement :** `DESIGN.md`, lignes 240–245 et 281 ; `EXPERIENCE.md`, lignes 147 et 153.

Le contrat impose un focus Ambre cuivre externe à 3:1, mais les Tranches et Couvertures authentiques conservent des couleurs non contrôlées. Une seule couleur de contour ne peut donc pas garantir 3:1 contre chaque artwork, meuble ou ombre adjacent. Le focus peut devenir imperceptible sur certaines Éditions, contrairement à WCAG 2.2 — 2.4.11 et 1.4.11.

**Correctif :** imposer pour toute cible placée sur un contenu visuel non contrôlé un indicateur à deux tons indépendant de l’artwork (par exemple contour clair interne + contour sombre/Ambre externe, ou halo sur fond neutre), entourant toute la cible, avec au moins 3:1 contre chaque couleur adjacente. Définir également les états focus + sélection, focus + erreur et thème sombre, sans que la sélection masque le focus.

### A11Y-02 — Haute — Le viewport spatial n’a pas de modèle sémantique et clavier complet

**Emplacement :** `EXPERIENCE.md`, lignes 68–70, 117, 133–135, 147–152 et 159–163 ; `DESIGN.md`, lignes 259–261.

Le contrat fixe deux axes de défilement, des boutons de module et un « ordre logique », mais ne définit ni l’ordre de lecture programmatique, ni la stratégie de tabulation dans une collection de 100+ Exemplaires, ni l’entrée/sortie du viewport, ni la révélation automatique d’une cible focalisée hors écran. Il ne précise pas non plus comment un utilisateur clavier fait défiler les Étagères sans déplacer accidentellement la page. Une implémentation peut donc être conforme visuellement tout en rendant des livres inatteignables, en imposant des centaines d’arrêts `Tab`, ou en désynchronisant focus, lecture et position visible (WCAG 2.2 — 1.3.1, 2.1.1, 2.4.3, 2.4.11).

**Correctif :** définir une structure sémantique stable `statut > module > étagère > exemplaire`, avec noms et positions annoncés ; choisir explicitement une navigation composite (par exemple un seul arrêt `Tab` par module puis flèches/Home/End/PageUp/PageDown, ou une liste structurée équivalente). Spécifier : entrée et sortie prévisibles du viewport, focus restauré par identifiant d’Exemplaire, mise en vue automatique sans animation obligatoire, commandes clavier distinctes pour module précédent/suivant et Étagère précédente/suivante, et ordre DOM identique à l’ordre logique même lorsque deux modules sont visibles. Le scroll natif tactile/souris reste disponible, mais ne remplace pas ces commandes.

### A11Y-03 — Moyenne — La barre d’actions contextuelles n’a pas de contrat de focus ni de sémantique

**Emplacement :** `EXPERIENCE.md`, lignes 71–72 et 123–127 ; `DESIGN.md`, ligne 282.

Une commande « Actions » est mentionnée, mais son caractère réellement visible et persistant n’est pas fixé. Après ouverture, l’ordre de focus dans la barre, son rôle, sa relation à la Tranche/Bibelot et le retour du focus à la fermeture ne sont pas définis. « Action extérieure » décrit seulement une fermeture au pointeur. Cela laisse possibles une barre inaccessible au tactile sans appui maintenu et une perte de focus au clavier.

**Correctif :** exiger sur chaque cible, ou pour la cible actuellement focalisée/sélectionnée, un bouton nommé « Actions pour [titre/objet] » atteignable sans survol ni appui maintenu. Définir la barre comme menu non modal ou popover nommé, relié au déclencheur (`aria-expanded`/`aria-controls` lorsque pertinent), avec focus initial sur la première action, navigation documentée, `Échap` et bouton Fermer, puis retour du focus au déclencheur même après fermeture extérieure. Ne jamais faire de l’appui maintenu la seule façon tactile de la découvrir.

### A11Y-04 — Moyenne — Les dialogues ne spécifient pas assez leur nom, description et focus initial

**Emplacement :** `EXPERIENCE.md`, lignes 86 et 154 ; `DESIGN.md`, ligne 296.

Le piège et le retour du focus sont prévus, mais pas le nom accessible, l’association programmatique de la conséquence, le focus initial, ni le comportement lorsque le déclencheur disparaît après retrait. Pour une suppression ou un achat, un focus initial mal choisi peut provoquer une action destructive involontaire (WCAG 2.2 — 1.3.1, 2.4.3, 3.3.4, 4.1.2).

**Correctif :** imposer un dialogue modal nommé par son titre et décrit par le texte de conséquence ; placer le focus initial sur l’action sûre (Annuler) pour retrait/suppression et sur le premier contrôle pertinent pour les autres confirmations ; conserver une action primaire au libellé spécifique. Après succès si le déclencheur n’existe plus, envoyer le focus vers le prochain Exemplaire logique, le panneau « À ranger », l’inventaire ou le titre de la surface, selon l’action, et annoncer le résultat une seule fois.

### A11Y-05 — Moyenne — Les erreurs de formulaire ne sont pas reliées aux champs

**Emplacement :** `EXPERIENCE.md`, lignes 97–103, 116 et 149–155 ; parcours « Suivre une Lecture sans la terminer », état d’échec.

Le contrat prévoit texte, conservation de valeur, réessai et annonce, mais pas l’identification programmatique du champ en erreur, l’association du message, un résumé pour plusieurs erreurs, ni la règle de focus après soumission. Les imports, dates, pagination, ISBN, progression et formulaires de Fiche peuvent donc annoncer « invalide » sans permettre de trouver ou comprendre la correction (WCAG 2.2 — 3.3.1, 3.3.2, 3.3.3 et 4.1.3).

**Correctif :** exiger libellé persistant, erreur textuelle adjacente reliée au champ (`aria-describedby`/`aria-errormessage` et `aria-invalid` lorsque pertinent), proposition de correction concrète et conservation de la saisie. Après soumission, focaliser un résumé d’erreurs lié à chaque champ lorsqu’il y en a plusieurs, sinon le premier champ invalide. Les erreurs réseau globales utilisent une alerte distincte et ne doivent pas effacer les erreurs de validation.

### A11Y-06 — Moyenne — « Achat désactivé » peut rendre l’explication inaccessible

**Emplacement :** `EXPERIENCE.md`, lignes 82 et 115 ; `DESIGN.md`, ligne 292.

Un bouton HTML `disabled` est normalement retiré de l’ordre de tabulation. Si l’explication du solde insuffisant n’est associée qu’à ce contrôle, un utilisateur clavier ou lecteur d’écran peut ne jamais l’atteindre. La carte pourrait aussi annoncer le prix sans annoncer le manque exact.

**Correctif :** garder prix, solde requis et manque en texte permanent dans la carte. Utiliser soit une action absente accompagnée d’un statut explicite, soit un contrôle focusable avec `aria-disabled="true"` et description associée ; son activation ne déclenche rien et réannonce sobrement la raison. Ne pas utiliser seulement une apparence grisée.

### A11Y-07 — Moyenne — Le reflow ne couvre pas les réglages d’espacement de texte ni les pièges de scroll imbriqué

**Emplacement :** `DESIGN.md`, lignes 249–257 ; `EXPERIENCE.md`, lignes 152 et 159–163.

Le zoom 200 % et le reflow 400 % sont cités, mais le contrat ne garantit pas l’adaptation aux espacements de texte de WCAG 1.4.12. La largeur fixe de 560 px et les deux axes dans un viewport dédié sont admissibles pour la représentation spatiale, mais aucune règle ne garantit que titres, messages, commandes et barres contextuelles restent hors de ce canevas, ni que l’utilisateur puisse atteindre et quitter chaque zone de scroll sans piège.

**Correctif :** ajouter les valeurs de test de 1.4.12 (hauteur de ligne 1,5 ; espace après paragraphe 2× ; espacement des lettres 0,12× ; mots 0,16×) sans perte ni chevauchement. Limiter l’exception de défilement bidimensionnel au rendu physique du meuble ; rendre les actions, erreurs, confirmations, navigation et détails disponibles dans un chrome reflué à 320 CSS px. Nommer chaque région défilante, rendre son focus visible, permettre d’y entrer et d’en sortir au clavier, et éviter tout contrôle contextuel coupé ou masqué aux bords.

## Points déjà couverts

Le contrat couvre correctement, sous réserve d’implémentation : alternatives au glisser-déposer et aux gestes, absence de dépendance au survol/couleur, cibles tactiles, réduction des animations, annonces globales sans cascade lors du reflow, atomicité et reprise des sauvegardes, localisation d’un Exemplaire, sélection ponctuelle/durable, et distinction sémantique Œuvre/Édition/Exemplaire.
