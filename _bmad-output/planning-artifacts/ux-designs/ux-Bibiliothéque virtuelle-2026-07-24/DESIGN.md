---
name: My BookShelf
description: Système visuel d’une bibliothèque numérique réaliste, personnelle et manipulable, entourée d’un chrome discret.
status: final
sources:
  - ../../prds/prd-Bibiliothéque virtuelle-2026-07-24/prd.md
  - ../../prds/prd-Bibiliothéque virtuelle-2026-07-24/addendum.md
updated: 2026-07-27
colors:
  surface-base: '#FAFAF9'
  surface-raised: '#FFFFFF'
  surface-subtle: '#F5F5F4'
  surface-overlay: '#FFFFFF'
  ink-primary: '#1C1917'
  ink-secondary: '#57534E'
  ink-disabled: '#A8A29E'
  border-default: '#D6D3D1'
  border-strong: '#78716C'
  accent: '#9A3412'
  accent-hover: '#7C2D12'
  accent-soft: '#FFF0E6'
  on-accent: '#FFFFFF'
  link: '#9A3412'
  focus: '#9A3412'
  focus-light: '#FFFFFF'
  focus-dark-contrast: '#171412'
  success: '#166534'
  success-soft: '#DCFCE7'
  warning: '#92400E'
  warning-soft: '#FEF3C7'
  error: '#B91C1C'
  error-soft: '#FEE2E2'
  surface-base-dark: '#171412'
  surface-raised-dark: '#211D1A'
  surface-subtle-dark: '#29231F'
  surface-overlay-dark: '#302925'
  ink-primary-dark: '#FAFAF9'
  ink-secondary-dark: '#D6D3D1'
  ink-disabled-dark: '#78716C'
  border-default-dark: '#57534E'
  border-strong-dark: '#A8A29E'
  accent-dark: '#FDBA74'
  accent-hover-dark: '#FED7AA'
  accent-soft-dark: '#4A2415'
  on-accent-dark: '#431407'
  link-dark: '#FED7AA'
  focus-dark: '#FDBA74'
  success-dark: '#86EFAC'
  success-soft-dark: '#143D25'
  warning-dark: '#FCD34D'
  warning-soft-dark: '#422D12'
  error-dark: '#FCA5A5'
  error-soft-dark: '#481B1B'
  scrim: '#000000'
typography:
  display:
    fontFamily: 'Lora, Georgia, serif'
    fontSize: 36px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: '-0.015em'
  heading-lg:
    fontFamily: 'Lora, Georgia, serif'
    fontSize: 28px
    fontWeight: '600'
    lineHeight: '1.25'
  heading-md:
    fontFamily: 'Lora, Georgia, serif'
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
  heading-sm:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 18px
    fontWeight: '650'
    lineHeight: '1.4'
  body:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.55'
  body-strong:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 16px
    fontWeight: '650'
    lineHeight: '1.45'
  label:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.35'
  meta:
    fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 4px
  md: 8px
  lg: 12px
  xl: 16px
  full: 9999px
  DEFAULT: 8px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  '10': 40px
  '12': 48px
  '16': 64px
  chrome-gutter: 24px
  tablet-gutter: 20px
  touch-target: 48px
  pointer-target: 44px
  module-gap: 24px
components:
  navigation-principale:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    active: '{colors.accent}'
    border: '{colors.border-default}'
    height: 64px
  navigateur-de-modules:
    background: '{colors.surface-subtle}'
    foreground: '{colors.ink-primary}'
    active: '{colors.accent}'
    radius: '{rounded.full}'
  module-de-bibliotheque:
    background: transparent
    foreground: '{colors.ink-primary}'
    moduleWidth: 560px
    shelfDepthShadow: '0 8px 18px rgba(28,25,23,0.16)'
  etagere:
    background: transparent
    invalid: '{colors.error}'
    valid: '{colors.accent}'
    thickness: 16px
  tranche:
    fallbackForeground: '{colors.ink-primary}'
    fallbackBackground: '{colors.surface-subtle}'
    focus: '{colors.focus}'
    focusLight: '{colors.focus-light}'
    focusDark: '{colors.focus-dark-contrast}'
    radius: '{rounded.sm}'
  barre-actions-contextuelles:
    background: '{colors.surface-overlay}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border-strong}'
    radius: '{rounded.md}'
    shadow: '0 8px 24px rgba(0,0,0,0.18)'
  panneau-a-ranger:
    background: '{colors.warning-soft}'
    foreground: '{colors.ink-primary}'
    border: '{colors.warning}'
    radius: '{rounded.lg}'
  vue-couvertures:
    background: '{colors.surface-base}'
    foreground: '{colors.ink-primary}'
    gap: '{spacing.4}'
  panneau-lectures-en-cours:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border-default}'
    radius: '{rounded.lg}'
  recherche-interne:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    active: '{colors.accent-soft}'
    radius: '{rounded.md}'
  recherche-catalogue:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    active: '{colors.accent-soft}'
    radius: '{rounded.md}'
  fiche-oeuvre:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border-default}'
    radius: '{rounded.lg}'
  selecteur-edition:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    selected: '{colors.accent-soft}'
    radius: '{rounded.md}'
  groupe-durable:
    background: '{colors.surface-subtle}'
    foreground: '{colors.ink-primary}'
    marker: '{colors.accent}'
    radius: '{rounded.md}'
  inventaire-objets:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border-default}'
    radius: '{rounded.lg}'
  carte-produit:
    background: '{colors.surface-raised}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border-default}'
    radius: '{rounded.lg}'
    shadow: '0 2px 10px rgba(0,0,0,0.08)'
  configurateur-cosmetique:
    background: '{colors.surface-base}'
    foreground: '{colors.ink-primary}'
    selected: '{colors.accent-soft}'
    radius: '{rounded.lg}'
  indicateur-sauvegarde:
    background: transparent
    foreground: '{colors.ink-secondary}'
    success: '{colors.success}'
    error: '{colors.error}'
  revelation-pieces:
    background: '{colors.accent-soft}'
    foreground: '{colors.accent}'
    radius: '{rounded.md}'
  dialogue-confirmation:
    background: '{colors.surface-overlay}'
    foreground: '{colors.ink-primary}'
    border: '{colors.border-default}'
    radius: '{rounded.lg}'
    shadow: '0 18px 50px rgba(0,0,0,0.24)'
---

## Brand & Style

My BookShelf donne d’abord l’impression d’une véritable bibliothèque personnelle, pas d’une grille de données déguisée. Les Tranches jointives, posées sur leur tablette, les proportions crédibles et une profondeur matérielle mesurée portent cette illusion. Le résultat reste calme et manipulable : le réalisme sert le repérage spatial, jamais le spectaculaire.

Deux couches visuelles ne se mélangent pas :

- le **chrome applicatif** est neutre, stable, lisible et proche d’un site marchand contemporain ;
- le **meuble** est cosmétique, réaliste et personnalisable, sans jamais modifier la géométrie logique ni le rangement.

La direction est un hybride entre le réalisme fonctionnel de la piste A et l’ouverture de la piste C. Le module est un cadre simple carré ou rectangulaire : montants droits et tablettes, sans corniche, socle, plinthe ni rebord débordant. Le premier choix n’est pas imposé : l’onboarding propose plusieurs structures et finitions gratuites, modifiables ensuite. Les ornements achetés avec des Pièces restent purement cosmétiques.

Les aperçus exploratoires rejetés dans `.working/` ne font pas autorité. Seul le [comparatif Ambre cuivre](.working/color-themes-accent-marque.html) documente un choix retenu. En cas de conflit avec tout aperçu ou prototype, ce spine et `EXPERIENCE.md` prévalent.

## Colors

Le chrome utilise des surfaces neutres chaudes en clair et des bruns-noirs sobres en sombre. Le thème suit le système par défaut et peut être forcé en Clair ou Sombre. Le style du meuble n’altère jamais ces tokens.

- **Ambre cuivre** : `{colors.accent}` en clair et `{colors.accent-dark}` en sombre. Réservé aux actions principales, onglet actif, liens, sélection et focus. Les fonds doux sont `{colors.accent-soft}` et `{colors.accent-soft-dark}`.
- **Encres** : `{colors.ink-primary}` / `{colors.ink-primary-dark}` pour le contenu essentiel ; les métadonnées utilisent les variantes secondaires.
- **États** : succès, avertissement et erreur associent toujours couleur, icône et texte. Un dépôt impossible utilise `{colors.error}` mais ne repose jamais sur le rouge seul.
- **Contraste** : texte courant et commandes visent au minimum 4,5:1 ; grands textes 3:1 ; limites et indicateurs de focus 3:1 par rapport aux couleurs adjacentes. `{colors.on-accent}` sur `{colors.accent}` et `{colors.on-accent-dark}` sur `{colors.accent-dark}` sont les combinaisons obligatoires. Sur une image non contrôlée, le focus associe deux contours adjacents `{colors.focus-light}` et `{colors.focus-dark-contrast}`, complétés par le repère Ambre cuivre : il ne repose jamais sur une seule couleur.

Les couleurs authentiques d’une Couverture ou d’une Tranche ne sont pas remappées dans la palette de marque. Les repères colorés personnels possèdent toujours une forme, un motif ou un libellé associé.

## Typography

`{typography.display}` et les titres éditoriaux utilisent Lora, avec Georgia en repli. Ils évoquent l’édition imprimée sans transformer l’interface en pastiche. Menus, formulaires, Boutique et messages utilisent Inter ou la sans serif système via `{typography.body}`.

Les grands titres sont rares. Aucun contrôle n’utilise une serif décorative. Le redimensionnement à 200 %, les préférences de taille du navigateur et les traductions plus longues ne provoquent ni troncature ni chevauchement.

Une Tranche authentique conserve strictement la typographie, les logos, les couleurs et la composition de son Édition. Elle n’utilise jamais la typographie My BookShelf. Le fallback généré compose le titre, le numéro de volume lorsqu’il existe et un fragment pertinent de la Couverture ; l’auteur n’est pas obligatoire. Il est explicitement présenté comme provisoire et remplaçable.

## Layout & Spacing

Le chrome suit une grille de 4 px, avec `{spacing.4}` comme espacement courant et `{spacing.chrome-gutter}` comme gouttière ordinateur. Les commandes tactiles mesurent au moins `{spacing.touch-target}` ; les commandes pointeur gardent une surface d’activation d’au moins `{spacing.pointer-target}`.

Un `module-de-bibliotheque` conserve une largeur de référence stable de 560 px. Un seul module apparaît au départ ; le suivant est créé à droite lorsque le précédent est plein. L’axe vertical parcourt les Étagères du module, l’axe horizontal parcourt les modules du statut actif. Les modules ne sont jamais comprimés pour en faire tenir davantage.

Les livres d’une rangée sont Tranche contre Tranche, sans intervalle décoratif, et reposent directement sur l’Étagère. Un Bibelot intercalé crée uniquement l’espace qu’il occupe. Les éléments non déplacés conservent autant que possible leur ordre relatif.

## Elevation & Depth

La profondeur réaliste appartient au meuble et aux objets physiques : veinage ou matière crédible, ombres de contact sous les livres et Bibelots, obscurcissement léger du fond. Pas de perspective forcée qui déforme les Tranches.

Le chrome emploie la profondeur avec parcimonie : bordures tonales pour les panneaux, ombre courte pour `carte-produit` et `barre-actions-contextuelles`, ombre plus nette pour `dialogue-confirmation`. Aucune texture de bois, cuir ou papier dans les menus et formulaires.

## Shapes

Le chrome utilise `{rounded.md}` pour les contrôles, `{rounded.lg}` pour les panneaux et `{rounded.full}` uniquement pour indicateurs compacts. Les meubles restent géométriques, à angles droits ou très légèrement adoucis selon le matériau. Une Tranche respecte la forme de l’Édition réelle ; le fallback n’ajoute qu’un rayon discret `{rounded.sm}`.

## Components

Références visuelles promues : [fin de Lecture](mockups/key-fin-lecture.html) pour `revelation-pieces` et `panneau-a-ranger`, et [Boutique](mockups/key-boutique.html) pour `carte-produit` et les états d’achat. Elles illustrent le chrome ; ce spine prévaut en cas de conflit.

| Composant | Spécification visuelle |
|---|---|
| `navigation-principale` | Barre neutre stable ; trois statuts lisibles, actif indiqué par texte renforcé, marque Ambre cuivre et repère non chromatique. |
| `navigateur-de-modules` | Commandes précédent/suivant et position « Module n sur N » ; suffisamment séparées des zones de manipulation. |
| `module-de-bibliotheque` | Cadre rectangulaire réaliste, largeur stable, habillage cosmétique interchangeable ; aucune corniche ni plinthe. |
| `etagere` | Tablette matérielle continue ; cible de dépôt matérialisée par insertion et libellé. État invalide : rouge + symbole + message. |
| `tranche` | Image authentique de l’Édition prioritaire ; focus externe à deux tons clair/sombre autour de toute la cible, complété par l’Ambre cuivre, sans masquer l’artwork. Focus, sélection et erreur restent simultanément distinguables. Fallback éditorial crédible. |
| `barre-actions-contextuelles` | Petite barre ancrée au-dessus de la cible, icône et libellé accessible pour chaque action ; ne masque pas la Tranche active. |
| `panneau-a-ranger` | Zone temporaire clairement nommée dans Terminés seulement ; avertissement doux, jamais assimilé à un échec. |
| `vue-couvertures` | Couvertures de Terminés en liste/grille régulière ; ratio original préservé, titre accessible sous chaque image. |
| `panneau-lectures-en-cours` | Liste compacte avec Couverture, titre, date et pages ; champs et action d’enregistrement alignés. |
| `recherche-interne` | Surface distincte, résultats par Exemplaire avec Couverture, statut et Édition ; sélection visible. |
| `recherche-catalogue` | Surface distincte à la présentation marchande sobre ; résultats centrés sur l’Œuvre puis ses Éditions. |
| `fiche-oeuvre` | Hiérarchie éditoriale légère ; Couverture et métadonnées d’Édition séparées des données personnelles et Lectures. |
| `selecteur-edition` | Cartes comparables avec Couverture, ISBN, pagination et date ; sélection par contour, radio et texte. |
| `groupe-durable` | Nom, nombre total et répartition par statut ; repère visuel non dépendant de la couleur. |
| `inventaire-objets` | Collection possédée en panneau ou page ; cartes marquées Disponible/Placé, avec quantité si applicable. |
| `carte-produit` | Visuel, nom, catégorie, prix en Pièces, état Disponible/Possédé/Solde insuffisant et action unique. |
| `configurateur-cosmetique` | Choix progressifs structure puis finition, aperçu fidèle, options de base gratuites clairement distinguées. |
| `indicateur-sauvegarde` | Texte compact « Sauvegarde… », « Enregistré » ou erreur ; icône seulement en renfort. |
| `revelation-pieces` | Montant gagné et nouveau solde dans une apparition discrète, sans pluie de confettis ni plein écran. |
| `dialogue-confirmation` | Conséquence explicite, action primaire nommée, annulation visible ; suppression personnelle séparée et non présélectionnée. |

## Do's and Don'ts

| À faire | À éviter |
|---|---|
| Montrer les vraies Tranches de chaque Édition et préserver leur identité | Uniformiser les livres avec la police ou les couleurs du site |
| Poser les livres sur la tablette et les joindre bord à bord | Laisser des vides décoratifs entre livres ou sous leur base |
| Garder le chrome neutre pendant que le meuble change de style | Appliquer textures de meuble aux menus, formulaires ou Boutique |
| Permettre plusieurs styles gratuits, compatibles avec tout rangement | Monétiser capacité, module, place ou fonction |
| Associer couleur, texte, forme et icône pour les états | Communiquer sélection, erreur ou focus par couleur seule |
| Utiliser des animations brèves et interruptibles | Théâtraliser les Pièces ou déplacer les éléments sans contrôle |
| Préserver proportions, lisibilité et cible tactile des Tranches | Compresser un module pour afficher plus de bibliothèques |
| Prévisualiser un changement cosmétique sans toucher au rangement | Replacer livres ou Bibelots lors d’un changement de style |
